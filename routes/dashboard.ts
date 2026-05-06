import express from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import prisma from '../lib/prisma';
import { getCalendarClient } from '../services/googleClient';
import { getMicrosoftClient } from '../services/microsoftClient';
import { TokenManager } from '../services/TokenManager';
import logger from '../utils/logger';

const router = express.Router();

router.use(requireAuth);

// GET /api/dashboard/summary
router.get('/summary', async (req: AuthRequest, res) => {
    const userId = req.user!.id;

    try {
        const connections = await prisma.serviceToken.findMany({
            where: { userId },
            select: { id: true, service: true, accountEmail: true }
        });

        const now = new Date();
        const todayStart = new Date(now.setHours(0,0,0,0)).toISOString();
        const todayEnd = new Date(now.setHours(23,59,59,999)).toISOString();

        // 1. Fetch Events from all connections
        const eventPromises = connections.map(async (conn) => {
            try {
                if (conn.service === 'CALENDAR') {
                    const calendar = await getCalendarClient(conn.id);
                    const response = await calendar.events.list({
                        calendarId: 'primary',
                        timeMin: todayStart,
                        timeMax: todayEnd,
                        singleEvents: true,
                        orderBy: 'startTime'
                    });
                    return (response.data.items || []).map(e => ({
                        id: e.id,
                        title: e.summary,
                        time: e.start?.dateTime ? new Date(e.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'All Day',
                        platform: e.location?.includes('zoom') ? 'Zoom' : e.location?.includes('meet') ? 'Google Meet' : 'Calendar',
                        participants: e.attendees?.map(a => a.email) || [],
                        provider: 'Google',
                        originalStart: e.start?.dateTime || e.start?.date
                    }));
                } else if (conn.service === 'MICROSOFT_CALENDAR') {
                    const client = await getMicrosoftClient(conn.id);
                    const response = await client.get('/me/calendar/events', {
                        params: {
                            '$filter': `start/dateTime ge '${todayStart}' and end/dateTime le '${todayEnd}'`,
                            '$select': 'id,subject,start,location,attendees'
                        }
                    });
                    return (response.data.value || []).map((e: any) => ({
                        id: e.id,
                        title: e.subject,
                        time: new Date(e.start.dateTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        platform: e.location?.displayName?.includes('Teams') ? 'Microsoft Teams' : 'Outlook',
                        participants: e.attendees?.map((a: any) => a.emailAddress.address) || [],
                        provider: 'Outlook',
                        originalStart: e.start.dateTime
                    }));
                }
                return [];
            } catch (err) {
                logger.error({ err, connId: conn.id }, "Failed to fetch dashboard events for connection");
                return [];
            }
        });

        // 2. Fetch Unread Counts
        const emailPromises = connections.map(async (conn) => {
            try {
                if (conn.service === 'GMAIL') {
                    const { google } = require('googleapis');
                    const accessToken = await TokenManager.getValidAccessToken(conn.id);
                    const oauth2Client = new google.auth.OAuth2();
                    oauth2Client.setCredentials({ access_token: accessToken });
                    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
                    const response = await gmail.users.labels.get({ userId: 'me', id: 'UNREAD' });
                    return response.data.messagesUnread || 0;
                } else if (conn.service === 'OUTLOOK') {
                    const client = await getMicrosoftClient(conn.id);
                    const response = await client.get('/me/mailFolders/inbox', {
                        params: { '$select': 'unreadItemCount' }
                    });
                    return response.data.unreadItemCount || 0;
                }
                return 0;
            } catch (err) {
                logger.error({ err, connId: conn.id }, "Failed to fetch dashboard unread count for connection");
                return 0;
            }
        });

        const [eventsArrays, unreadCounts] = await Promise.all([
            Promise.all(eventPromises),
            Promise.all(emailPromises)
        ]);

        const allEvents = eventsArrays.flat().sort((a, b) => 
            new Date(a.originalStart).getTime() - new Date(b.originalStart).getTime()
        );

        const totalUnread = unreadCounts.reduce((sum, count) => sum + count, 0);

        res.json({
            events: allEvents,
            unreadEmailCount: totalUnread
        });

    } catch (error) {
        logger.error({ error }, "Dashboard summary error");
        res.status(500).json({ error: "Failed to fetch dashboard summary" });
    }
});

export default router;
