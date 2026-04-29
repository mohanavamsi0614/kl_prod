/**
 * Google Calendar Client for Recurring Task Events
 * 
 * Extends the existing Google Calendar integration to support
 * RRULE-based recurring events for tasks.
 */

import { google, calendar_v3 } from 'googleapis';
import { TokenManager } from './TokenManager';
import logger from '../utils/logger';
import { RRuleOptions, generateRRule, parseRRule } from '../utils/rrule';

/**
 * Get an authenticated Google Calendar client
 */
export const getCalendarClient = async (connectionId: string): Promise<calendar_v3.Calendar> => {
  const accessToken = await TokenManager.getValidAccessToken(connectionId);
  
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Google OAuth credentials not configured');
  }
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  
  oauth2Client.setCredentials({ access_token: accessToken });
  
  return google.calendar({ version: 'v3', auth: oauth2Client });
};

/**
 * Task event data structure for creating calendar events
 */
export interface TaskEventData {
  title: string;
  description?: string;
  dueDate: Date;
  duration?: number; // Duration in minutes (default: 30)
  rrule?: string;    // RRULE string for recurrence
  reminders?: {
    method: 'email' | 'popup';
    minutes: number;
  }[];
  taskId?: string;   // Local task ID for reference
}

/**
 * Recurring event response
 */
export interface RecurringEventResponse {
  eventId: string;
  htmlLink?: string;
  recurringEventId?: string;
  instances?: calendar_v3.Schema$Event[];
}

/**
 * Create a recurring event in Google Calendar for a task
 */
export const createRecurringTaskEvent = async (
  connectionId: string,
  data: TaskEventData
): Promise<RecurringEventResponse> => {
  const calendar = await getCalendarClient(connectionId);
  
  // Calculate start and end times
  const startTime = new Date(data.dueDate);
  const endTime = new Date(startTime);
  endTime.setMinutes(endTime.getMinutes() + (data.duration || 30));
  
  // Build the event
  const event: calendar_v3.Schema$Event = {
    summary: data.title,
    description: buildEventDescription(data),
    start: {
      dateTime: startTime.toISOString(),
      timeZone: 'UTC'
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: 'UTC'
    },
    // Add recurrence if RRULE is provided
    recurrence: data.rrule ? [`RRULE:${data.rrule}`] : undefined,
    // Set reminders
    reminders: data.reminders ? {
      useDefault: false,
      overrides: data.reminders.map(r => ({
        method: r.method,
        minutes: r.minutes
      }))
    } : { useDefault: true },
    // Extended properties to link back to task
    extendedProperties: {
      private: {
        ProductivityTaskId: data.taskId || '',
        source: 'Productivity'
      }
    }
  };
  
  logger.info({ 
    connectionId, 
    title: data.title, 
    rrule: data.rrule 
  }, 'Creating recurring calendar event');
  
  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: event
  });
  
  const result: RecurringEventResponse = {
    eventId: response.data.id!,
    htmlLink: response.data.htmlLink || undefined,
    recurringEventId: response.data.recurringEventId || undefined
  };
  
  logger.info({ 
    connectionId, 
    eventId: result.eventId 
  }, 'Created recurring calendar event');
  
  return result;
};

/**
 * Update a recurring event in Google Calendar
 */
export const updateRecurringTaskEvent = async (
  connectionId: string,
  eventId: string,
  data: Partial<TaskEventData>,
  updateScope: 'single' | 'all' | 'following' = 'all'
): Promise<RecurringEventResponse> => {
  const calendar = await getCalendarClient(connectionId);
  
  // First, get the existing event
  const existingResponse = await calendar.events.get({
    calendarId: 'primary',
    eventId
  });
  
  const existingEvent = existingResponse.data;
  
  // Build update payload
  const updatePayload: calendar_v3.Schema$Event = {
    ...existingEvent,
    summary: data.title || existingEvent.summary,
    description: data.description !== undefined 
      ? buildEventDescription(data as TaskEventData) 
      : existingEvent.description
  };
  
  // Update times if provided
  if (data.dueDate) {
    const startTime = new Date(data.dueDate);
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + (data.duration || 30));
    
    updatePayload.start = {
      dateTime: startTime.toISOString(),
      timeZone: 'UTC'
    };
    updatePayload.end = {
      dateTime: endTime.toISOString(),
      timeZone: 'UTC'
    };
  }
  
  // Update recurrence if RRULE is provided
  if (data.rrule !== undefined) {
    updatePayload.recurrence = data.rrule ? [`RRULE:${data.rrule}`] : undefined;
  }
  
  logger.info({ 
    connectionId, 
    eventId, 
    updateScope 
  }, 'Updating recurring calendar event');
  
  const response = await calendar.events.update({
    calendarId: 'primary',
    eventId,
    requestBody: updatePayload
  });
  
  return {
    eventId: response.data.id!,
    htmlLink: response.data.htmlLink || undefined,
    recurringEventId: response.data.recurringEventId || undefined
  };
};

/**
 * Delete a recurring event from Google Calendar
 */
export const deleteRecurringTaskEvent = async (
  connectionId: string,
  eventId: string,
  deleteScope: 'single' | 'all' | 'following' = 'all'
): Promise<void> => {
  const calendar = await getCalendarClient(connectionId);
  
  logger.info({ 
    connectionId, 
    eventId, 
    deleteScope 
  }, 'Deleting recurring calendar event');
  
  // For 'all' scope, delete the master event
  // For 'single', we need to use the instance eventId
  await calendar.events.delete({
    calendarId: 'primary',
    eventId
  });
  
  logger.info({ connectionId, eventId }, 'Deleted recurring calendar event');
};

/**
 * Get instances of a recurring event
 */
export const getRecurringEventInstances = async (
  connectionId: string,
  eventId: string,
  options?: {
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
  }
): Promise<calendar_v3.Schema$Event[]> => {
  const calendar = await getCalendarClient(connectionId);
  
  const response = await calendar.events.instances({
    calendarId: 'primary',
    eventId,
    timeMin: options?.timeMin?.toISOString(),
    timeMax: options?.timeMax?.toISOString(),
    maxResults: options?.maxResults || 50
  });
  
  return response.data.items || [];
};

/**
 * Mark a single instance of a recurring event as completed
 * (by adding a status indicator to the event)
 */
export const markRecurringInstanceComplete = async (
  connectionId: string,
  instanceEventId: string
): Promise<void> => {
  const calendar = await getCalendarClient(connectionId);
  
  // Get the instance
  const instanceResponse = await calendar.events.get({
    calendarId: 'primary',
    eventId: instanceEventId
  });
  
  const instance = instanceResponse.data;
  
  // Update the instance to mark it as complete
  await calendar.events.update({
    calendarId: 'primary',
    eventId: instanceEventId,
    requestBody: {
      ...instance,
      summary: `✓ ${instance.summary?.replace(/^✓\s*/, '')}`, // Add checkmark
      colorId: '8', // Gray color to indicate completed
      extendedProperties: {
        ...instance.extendedProperties,
        private: {
          ...instance.extendedProperties?.private,
          taskCompleted: 'true',
          completedAt: new Date().toISOString()
        }
      }
    }
  });
  
  logger.info({ connectionId, instanceEventId }, 'Marked recurring instance as complete');
};

/**
 * Fetch recurring task events from Google Calendar
 */
export const fetchRecurringTaskEvents = async (
  connectionId: string,
  options?: {
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
    includeCompleted?: boolean;
  }
): Promise<calendar_v3.Schema$Event[]> => {
  const calendar = await getCalendarClient(connectionId);
  
  // Default to fetching events from now to 30 days ahead
  const timeMin = options?.timeMin || new Date();
  const timeMax = options?.timeMax || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    maxResults: options?.maxResults || 250,
    singleEvents: true, // Expand recurring events
    orderBy: 'startTime',
    // Filter for Productivity events only
    privateExtendedProperty: ['source=Productivity']
  });
  
  let events = response.data.items || [];
  
  // Filter out completed events if requested
  if (!options?.includeCompleted) {
    events = events.filter((e: calendar_v3.Schema$Event) => 
      e.extendedProperties?.private?.taskCompleted !== 'true'
    );
  }
  
  return events;
};

/**
 * Convert calendar event to task data
 */
export const calendarEventToTask = (event: calendar_v3.Schema$Event): {
  title: string;
  description?: string;
  dueDate?: Date;
  googleCalendarEventId: string;
  isRecurring: boolean;
  rrule?: string;
  isCompleted: boolean;
} => {
  // Extract RRULE from recurrence array
  let rrule: string | undefined;
  if (event.recurrence) {
    const rruleLine = event.recurrence.find(r => r.startsWith('RRULE:'));
    if (rruleLine) {
      rrule = rruleLine.replace('RRULE:', '');
    }
  }
  
  // Parse start time
  let dueDate: Date | undefined;
  if (event.start?.dateTime) {
    dueDate = new Date(event.start.dateTime);
  } else if (event.start?.date) {
    dueDate = new Date(event.start.date);
  }
  
  // Check if completed
  const isCompleted = event.extendedProperties?.private?.taskCompleted === 'true';
  
  return {
    title: event.summary?.replace(/^✓\s*/, '') || 'Untitled Task',
    description: parseEventDescription(event.description),
    dueDate,
    googleCalendarEventId: event.id!,
    isRecurring: !!event.recurringEventId || !!rrule,
    rrule,
    isCompleted
  };
};

/**
 * Build event description with task metadata
 */
function buildEventDescription(data: TaskEventData): string {
  const parts: string[] = [];
  
  if (data.description) {
    parts.push(data.description);
  }
  
  // Add Productivity metadata marker
  parts.push('\n---\n[Productivity Task]');
  
  return parts.join('\n');
}

/**
 * Parse event description to extract task description
 */
function parseEventDescription(description?: string | null): string | undefined {
  if (!description) return undefined;
  
  // Remove Productivity metadata
  const cleaned = description.replace(/\n---\n\[Productivity Task\]$/s, '').trim();
  return cleaned || undefined;
}

/**
 * Create RRULE from simple recurrence options
 */
export const createSimpleRRule = (options: {
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;
  daysOfWeek?: ('SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA')[];
  dayOfMonth?: number;
  endDate?: Date;
  occurrences?: number;
}): string => {
  const rruleOptions: RRuleOptions = {
    freq: options.frequency,
    interval: options.interval,
    byDay: options.daysOfWeek,
    byMonthDay: options.dayOfMonth ? [options.dayOfMonth] : undefined,
    until: options.endDate,
    count: options.occurrences
  };
  
  return generateRRule(rruleOptions);
};

export default {
  getCalendarClient,
  createRecurringTaskEvent,
  updateRecurringTaskEvent,
  deleteRecurringTaskEvent,
  getRecurringEventInstances,
  markRecurringInstanceComplete,
  fetchRecurringTaskEvents,
  calendarEventToTask,
  createSimpleRRule
};
