import { Router, Response } from "express";
import { google } from "googleapis";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { TokenManager } from "../services/TokenManager";
import logger from "../utils/logger";
import prisma from "../lib/prisma";
import { getCached, setCached, clearCache, createCacheKey } from "../utils/cache";
import DOMPurify from 'isomorphic-dompurify';
import { withGoogleApiRetry } from "../utils/googleApiRetry";

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

// ...existing code...
// Helper to get Gmail client
async function getGmailClient(userId: string, serviceTokenId?: string) {
    const serviceToken = await TokenManager.getConnection(userId, 'GMAIL', serviceTokenId);

    if (!serviceToken) {
        throw new Error("Gmail not connected");
    }

    const accessToken = await TokenManager.getValidAccessToken(serviceToken.id);

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });

    return google.gmail({ version: 'v1', auth: oauth2Client });
}

function parseMessagePayload(payload: any) {
    let body = '';
    let attachments: any[] = [];
    const inlineImages: Map<string, { mimeType: string; data?: string; attachmentId?: string }> = new Map();

    function traverse(parts: any[]) {
        if (!parts) return;
        
        for (const part of parts) {
            // Extract Content-ID for inline images
            const headers = part.headers || [];
            const contentId = headers.find((h: any) => h.name?.toLowerCase() === 'content-id')?.value;
            
            if (contentId) {
                 logger.info({ contentId, mimeType: part.mimeType, hasData: !!part.body?.data, hasAttachmentId: !!part.body?.attachmentId }, "Found inline image candidate");
            }

            // Check if this is an inline image
            if (contentId && part.mimeType?.startsWith('image/')) {
                const cleanId = contentId.replace(/^<|>$/g, ''); // Remove < > brackets
                
                if (part.body?.data) {
                    inlineImages.set(cleanId, {
                        mimeType: part.mimeType,
                        data: part.body.data
                    });
                } else if (part.body?.attachmentId) {
                    inlineImages.set(cleanId, {
                        mimeType: part.mimeType,
                        attachmentId: part.body.attachmentId
                    });
                }
                // Don't add inline images to the attachments list
                continue;
            }
            
            if (part.filename && part.body?.attachmentId) {
                attachments.push({
                    id: part.body.attachmentId,
                    filename: part.filename,
                    mimeType: part.mimeType,
                    size: part.body.size
                });
            }
            
            // Prefer HTML, fallback to plain text
            if (part.mimeType === 'text/html' && part.body?.data) {
                const b64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
                body = Buffer.from(b64, 'base64').toString('utf-8');
            } else if (part.mimeType === 'text/plain' && part.body?.data && !body) {
                const b64 = part.body.data.replace(/-/g, '+').replace(/_/g, '/');
                body = Buffer.from(b64, 'base64').toString('utf-8');
            }

            if (part.parts) {
                traverse(part.parts);
            }
        }
    }

    if (payload.parts) {
        traverse(payload.parts);
    } else if (payload.body?.data) {
        const b64 = payload.body.data.replace(/-/g, '+').replace(/_/g, '/');
        body = Buffer.from(b64, 'base64').toString('utf-8');
    }

    return { body, attachments, inlineImages };
}

// GET /fetch - List emails
router.get("/fetch", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const pageToken = req.query.pageToken as string | undefined;
        const accountId = req.query.accountId as string | undefined;
        const q = req.query.q as string | undefined;

        // Create cache key (cache per account, page, and query)
        const cacheKey = createCacheKey('gmail:emails', userId, accountId || 'default', pageToken || 'first', q || 'all');
        const cached = getCached(cacheKey);

        if (cached) {
            logger.info({ userId, accountId, cached: true }, 'Gmail emails served from cache');
            return res.json(cached);
        }

        let gmail;
        try {
            gmail = await getGmailClient(userId, accountId);
        } catch (tokenError: any) {
            logger.error({ error: tokenError.message, userId, accountId }, "Failed to get Gmail client - token error");
            
            // Check for specific token errors
            if (tokenError.message.includes("Connection not found")) {
                return res.status(404).json({ error: "Email account not found. Please reconnect." });
            }
            if (tokenError.message.includes("Token decryption failed")) {
                return res.status(401).json({ error: "Token corrupted. Please reconnect your account." });
            }
            if (tokenError.message.includes("re-authentication is required") || tokenError.message.includes("Failed to refresh token")) {
                return res.status(401).json({ error: "Session expired. Please reconnect your Gmail account." });
            }
            return res.status(401).json({ error: "Authentication failed. Please reconnect your account." });
        }

        // List messages
        let listRes;
        try {
            listRes = await withGoogleApiRetry(
                () => gmail.users.messages.list({
                    userId: 'me',
                    maxResults: 50,
                    pageToken: pageToken,
                    q: q // Pass query to Gmail API
                }),
                { maxRetries: 3 },
                `gmail.messages.list:${accountId || 'default'}`
            );
        } catch (gmailError: any) {
            logger.error({ 
                error: gmailError.message, 
                code: gmailError.code,
                status: gmailError.status,
                userId, 
                accountId 
            }, "Gmail API list error");
            
            // Handle Gmail API specific errors
            if (gmailError.code === 401 || gmailError.code === 403) {
                return res.status(401).json({ error: "Gmail access expired. Please reconnect your account." });
            }
            if (gmailError.code === 404) {
                return res.status(404).json({ error: "Gmail mailbox not found." });
            }
            throw gmailError; // Re-throw to be caught by outer catch
        }

        const messages = listRes.data.messages || [];
        const nextPageToken = listRes.data.nextPageToken;

        // Fetch all message details in PARALLEL (much faster than sequential)
        const messagePromises = messages
            .filter(msg => msg.id)
            .map(async (msg) => {
                try {
                    const msgRes = await withGoogleApiRetry(
                        () => gmail.users.messages.get({
                            userId: 'me',
                            id: msg.id!,
                            format: 'full'
                        }),
                        { maxRetries: 2 }, // Fewer retries for individual messages
                        `gmail.messages.get:${msg.id}`
                    );

                    const payload = msgRes.data.payload;
                    if (!payload) return null;

                    const headers = payload.headers;
                    
                    const subject = headers?.find(h => h.name === 'Subject')?.value || '(No Subject)';
                    const from = headers?.find(h => h.name === 'From')?.value || 'Unknown';
                    const date = headers?.find(h => h.name === 'Date')?.value;

                    const { body, attachments, inlineImages } = parseMessagePayload(payload);
                    
                    // Convert inline images Map to array for JSON response
                    const inlineAttachments = Array.from(inlineImages.entries()).map(([contentId, img]) => {
                        if (img.data) {
                            // Convert Gmail's URL-safe base64 to standard base64
                            const standardBase64 = img.data.replace(/-/g, '+').replace(/_/g, '/');
                            return {
                                contentId,
                                dataUrl: `data:${img.mimeType};base64,${standardBase64}`
                            };
                        } else if (img.attachmentId) {
                            // Use proxy URL for large attachments
                            const accId = req.query.accountId as string || 'default';
                            return {
                                contentId,
                                dataUrl: `/api/gmail/attachment/${accId}/${msg.id}/${img.attachmentId}?mimeType=${encodeURIComponent(img.mimeType)}`
                            };
                        }
                        return null;
                    }).filter(Boolean);
                    
                    // Sanitize HTML body to prevent XSS attacks
                    const sanitizedBody = body ? sanitizeHTML(body) : '';
                    
                    const isUnread = msgRes.data.labelIds?.includes('UNREAD') || false;

                    return {
                        id: msg.id,
                        threadId: msg.threadId,
                        snippet: msgRes.data.snippet,
                        subject,
                        from,
                        date,
                        body: sanitizedBody,
                        attachments,
                        inlineAttachments,
                        read: !isUnread
                    };
                } catch (err) {
                    logger.warn({ msgId: msg.id, error: err }, "Failed to fetch message details");
                    return null;
                }
            });

        // Wait for all fetches to complete in parallel
        const results = await Promise.all(messagePromises);
        const fullMessages = results.filter(msg => msg !== null);

        const response = { 
            messages: fullMessages,
            nextPageToken
        };

        // Cache emails for 10 minutes (600 seconds) - emails are less volatile than calendar events
        setCached(cacheKey, response, 600);

        res.json(response);

    } catch (error: any) {
        logger.error({ 
            error: error.message, 
            stack: error.stack,
            code: error.code,
            userId: req.user?.id,
            accountId: req.query.accountId 
        }, "Gmail fetch error - outer catch");
        
        if (error.message === "Gmail not connected") {
            return res.status(400).json({ error: "Gmail not connected" });
        }
        
        // If we got here, it's an unexpected error
        res.status(500).json({ 
            error: "Failed to fetch emails",
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// GET /attachment/:accountId/:messageId/:attachmentId
router.get("/attachment/:accountId/:messageId/:attachmentId", requireAuth, async (req: AuthRequest, res: Response) => {
    const { accountId, messageId, attachmentId } = req.params;
    try {
        const userId = req.user!.id;
        const filename = req.query.filename as string || 'attachment';
        const mimeType = req.query.mimeType as string || 'application/octet-stream';

        const gmail = await getGmailClient(userId, accountId);

        const response = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: messageId,
            id: attachmentId
        });

        const data = response.data.data;
        if (!data) {
            return res.status(404).json({ error: "Attachment data not found" });
        }

        const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
        const buffer = Buffer.from(b64, 'base64');
        
        // Set headers for download/view
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
        
        res.send(buffer);

    } catch (error: any) {
        logger.error({ error, messageId, attachmentId }, "Gmail attachment fetch error");
        res.status(500).json({ error: "Failed to fetch attachment" });
    }
});

// POST /mark-as-read - Mark email as read
router.post("/mark-as-read", requireAuth, async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    const { messageId, accountId } = req.body;

    logger.info({ userId, messageId, accountId }, "Mark as read request received");

    if (!userId) {
        logger.warn({ messageId, accountId }, "Mark as read failed: No authenticated user");
        return res.status(401).json({ error: "Authentication required" });
    }

    if (!messageId) {
        logger.warn({ userId, accountId }, "Mark as read failed: Missing messageId");
        return res.status(400).json({ error: "Missing messageId" });
    }

    try {
        const gmail = await getGmailClient(userId, accountId);
        
        // Mark message as read by removing the UNREAD label
        const result = await withGoogleApiRetry(async () => {
            return gmail.users.messages.modify({
                userId: 'me',
                id: messageId,
                requestBody: {
                    removeLabelIds: ['UNREAD']
                }
            });
        }, { maxRetries: 2 });

        // Invalidate email cache for this account to ensure fresh data on next fetch
        // Use pattern matching to clear all cached pages for this user/account combination
        const cachePattern = `gmail:emails:${userId}:${accountId || 'default'}`;
        clearCache(cachePattern);
        
        logger.info({ 
            userId, 
            messageId, 
            accountId, 
            labelIds: result.data.labelIds 
        }, "Email marked as read successfully");

        res.json({ 
            success: true, 
            messageId,
            read: true,
            labelIds: result.data.labelIds 
        });

    } catch (error: any) {
        logger.error({ 
            error: error.message, 
            stack: error.stack,
            code: error.code,
            userId,
            messageId, 
            accountId 
        }, "Failed to mark email as read");
        
        if (error.message === "Gmail not connected") {
            return res.status(400).json({ error: "Gmail not connected" });
        }
        if (error.code === 404) {
            return res.status(404).json({ error: "Email not found" });
        }
        if (error.code === 401 || error.code === 403) {
            return res.status(401).json({ error: "Gmail access expired. Please reconnect your account." });
        }
        res.status(500).json({ error: "Failed to mark email as read" });
    }
});

// POST /send - Send email
router.post("/send", requireAuth, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { to, subject, body, accountId } = req.body;

        if (!to || !subject || !body) {
            return res.status(400).json({ error: "Missing required fields: to, subject, body" });
        }

        const gmail = await getGmailClient(userId, accountId);

        // Construct MIME message
        // Simple text/plain for now. For HTML, we'd need a multipart MIME structure.
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
        const messageParts = [
            `To: ${to}`,
            `Subject: ${utf8Subject}`,
            "Content-Type: text/plain; charset=utf-8",
            "MIME-Version: 1.0",
            "",
            body
        ];
        const message = messageParts.join("\n");

        // Base64URL encode
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');

        const sendRes = await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage
            }
        });

        // Invalidate email cache for this account
        clearCache(`gmail:emails:${userId}:${accountId || 'default'}`);

        res.json({ 
            success: true, 
            messageId: sendRes.data.id,
            threadId: sendRes.data.threadId 
        });

    } catch (error: any) {
        logger.error({ error }, "Gmail send error");
        if (error.message === "Gmail not connected") {
            return res.status(400).json({ error: "Gmail not connected" });
        }
        res.status(500).json({ error: "Failed to send email" });
    }
});

export default router;
