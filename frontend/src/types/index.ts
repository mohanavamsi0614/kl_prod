// Default categories
export type DefaultCalendarCategory = 'Personal' | 'Work' | 'Family' | 'Other';
// Allow custom string categories too
export type CalendarCategory = DefaultCalendarCategory | string;

export interface ApiConnection {
    id: string;
    service: string;
    accountEmail: string;
    updatedAt: string;
    category?: string;
    color?: string;
}

export interface ApiEvent {
    id: string;
    summary: string;
    description?: string;
    start: {
        dateTime?: string;
        date?: string;
    };
    end: {
        dateTime?: string;
        date?: string;
    };
    link?: string;
    location?: string;
    attendees?: { email: string; responseStatus?: string }[];
}

// Task-related types
export type TaskStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE';
export type TaskSource = 'LOCAL' | 'GOOGLE';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReminderMethod = 'PUSH' | 'EMAIL' | 'SMS';
export type RecurrenceInterval = 'DAILY' | 'WEEKLY' | 'MONTHLY';

// RRULE types for advanced recurrence
export type RRuleFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type RRuleDay = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

export interface RRuleOptions {
  freq: RRuleFrequency;
  interval?: number;
  byDay?: RRuleDay[];
  byMonthDay?: number[];
  byMonth?: number[];
  count?: number;
  until?: string; // ISO date string
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  dueDate?: string | null;
  reminderTime?: string | null;
  reminderMethod?: ReminderMethod | null;
  recurrenceInterval?: RecurrenceInterval | null;
  // RRULE-based recurrence fields
  rrule?: string | null;
  isRecurring?: boolean;
  googleCalendarEventId?: string | null;
  recurringParentId?: string | null;
  recurrenceEnd?: string | null;
  recurrenceCount?: number | null;
  rruleDescription?: string | null;
  calendarLink?: string | null;
  googleTaskId?: string | null;
  connectionId?: string | null;
  list?: { id: string; name: string; color?: string } | null;
  lastSyncedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  // Legacy compatibility
  completed?: boolean;
  listId?: string;
  date?: string;
}

export interface Email {
  id: string;
  read: boolean;
  subject: string;
  from: string;
  date: string;
  preview: string;
  body?: string;
  attachments?: Array<{ id: string; filename: string; mimeType: string; size: number }>;
  inlineAttachments?: Array<{ contentId: string; dataUrl: string }>;
  accountId?: string;
  threadId?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  tags: string[];
  date: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  time: string;
  date: string;
  platform: string;
  participants: string[];
  calendarId: string;
  originalStart?: string;
}

export interface CalendarSource {
  id: string;
  provider: string;
  category: CalendarCategory;
  color: string;
  email?: string;
}

export interface TaskList {
  id: string;
  color: string;
  name: string;
  googleListId?: string | null;
  connectionId?: string | null;
  taskCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AppState {
  tasks: Task[];
  emails: Email[];
  events: CalendarEvent[];
  calendars: CalendarSource[];
  taskLists: TaskList[];
  notes: Note[];
}

export const AppView = {
  DASHBOARD: 'dashboard',
  CALENDAR: 'calendar',
  TASKS: 'tasks',
  EMAIL: 'email',
  FILES: 'files',
  CONTACTS: 'contacts',
  CHAT: 'chat',
  INTEGRATIONS: 'integrations',
  HELP: 'help',
  SETTINGS: 'settings'
} as const;

export type AppView = typeof AppView[keyof typeof AppView];
