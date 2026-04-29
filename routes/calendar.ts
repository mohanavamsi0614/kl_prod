import express from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getCalendarClient } from '../services/googleClient';
import { TokenRevokedError, InsufficientScopesError } from '../services/TokenManager';
import { TokenManager } from '../services/TokenManager';
import logger from '../utils/logger';
import prisma from '../lib/prisma';
import { withGoogleApiRetry } from '../utils/googleApiRetry';

const router = express.Router();

// Middleware to check connection ownership
const validateConnection = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const connectionId = (req.query.connectionId as string) || (req.body.connectionId as string);
    const userId = req.user?.id;

    if (!connectionId) {
        return res.status(400).json({ error: 'Missing connectionId' });
    }

    try {
        const connection = await prisma.serviceToken.findUnique({
            where: { id: connectionId },
            select: { userId: true }
        });

        if (!connection) {
            logger.warn({ connectionId, requestUserId: userId }, 'Connection not found');
            return res.status(404).json({ error: 'Connection not found' });
        }

        if (connection.userId !== userId) {
            logger.warn({ 
                connectionId, 
                connectionUserId: connection.userId, 
                requestUserId: userId,
                match: connection.userId === userId
            }, 'User ID mismatch - access denied');
            return res.status(403).json({ error: 'Access denied to this connection' });
        }

        next();
    } catch (error) {
        logger.error({ error }, 'Connection validation failed');
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.use(requireAuth);

// GET /api/calendar/events - no caching for instant updates
router.get('/events', validateConnection, async (req: AuthRequest, res) => {
    const connectionId = req.query.connectionId as string;
    const syncToken = req.query.syncToken as string;
    
    // Only use timeMin/timeMax if we DON'T have a syncToken
    const startDate = !syncToken ? (req.query.startDate as string || new Date().toISOString()) : undefined;
    const endDate = !syncToken ? req.query.endDate as string : undefined;

    try {
        logger.info({ connectionId, startDate, endDate, hasSyncToken: !!syncToken }, 'Fetching calendar events');
        
        // Validate that token has required scopes
        try {
            await TokenManager.ensureTokenHasScopes(connectionId, 'CALENDAR');
        } catch (error) {
            if (error instanceof InsufficientScopesError) {
                logger.warn({ connectionId, missingScopes: error.missingScopes }, 'Token missing required scopes for calendar');
                return res.status(403).json({ 
                    error: 'Insufficient scopes for calendar access',
                    code: 'SCOPE_REAUTH_REQUIRED',
                    missingScopes: error.missingScopes
                });
            }
            throw error;
        }
        
        const calendar = await getCalendarClient(connectionId);
        logger.info({ connectionId }, 'Calendar client initialized, calling events.list()');
        
        const response = await withGoogleApiRetry(
            () => calendar.events.list({
                calendarId: 'primary',
                syncToken: syncToken,
                timeMin: startDate,
                timeMax: endDate,
                singleEvents: true,
                orderBy: 'startTime',
                maxResults: 2500, // Increased limit to ensure we get all events
            }),
            { maxRetries: 3 },
            `calendar.events.list:${connectionId}`
        );

        const events = response.data.items?.map(event => ({
            id: event.id,
            summary: event.summary,
            description: event.description,
            start: event.start,
            end: event.end,
            link: event.htmlLink,
            location: event.location,
            attendees: event.attendees
        })) || [];

        const result = { 
            events,
            nextSyncToken: response.data.nextSyncToken 
        };
        
        logger.info({ eventCount: events.length, connectionId }, 'Successfully fetched calendar events');
        res.json(result);

    } catch (error: any) {
        // Handle "410 Gone" error (sync token expired) by performing a full sync
        if (error.code === 410) {
            logger.warn({ connectionId }, 'Sync token expired, requiring full sync');
            return res.status(410).json({ error: 'Sync token expired', code: 'SYNC_TOKEN_EXPIRED' });
        }

        if (error instanceof TokenRevokedError) {
            logger.warn({ connectionId }, 'Token revoked for connection');
            return res.status(401).json({ error: 'Calendar connection revoked. Please reconnect.' });
        }
        
        // Check for insufficient scopes error
        if (error?.response?.status === 403 || error?.status === 403) {
            const errorMessage = error?.response?.data?.error?.message || error?.message || '';
            if (errorMessage.includes('insufficient') || errorMessage.includes('scope')) {
                logger.warn({ connectionId, errorMessage }, 'Insufficient scopes for calendar access');
                return res.status(403).json({ 
                    error: 'Calendar access requires updated permissions. Please reconnect your calendar account.',
                    code: 'INSUFFICIENT_SCOPES'
                });
            }
        }
        
        const errorDetails = {
            error,
            connectionId,
            errorMessage: error?.message,
            errorCode: error?.code,
            errorStatus: error?.status,
        };
        
        logger.error(errorDetails, 'Failed to fetch calendar events');
        res.status(500).json({ 
            error: 'Failed to fetch events', 
            details: error?.message,
            code: error?.code
        });
    }
});

// POST /api/calendar/events
router.post('/events', validateConnection, async (req: AuthRequest, res) => {
    const { connectionId, summary, description, startTime, endTime, attendees } = req.body;

    if (!summary || !startTime || !endTime) {
        return res.status(400).json({ error: 'Missing required fields: summary, startTime, endTime' });
    }

    try {
        const calendar = await getCalendarClient(connectionId);

        const event = {
            summary,
            description,
            start: { dateTime: startTime },
            end: { dateTime: endTime },
            attendees: attendees || [],
        };

        const response = await withGoogleApiRetry(
            () => calendar.events.insert({
                calendarId: 'primary',
                requestBody: event,
            }),
            { maxRetries: 3 },
            `calendar.events.insert:${connectionId}`
        );

        res.status(201).json(response.data);

    } catch (error: any) {
        if (error instanceof TokenRevokedError) {
            return res.status(401).json({ error: 'Calendar connection revoked. Please reconnect.' });
        }
        logger.error({ error }, 'Failed to create calendar event');
        res.status(500).json({ error: 'Failed to create event' });
    }
});

// PUT /api/calendar/events/:eventId
router.put('/events/:eventId', validateConnection, async (req: AuthRequest, res) => {
    const { eventId } = req.params;
    const { connectionId, summary, description, startTime, endTime, attendees } = req.body;

    if (!summary || !startTime || !endTime) {
        return res.status(400).json({ error: 'Missing required fields: summary, startTime, endTime' });
    }

    try {
        const calendar = await getCalendarClient(connectionId);

        const event = {
            summary,
            description,
            start: { dateTime: startTime },
            end: { dateTime: endTime },
            attendees: attendees || [],
        };

        const response = await calendar.events.update({
            calendarId: 'primary',
            eventId: eventId,
            requestBody: event,
        });

        res.json(response.data);

    } catch (error: any) {
        if (error instanceof TokenRevokedError) {
            return res.status(401).json({ error: 'Calendar connection revoked. Please reconnect.' });
        }
        logger.error({ error }, 'Failed to update calendar event');
        res.status(500).json({ error: 'Failed to update event' });
    }
});

// DELETE /api/calendar/events/:eventId
router.delete('/events/:eventId', validateConnection, async (req: AuthRequest, res) => {
    const { eventId } = req.params;
    const connectionId = (req.query.connectionId as string) || (req.body.connectionId as string);

    try {
        const calendar = await getCalendarClient(connectionId);

        await calendar.events.delete({
            calendarId: 'primary',
            eventId: eventId,
        });

        res.status(204).send();

    } catch (error: any) {
        if (error instanceof TokenRevokedError) {
            return res.status(401).json({ error: 'Calendar connection revoked. Please reconnect.' });
        }
        logger.error({ error }, 'Failed to delete calendar event');
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

export default router;
