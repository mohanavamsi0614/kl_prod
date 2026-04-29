/**
 * RRULE Utility Functions
 * 
 * Handles generation and parsing of iCalendar RRULE strings
 * for recurring tasks using Google Calendar API.
 * 
 * RRULE Format: https://datatracker.ietf.org/doc/html/rfc5545#section-3.3.10
 * 
 * Examples:
 * - FREQ=DAILY (every day)
 * - FREQ=WEEKLY;BYDAY=MO,WE,FR (every Monday, Wednesday, Friday)
 * - FREQ=MONTHLY;BYMONTHDAY=15 (every 15th of the month)
 * - FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=25 (every December 25th)
 * - FREQ=WEEKLY;INTERVAL=2;BYDAY=TU (every 2 weeks on Tuesday)
 * - FREQ=DAILY;COUNT=10 (10 occurrences)
 * - FREQ=WEEKLY;UNTIL=20251231T235959Z (until end of 2025)
 */

import logger from './logger';

// Frequency options
export type RRuleFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

// Day of week for BYDAY
export type RRuleDay = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

// RRULE options structure
export interface RRuleOptions {
  // Required: Frequency of recurrence
  freq: RRuleFrequency;
  
  // Optional: Interval between occurrences (default: 1)
  interval?: number;
  
  // Optional: Days of the week (for WEEKLY/MONTHLY)
  byDay?: RRuleDay[];
  
  // Optional: Day of month (for MONTHLY/YEARLY) 1-31
  byMonthDay?: number[];
  
  // Optional: Month of year (for YEARLY) 1-12
  byMonth?: number[];
  
  // Optional: End conditions (use one or the other)
  count?: number;          // Number of occurrences
  until?: Date;            // End date
  
  // Optional: Week start day (default: MO)
  wkst?: RRuleDay;
}

// Parsed RRULE structure
export interface ParsedRRule {
  freq: RRuleFrequency;
  interval: number;
  byDay?: RRuleDay[];
  byMonthDay?: number[];
  byMonth?: number[];
  count?: number;
  until?: Date;
  wkst?: RRuleDay;
}

// Human-readable recurrence description
export interface RecurrenceDescription {
  summary: string;        // "Every 2 weeks on Mon, Wed"
  frequency: string;      // "Weekly"
  details: string[];      // ["Every 2 weeks", "On Monday, Wednesday"]
}

/**
 * Generate an RRULE string from options
 */
export function generateRRule(options: RRuleOptions): string {
  const parts: string[] = [];
  
  // FREQ is required
  parts.push(`FREQ=${options.freq}`);
  
  // INTERVAL (if not 1)
  if (options.interval && options.interval > 1) {
    parts.push(`INTERVAL=${options.interval}`);
  }
  
  // BYDAY
  if (options.byDay && options.byDay.length > 0) {
    parts.push(`BYDAY=${options.byDay.join(',')}`);
  }
  
  // BYMONTHDAY
  if (options.byMonthDay && options.byMonthDay.length > 0) {
    parts.push(`BYMONTHDAY=${options.byMonthDay.join(',')}`);
  }
  
  // BYMONTH
  if (options.byMonth && options.byMonth.length > 0) {
    parts.push(`BYMONTH=${options.byMonth.join(',')}`);
  }
  
  // COUNT (takes precedence over UNTIL if both provided)
  if (options.count && options.count > 0) {
    parts.push(`COUNT=${options.count}`);
  } else if (options.until) {
    // UNTIL in UTC format: YYYYMMDDTHHMMSSZ
    const untilStr = formatDateToRRule(options.until);
    parts.push(`UNTIL=${untilStr}`);
  }
  
  // WKST (if not Monday)
  if (options.wkst && options.wkst !== 'MO') {
    parts.push(`WKST=${options.wkst}`);
  }
  
  return parts.join(';');
}

/**
 * Parse an RRULE string into options object
 */
export function parseRRule(rrule: string): ParsedRRule | null {
  if (!rrule) return null;
  
  try {
    // Remove "RRULE:" prefix if present
    const ruleStr = rrule.replace(/^RRULE:/i, '');
    
    const parts = ruleStr.split(';');
    const result: Partial<ParsedRRule> = {
      interval: 1 // default
    };
    
    for (const part of parts) {
      const [key, value] = part.split('=');
      if (!key || !value) continue;
      
      switch (key.toUpperCase()) {
        case 'FREQ':
          result.freq = value.toUpperCase() as RRuleFrequency;
          break;
          
        case 'INTERVAL':
          result.interval = parseInt(value, 10);
          break;
          
        case 'BYDAY':
          result.byDay = value.split(',').map(d => d.toUpperCase() as RRuleDay);
          break;
          
        case 'BYMONTHDAY':
          result.byMonthDay = value.split(',').map(d => parseInt(d, 10));
          break;
          
        case 'BYMONTH':
          result.byMonth = value.split(',').map(m => parseInt(m, 10));
          break;
          
        case 'COUNT':
          result.count = parseInt(value, 10);
          break;
          
        case 'UNTIL':
          result.until = parseRRuleDate(value);
          break;
          
        case 'WKST':
          result.wkst = value.toUpperCase() as RRuleDay;
          break;
      }
    }
    
    if (!result.freq) {
      logger.warn({ rrule }, 'RRULE missing required FREQ component');
      return null;
    }
    
    return result as ParsedRRule;
  } catch (error) {
    logger.error({ error, rrule }, 'Failed to parse RRULE');
    return null;
  }
}

/**
 * Format a Date to RRULE date format (YYYYMMDDTHHMMSSZ)
 */
export function formatDateToRRule(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * Parse RRULE date format to Date object
 */
export function parseRRuleDate(dateStr: string): Date {
  // Format: YYYYMMDDTHHMMSSZ or YYYYMMDD
  const hasTime = dateStr.includes('T');
  
  if (hasTime) {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    const hours = parseInt(dateStr.substring(9, 11), 10);
    const minutes = parseInt(dateStr.substring(11, 13), 10);
    const seconds = parseInt(dateStr.substring(13, 15), 10);
    
    return new Date(Date.UTC(year, month, day, hours, minutes, seconds));
  } else {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1;
    const day = parseInt(dateStr.substring(6, 8), 10);
    
    return new Date(Date.UTC(year, month, day, 23, 59, 59));
  }
}

/**
 * Convert legacy recurrenceInterval to RRULE
 */
export function legacyToRRule(interval: 'DAILY' | 'WEEKLY' | 'MONTHLY' | null): string | null {
  if (!interval) return null;
  
  switch (interval) {
    case 'DAILY':
      return 'FREQ=DAILY';
    case 'WEEKLY':
      return 'FREQ=WEEKLY';
    case 'MONTHLY':
      return 'FREQ=MONTHLY';
    default:
      return null;
  }
}

/**
 * Convert RRULE to legacy recurrenceInterval (for backward compatibility)
 */
export function rruleToLegacy(rrule: string | null): 'DAILY' | 'WEEKLY' | 'MONTHLY' | null {
  if (!rrule) return null;
  
  const parsed = parseRRule(rrule);
  if (!parsed) return null;
  
  // Only map simple cases back to legacy
  if (parsed.interval === 1 && !parsed.byDay && !parsed.byMonthDay && !parsed.byMonth) {
    switch (parsed.freq) {
      case 'DAILY':
        return 'DAILY';
      case 'WEEKLY':
        return 'WEEKLY';
      case 'MONTHLY':
        return 'MONTHLY';
    }
  }
  
  // Complex rules can't be mapped to legacy
  return null;
}

/**
 * Get human-readable description of RRULE
 */
export function describeRRule(rrule: string): RecurrenceDescription {
  const parsed = parseRRule(rrule);
  
  if (!parsed) {
    return {
      summary: 'Invalid recurrence',
      frequency: 'Unknown',
      details: []
    };
  }
  
  const details: string[] = [];
  let summary = '';
  let frequency = '';
  
  // Frequency description
  const intervalPrefix = parsed.interval > 1 ? `Every ${parsed.interval} ` : 'Every ';
  
  switch (parsed.freq) {
    case 'DAILY':
      frequency = 'Daily';
      summary = parsed.interval > 1 ? `Every ${parsed.interval} days` : 'Every day';
      details.push(summary);
      break;
      
    case 'WEEKLY':
      frequency = 'Weekly';
      if (parsed.byDay && parsed.byDay.length > 0) {
        const days = parsed.byDay.map(dayToName).join(', ');
        summary = `${intervalPrefix}${parsed.interval > 1 ? 'weeks' : 'week'} on ${days}`;
        details.push(`${intervalPrefix}${parsed.interval > 1 ? 'weeks' : 'week'}`);
        details.push(`On ${days}`);
      } else {
        summary = parsed.interval > 1 ? `Every ${parsed.interval} weeks` : 'Every week';
        details.push(summary);
      }
      break;
      
    case 'MONTHLY':
      frequency = 'Monthly';
      if (parsed.byMonthDay && parsed.byMonthDay.length > 0) {
        const days = parsed.byMonthDay.map(d => ordinal(d)).join(', ');
        summary = `${intervalPrefix}${parsed.interval > 1 ? 'months' : 'month'} on the ${days}`;
        details.push(`${intervalPrefix}${parsed.interval > 1 ? 'months' : 'month'}`);
        details.push(`On the ${days}`);
      } else if (parsed.byDay && parsed.byDay.length > 0) {
        const days = parsed.byDay.map(dayToName).join(', ');
        summary = `${intervalPrefix}${parsed.interval > 1 ? 'months' : 'month'} on ${days}`;
        details.push(`${intervalPrefix}${parsed.interval > 1 ? 'months' : 'month'}`);
        details.push(`On ${days}`);
      } else {
        summary = parsed.interval > 1 ? `Every ${parsed.interval} months` : 'Every month';
        details.push(summary);
      }
      break;
      
    case 'YEARLY':
      frequency = 'Yearly';
      if (parsed.byMonth && parsed.byMonth.length > 0) {
        const months = parsed.byMonth.map(monthToName).join(', ');
        if (parsed.byMonthDay && parsed.byMonthDay.length > 0) {
          const days = parsed.byMonthDay.map(d => ordinal(d)).join(', ');
          summary = `${intervalPrefix}${parsed.interval > 1 ? 'years' : 'year'} on ${months} ${days}`;
          details.push(`${intervalPrefix}${parsed.interval > 1 ? 'years' : 'year'}`);
          details.push(`In ${months}`);
          details.push(`On the ${days}`);
        } else {
          summary = `${intervalPrefix}${parsed.interval > 1 ? 'years' : 'year'} in ${months}`;
          details.push(`${intervalPrefix}${parsed.interval > 1 ? 'years' : 'year'}`);
          details.push(`In ${months}`);
        }
      } else {
        summary = parsed.interval > 1 ? `Every ${parsed.interval} years` : 'Every year';
        details.push(summary);
      }
      break;
  }
  
  // End condition
  if (parsed.count) {
    const endText = `${parsed.count} time${parsed.count > 1 ? 's' : ''}`;
    details.push(endText);
    summary += `, ${endText}`;
  } else if (parsed.until) {
    const endText = `Until ${parsed.until.toLocaleDateString()}`;
    details.push(endText);
    summary += `, until ${parsed.until.toLocaleDateString()}`;
  }
  
  return {
    summary,
    frequency,
    details
  };
}

/**
 * Convert RRuleDay to full day name
 */
function dayToName(day: RRuleDay): string {
  const names: Record<RRuleDay, string> = {
    'SU': 'Sunday',
    'MO': 'Monday',
    'TU': 'Tuesday',
    'WE': 'Wednesday',
    'TH': 'Thursday',
    'FR': 'Friday',
    'SA': 'Saturday'
  };
  return names[day] || day;
}

/**
 * Convert month number to name
 */
function monthToName(month: number): string {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return names[month - 1] || `Month ${month}`;
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Validate RRULE string
 */
export function isValidRRule(rrule: string): boolean {
  const parsed = parseRRule(rrule);
  if (!parsed) return false;
  
  // Validate frequency
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(parsed.freq)) {
    return false;
  }
  
  // Validate interval
  if (parsed.interval && (parsed.interval < 1 || parsed.interval > 999)) {
    return false;
  }
  
  // Validate BYDAY
  if (parsed.byDay) {
    const validDays: RRuleDay[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    for (const day of parsed.byDay) {
      if (!validDays.includes(day)) return false;
    }
  }
  
  // Validate BYMONTHDAY
  if (parsed.byMonthDay) {
    for (const day of parsed.byMonthDay) {
      if (day < 1 || day > 31) return false;
    }
  }
  
  // Validate BYMONTH
  if (parsed.byMonth) {
    for (const month of parsed.byMonth) {
      if (month < 1 || month > 12) return false;
    }
  }
  
  // Validate COUNT
  if (parsed.count && (parsed.count < 1 || parsed.count > 999)) {
    return false;
  }
  
  return true;
}

/**
 * Create common RRULE presets
 */
export const RRulePresets = {
  daily: (): string => 'FREQ=DAILY',
  
  weekdays: (): string => 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  
  weekends: (): string => 'FREQ=WEEKLY;BYDAY=SA,SU',
  
  weekly: (day?: RRuleDay): string => 
    day ? `FREQ=WEEKLY;BYDAY=${day}` : 'FREQ=WEEKLY',
  
  biweekly: (day?: RRuleDay): string =>
    day ? `FREQ=WEEKLY;INTERVAL=2;BYDAY=${day}` : 'FREQ=WEEKLY;INTERVAL=2',
  
  monthly: (dayOfMonth?: number): string =>
    dayOfMonth ? `FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth}` : 'FREQ=MONTHLY',
  
  yearly: (month?: number, day?: number): string => {
    let rule = 'FREQ=YEARLY';
    if (month) rule += `;BYMONTH=${month}`;
    if (day) rule += `;BYMONTHDAY=${day}`;
    return rule;
  },
  
  custom: (options: RRuleOptions): string => generateRRule(options)
};

/**
 * Get the next occurrence date based on RRULE and last occurrence
 * Note: This is a simplified implementation. For production,
 * consider using a library like rrule.js for complex calculations.
 */
export function getNextOccurrence(rrule: string, fromDate: Date = new Date()): Date | null {
  const parsed = parseRRule(rrule);
  if (!parsed) return null;
  
  // Check if we've reached the end
  if (parsed.until && fromDate > parsed.until) {
    return null;
  }
  
  const next = new Date(fromDate);
  
  switch (parsed.freq) {
    case 'DAILY':
      next.setDate(next.getDate() + (parsed.interval || 1));
      break;
      
    case 'WEEKLY':
      if (parsed.byDay && parsed.byDay.length > 0) {
        // Find the next matching day
        const dayMap: Record<RRuleDay, number> = {
          'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6
        };
        const targetDays = parsed.byDay.map(d => dayMap[d]).sort((a, b) => a - b);
        const currentDay = next.getDay();
        
        // Find next day in current week
        const nextDay = targetDays.find(d => d > currentDay);
        if (nextDay !== undefined) {
          next.setDate(next.getDate() + (nextDay - currentDay));
        } else {
          // Move to next week interval
          const daysToAdd = 7 * (parsed.interval || 1) - currentDay + targetDays[0];
          next.setDate(next.getDate() + daysToAdd);
        }
      } else {
        next.setDate(next.getDate() + 7 * (parsed.interval || 1));
      }
      break;
      
    case 'MONTHLY':
      next.setMonth(next.getMonth() + (parsed.interval || 1));
      if (parsed.byMonthDay && parsed.byMonthDay.length > 0) {
        next.setDate(parsed.byMonthDay[0]);
      }
      break;
      
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + (parsed.interval || 1));
      if (parsed.byMonth && parsed.byMonth.length > 0) {
        next.setMonth(parsed.byMonth[0] - 1);
      }
      if (parsed.byMonthDay && parsed.byMonthDay.length > 0) {
        next.setDate(parsed.byMonthDay[0]);
      }
      break;
  }
  
  // Check end condition
  if (parsed.until && next > parsed.until) {
    return null;
  }
  
  return next;
}

export default {
  generateRRule,
  parseRRule,
  describeRRule,
  isValidRRule,
  legacyToRRule,
  rruleToLegacy,
  formatDateToRRule,
  parseRRuleDate,
  getNextOccurrence,
  RRulePresets
};
