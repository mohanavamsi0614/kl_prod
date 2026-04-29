import { google } from 'googleapis';
import { TokenManager } from './TokenManager';
import logger from '../utils/logger';

/**
 * Initializes a Google Calendar client for the specified connection.
 * Automatically handles token refreshing via TokenManager.
 */
export const getCalendarClient = async (connectionId: string) => {
  try {
    logger.info({ connectionId }, 'getCalendarClient: Starting initialization');
    
    logger.info({ connectionId }, 'getCalendarClient: Calling TokenManager.getValidAccessToken');
    const accessToken = await TokenManager.getValidAccessToken(connectionId);
    logger.info({ connectionId }, 'getCalendarClient: Retrieved valid access token');

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      logger.error({ connectionId }, 'getCalendarClient: Missing Google credentials in environment');
      throw new Error('Google OAuth credentials not configured');
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    oauth2Client.setCredentials({ access_token: accessToken });
    logger.info({ connectionId }, 'getCalendarClient: OAuth2 client configured');

    const calendarClient = google.calendar({ version: 'v3', auth: oauth2Client });
    logger.info({ connectionId }, 'getCalendarClient: Calendar client created successfully');

    return calendarClient;
  } catch (error: any) {
    logger.error({ error, connectionId, errorMessage: error?.message, errorStatus: error?.status }, 'getCalendarClient: Initialization failed');
    throw error;
  }
};
