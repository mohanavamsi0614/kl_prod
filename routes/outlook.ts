import { Router, Response } from "express";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { TokenManager } from "../services/TokenManager";
import { getMicrosoftClient } from "../services/microsoftClient";
import logger from "../utils/logger";
import prisma from "../lib/prisma";
import { getCached, setCached, clearCache, createCacheKey } from "../utils/cache";
import DOMPurify from 'isomorphic-dompurify';

const router = Router();

// Sanitize HTML content to prevent XSS attacks
function sanitizeHTML(html: string): string {
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 'a', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style'],
        ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|data|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
        ALLOW_DATA_ATTR: false,
    });
}

// Helper to get Outlook client
async function getOutlookClient(userId: string, connectionId?: string) {
    const serviceToken = await TokenManager.getConnection(userId, 'OUTLOOK', connectionId);

    if (!serviceToken) {
        throw new Error("Outlook not connected");
    }

    return getMicrosoftClient(serviceToken.id);
}

router.get("/fetch", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const pageToken = req.query.pageToken as string | undefined;
        const accountId = req.query.accountId as string | undefined;
        const q = req.query.q as string | undefined;

        const cacheKey = createCacheKey('outlook:emails', userId, accountId || 'default', pageToken || 'first', q || 'all');
        const cached = getCached(cacheKey);

        if (cached) {
            return res.json(cached);
        }

        const client = await getOutlookClient(userId, accountId);

        let filter = "";
        if (q) {
            filter = `(contains(subject,'${q}') or contains(from/emailAddress/name,'${q}') or contains(from/emailAddress/address,'${q}'))`;
        }

        const response = await client.get('/me/messages', {
            params: {
                '$top': 50,
                '$skip': pageToken ? parseInt(pageToken) : 0,
                '$filter': filter || undefined,
                '$select': 'id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments',
                '$orderby': 'receivedDateTime desc'
            }
        });

        const messages = response.data.value.map((msg: any) => ({
            id: msg.id,
            read: msg.isRead,
            subject: msg.subject || '(No Subject)',
            from: msg.from?.emailAddress ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>` : 'Unknown',
            date: msg.receivedDateTime,
            preview: msg.bodyPreview,
            accountId: accountId
        }));

        const nextSkip = (pageToken ? parseInt(pageToken) : 0) + response.data.value.length;
        const hasNext = response.data['@odata.nextLink'] ? nextSkip.toString() : null;

        const result = {
            messages,
            nextPageToken: hasNext
        };

        setCached(cacheKey, result, 600);
        res.json(result);

    } catch (error: any) {
        logger.error({ error: error.message, userId: req.user?.id }, "Outlook fetch error");
        res.status(500).json({ error: "Failed to fetch emails" });
    }
});

// GET /message/:messageId - Get single email detail
router.get("/message/:messageId", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { messageId } = req.params;
        const accountId = req.query.accountId as string | undefined;

        const client = await getOutlookClient(userId, accountId);

        const response = await client.get(`/me/messages/${messageId}`, {
            headers: {
                'Prefer': 'outlook.body-content-type="html"'
            }
        });

        const msg = response.data;

        // Fetch attachments if they exist
        let attachments = [];
        if (msg.hasAttachments) {
            const attachRes = await client.get(`/me/messages/${messageId}/attachments`);
            attachments = attachRes.data.value.map((a: any) => ({
                id: a.id,
                filename: a.name,
                mimeType: a.contentType,
                size: a.size,
                isInline: a.isInline
            }));
        }

        const result = {
            id: msg.id,
            read: msg.isRead,
            subject: msg.subject || '(No Subject)',
            from: msg.from?.emailAddress ? `${msg.from.emailAddress.name} <${msg.from.emailAddress.address}>` : 'Unknown',
            date: msg.receivedDateTime,
            preview: msg.bodyPreview,
            body: sanitizeHTML(msg.body?.content || ''),
            attachments: attachments.filter((a: any) => !a.isInline),
            inlineAttachments: attachments.filter((a: any) => a.isInline).map((a: any) => ({
                contentId: a.contentId || a.id,
                dataUrl: `data:${a.mimeType};base64,${a.contentBytes}` // Graph provides contentBytes for small attachments
            })),
            accountId: accountId
        };

        res.json(result);

    } catch (error: any) {
        logger.error({ error: error.message, messageId: req.params.messageId }, "Outlook message detail error");
        res.status(500).json({ error: "Failed to fetch email detail" });
    }
});

// POST /send - Send email
router.post("/send", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { to, subject, body, accountId } = req.body;

        if (!to || !subject || !body) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const client = await getOutlookClient(userId, accountId);

        await client.post('/me/sendMail', {
            message: {
                subject: subject,
                body: {
                    contentType: 'Text',
                    content: body
                },
                toRecipients: [
                    {
                        emailAddress: {
                            address: to
                        }
                    }
                ]
            }
        });

        clearCache(`outlook:emails:${userId}:${accountId || 'default'}`);
        res.json({ success: true });

    } catch (error: any) {
        logger.error({ error: error.message }, "Outlook send error");
        res.status(500).json({ error: "Failed to send email" });
    }
});

// POST /mark-as-read
router.post("/mark-as-read", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { messageId, accountId } = req.body;

        const client = await getOutlookClient(userId, accountId);

        await client.patch(`/me/messages/${messageId}`, {
            isRead: true
        });

        clearCache(`outlook:emails:${userId}:${accountId || 'default'}`);
        res.json({ success: true });

    } catch (error: any) {
        logger.error({ error: error.message }, "Outlook mark-as-read error");
        res.status(500).json({ error: "Failed to mark as read" });
    }
});

export default router;
