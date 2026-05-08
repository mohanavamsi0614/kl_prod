import express from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { getMicrosoftClient } from '../services/microsoftClient';
import { TokenManager } from '../services/TokenManager';
import logger from '../utils/logger';

const router = express.Router();

// Middleware to check connection ownership
const validateConnection = async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    const connectionId = (req.query.connectionId as string) || (req.body.connectionId as string);
    const userId = req.user?.id;

    if (!connectionId) {
        return res.status(400).json({ error: 'Missing connectionId' });
    }

    try {
        const connection = await TokenManager.getConnection(userId || '', 'MICROSOFT_CALENDAR', connectionId);

        if (!connection) {
            return res.status(404).json({ error: 'Microsoft Calendar connection not found' });
        }

        next();
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.use(requireAuth);

// GET /events
router.get('/events', validateConnection, async (req: AuthRequest, res) => {
    const connectionId = req.query.connectionId as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const startIso = startDate && !Number.isNaN(Date.parse(startDate)) ? new Date(startDate).toISOString() : null;
    const endIso = endDate && !Number.isNaN(Date.parse(endDate)) ? new Date(endDate).toISOString() : null;

    try {
        await TokenManager.ensureTokenHasScopes(connectionId, 'MICROSOFT_CALENDAR');
        const client = await getMicrosoftClient(connectionId);

        const response = await client.get('/me/calendar/events', {
            params: {
                '$select': 'id,subject,bodyPreview,start,end,location,attendees,onlineMeeting',
                '$filter': startIso && endIso ? `start/dateTime ge '${startIso}' and end/dateTime le '${endIso}'` : undefined,
                '$orderby': 'start/dateTime'
            }
        });

        const events = response.data.value.map((event: any) => ({
            id: event.id,
            summary: event.subject,
            description: event.bodyPreview,
            start: {
                dateTime: event.start.dateTime,
                timeZone: event.start.timeZone
            },
            end: {
                dateTime: event.end.dateTime,
                timeZone: event.end.timeZone
            },
            location: event.location?.displayName,
            attendees: event.attendees?.map((a: any) => ({
                email: a.emailAddress.address,
                responseStatus: a.status.response
            }))
        }));

        res.json({ events });

    } catch (error: any) {
        logger.error({
            error: error.message,
            status: error.response?.status,
            details: error.response?.data?.error?.message,
            connectionId
        }, "Outlook Calendar fetch error");
        res.status(500).json({ error: "Failed to fetch events" });
    }
});

// POST /events
router.post('/events', validateConnection, async (req: AuthRequest, res) => {
    const { connectionId, summary, description, startTime, endTime, attendees, location } = req.body;

    try {
        const client = await getMicrosoftClient(connectionId);

        const response = await client.post('/me/calendar/events', {
            subject: summary,
            body: {
                contentType: 'HTML',
                content: description
            },
            start: {
                dateTime: startTime,
                timeZone: 'UTC'
            },
            end: {
                dateTime: endTime,
                timeZone: 'UTC'
            },
            location: {
                displayName: location
            },
            attendees: attendees?.map((email: string) => ({
                emailAddress: { address: email },
                type: 'required'
            }))
        });

        res.status(201).json(response.data);

    } catch (error: any) {
        logger.error({ error: error.message }, "Outlook Calendar create error");
        res.status(500).json({ error: "Failed to create event" });
    }
});

// PUT /events/:eventId
router.put('/events/:eventId', validateConnection, async (req: AuthRequest, res) => {
    const { eventId } = req.params;
    const { connectionId, summary, description, startTime, endTime, location, attendees } = req.body;

    try {
        const client = await getMicrosoftClient(connectionId);

        const response = await client.patch(`/me/calendar/events/${eventId}`, {
            subject: summary,
            body: {
                contentType: 'HTML',
                content: description
            },
            start: {
                dateTime: startTime,
                timeZone: 'UTC'
            },
            end: {
                dateTime: endTime,
                timeZone: 'UTC'
            },
            location: {
                displayName: location
            },
            attendees: attendees?.map((email: string) => ({
                emailAddress: { address: email },
                type: 'required'
            }))
        });

        res.json(response.data);

    } catch (error: any) {
        logger.error({ error: error.message }, "Outlook Calendar update error");
        res.status(500).json({ error: "Failed to update event" });
    }
});

// DELETE /events/:eventId
router.delete('/events/:eventId', validateConnection, async (req: AuthRequest, res) => {
    const { eventId } = req.params;
    const connectionId = req.query.connectionId as string;

    try {
        const client = await getMicrosoftClient(connectionId);
        await client.delete(`/me/calendar/events/${eventId}`);
        res.status(204).send();
    } catch (error: any) {
        logger.error({ error: error.message }, "Outlook Calendar delete error");
        res.status(500).json({ error: "Failed to delete event" });
    }
});

export default router;
