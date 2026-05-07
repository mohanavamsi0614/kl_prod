import { decryptToken, encryptToken } from "../utils/encryption";
import { google } from "googleapis";
import logger from "../utils/logger";
import prisma from "../lib/prisma";

// Custom error for token revocation
export class TokenRevokedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TokenRevokedError';
    }
}

// Custom error for insufficient scopes
export class InsufficientScopesError extends Error {
    public missingScopes: string[];

    constructor(message: string, missingScopes: string[] = []) {
        super(message);
        this.name = 'InsufficientScopesError';
        this.missingScopes = missingScopes;
    }
}

// In-memory cache for valid tokens (reduces DB lookups for frequently accessed tokens)
interface CachedToken {
    accessToken: string;
    expiresAt: number; // timestamp in ms
}

const tokenCache = new Map<string, CachedToken>();
const CACHE_BUFFER = 60 * 1000; // 1 minute buffer before cache expiry

// Promise locking to prevent concurrent refresh requests for the same token
const refreshLocks = new Map<string, Promise<string>>();

export class TokenManager {
    /**
     * Retrieves a valid access token for a given connection (ServiceToken ID).
     * Handles decryption, expiry check, and automatic refreshing.
     * Uses in-memory caching to reduce DB lookups.
     */
    static async getConnection(userId: string, service: string, connectionId?: string) {
        if (connectionId) {
            return prisma.serviceToken.findFirst({
                where: { id: connectionId, userId, service }
            });
        }
        return prisma.serviceToken.findFirst({
            where: { userId, service }
        });
    }

    static async getValidAccessToken(connectionId: string): Promise<string> {
        // Check cache first
        const cached = tokenCache.get(connectionId);
        if (cached && cached.expiresAt > Date.now() + CACHE_BUFFER) {
            return cached.accessToken;
        }

        const tokenRecord = await prisma.serviceToken.findUnique({
            where: { id: connectionId }
        });

        if (!tokenRecord) {
            throw new Error(`Connection not found: ${connectionId}`);
        }

        // 1. Decrypt tokens
        let accessToken: string;
        let refreshToken: string | null = null;

        try {
            accessToken = decryptToken(tokenRecord.encryptedAccessToken);
            if (tokenRecord.encryptedRefreshToken) {
                refreshToken = decryptToken(tokenRecord.encryptedRefreshToken);
            }
        } catch (error: any) {
            logger.error({ 
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                }, 
                connectionId,
                tokenFormat: tokenRecord.encryptedAccessToken?.substring(0, 50) + "..."
            }, "Failed to decrypt tokens");
            throw new Error("Token decryption failed");
        }

        // 2. Check Expiry (with 5 minute buffer)
        const now = new Date();
        const expiryBuffer = 5 * 60 * 1000; // 5 minutes
        const expiresAt = tokenRecord.expiresAt ? new Date(tokenRecord.expiresAt) : new Date(0);

        // Handle invalid or missing expiry date
        if (isNaN(expiresAt.getTime())) {
            logger.warn({ connectionId, expiresAt: tokenRecord.expiresAt }, "Invalid expiresAt date, forcing refresh");
        } else if (expiresAt.getTime() - now.getTime() > expiryBuffer) {
            // Token is still valid - cache it
            tokenCache.set(connectionId, {
                accessToken,
                expiresAt: expiresAt.getTime()
            });
            return accessToken;
        }

        // 3. Refresh Token
        if (!refreshToken) {
            logger.warn({ connectionId }, "Access token expired and no refresh token available");
            throw new Error("Access token expired and re-authentication is required");
        }

        // Check if a refresh is already in progress for this connection
        const existingRefresh = refreshLocks.get(connectionId);
        if (existingRefresh) {
            logger.info({ connectionId }, "Refresh already in progress, waiting for existing refresh");
            return existingRefresh;
        }

        // Create and store the refresh promise
        const refreshPromise = this.performTokenRefresh(connectionId, tokenRecord, refreshToken);
        refreshLocks.set(connectionId, refreshPromise);

        try {
            const newToken = await refreshPromise;
            return newToken;
        } finally {
            // Always clean up the lock
            refreshLocks.delete(connectionId);
        }
    }

    /**
     * Performs the actual token refresh operation.
     * Separated into its own method for better promise locking.
     */
    private static async performTokenRefresh(
        connectionId: string,
        tokenRecord: any,
        refreshToken: string
    ): Promise<string> {
        logger.info({ connectionId, service: tokenRecord.service, oldExpiry: tokenRecord.expiresAt?.toISOString() }, "Refreshing expired access token");

        if (tokenRecord.service === 'OUTLOOK' || tokenRecord.service === 'MICROSOFT_CALENDAR') {
            return this.refreshMicrosoftToken(connectionId, tokenRecord, refreshToken);
        }

        // Default to Google refresh
        return this.refreshGoogleToken(connectionId, tokenRecord, refreshToken);
    }

    private static async refreshMicrosoftToken(
        connectionId: string,
        tokenRecord: any,
        refreshToken: string
    ): Promise<string> {
        const axios = require('axios');
        try {
            const response = await axios.post(
                "https://login.microsoftonline.com/common/oauth2/v2.0/token",
                new URLSearchParams({
                    client_id: process.env.CLIENT_ID || "",
                    client_secret: process.env.CLIENT_SECRET || "",
                    refresh_token: refreshToken,
                    grant_type: "refresh_token",
                }),
                { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
            );

            const { access_token, refresh_token: newRefreshToken, expires_in, scope } = response.data;

            const newExpiresAt = new Date(Date.now() + expires_in * 1000);

            await prisma.serviceToken.update({
                where: { id: connectionId },
                data: {
                    encryptedAccessToken: encryptToken(access_token),
                    encryptedRefreshToken: newRefreshToken ? encryptToken(newRefreshToken) : tokenRecord.encryptedRefreshToken,
                    expiresAt: newExpiresAt,
                    grantedScopes: scope
                },
            });

            tokenCache.set(connectionId, {
                accessToken: access_token,
                expiresAt: newExpiresAt.getTime()
            });

            return access_token;
        } catch (error: any) {
            logger.error({ error: error.response?.data || error.message, connectionId }, "Failed to refresh Microsoft token");
            
            const isRevoked = error.response?.data?.error === 'invalid_grant';
            if (isRevoked) {
                await prisma.serviceToken.delete({ where: { id: connectionId } });
                tokenCache.delete(connectionId);
                throw new TokenRevokedError("Microsoft access revoked. Please reconnect.");
            }
            throw new Error("Failed to refresh Microsoft token.");
        }
    }

    private static async refreshGoogleToken(
        connectionId: string,
        tokenRecord: any,
        refreshToken: string
    ): Promise<string> {
        try {
            const oauth2Client = new google.auth.OAuth2(
                process.env.GOOGLE_CLIENT_ID,
                process.env.GOOGLE_CLIENT_SECRET
            );
            
            oauth2Client.setCredentials({
                refresh_token: refreshToken
            });

            const { credentials } = await oauth2Client.refreshAccessToken();
            const access_token = credentials.access_token;
            const newRefreshToken = credentials.refresh_token;
            const expiry_date = credentials.expiry_date;

            if (!access_token) {
                throw new Error("Failed to retrieve access token from refresh");
            }

            // expiry_date is in milliseconds from epoch
            const newExpiresAt = expiry_date ? new Date(expiry_date) : new Date(Date.now() + 3600 * 1000);
            
            await prisma.serviceToken.update({
                where: { id: connectionId },
                data: {
                    encryptedAccessToken: encryptToken(access_token),
                    encryptedRefreshToken: newRefreshToken ? encryptToken(newRefreshToken) : tokenRecord.encryptedRefreshToken,
                    expiresAt: newExpiresAt,
                },
            });

            tokenCache.set(connectionId, {
                accessToken: access_token,
                expiresAt: newExpiresAt.getTime()
            });

            return access_token;

        } catch (error: any) {
            logger.error({ error: error.message, connectionId, code: error.code, response: error.response?.data }, "Failed to refresh token");
            
            const isRevoked = 
                error.response?.data?.error === 'invalid_grant' ||
                error.code === '400' ||
                error.message?.includes('invalid_grant') ||
                error.message?.includes('Token has been expired or revoked');
            
            if (isRevoked) {
                try {
                    await prisma.serviceToken.delete({ where: { id: connectionId } });
                    tokenCache.delete(connectionId);
                    logger.warn({ connectionId }, "Deleted revoked token from database");
                } catch (deleteErr) {
                    logger.warn({ connectionId, deleteErr }, "Failed to delete revoked token");
                }
                throw new TokenRevokedError("Access revoked. Please reconnect your account.");
            }
            
            throw new Error("Failed to refresh token. Please reconnect your account.");
        }
    }

    /**
     * Validates that a token has all required scopes for a service
     * Throws InsufficientScopesError if validation fails
     */
    static async ensureTokenHasScopes(connectionId: string, service: 'GMAIL' | 'CALENDAR' | 'TASKS' | 'DRIVE' | 'OUTLOOK' | 'MICROSOFT_CALENDAR'): Promise<void> {
        const tokenRecord = await prisma.serviceToken.findUnique({
            where: { id: connectionId }
        });

        if (!tokenRecord) {
            throw new Error(`Connection not found: ${connectionId}`);
        }

        // Handle missing or empty grantedScopes gracefully
        if (!tokenRecord.grantedScopes || tokenRecord.grantedScopes.trim() === '') {
            logger.warn({ connectionId, service, userId: tokenRecord.userId }, 
                'Token has no recorded scopes - forcing re-authentication');
            throw new InsufficientScopesError(
                `Token scopes not recorded. Please reconnect your ${service.toLowerCase()} account.`,
                []
            );
        }

        const grantedScopes = tokenRecord.grantedScopes.split(',').map(s => s.trim());
        
        const requiredScopes: Record<string, string[]> = {
            'GMAIL': [
                'https://www.googleapis.com/auth/gmail.readonly',
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/gmail.modify'
            ],
            'CALENDAR': [
                'https://www.googleapis.com/auth/calendar',
                'https://www.googleapis.com/auth/calendar.events'
            ],
            'TASKS': [
                'https://www.googleapis.com/auth/tasks'
            ],
            'DRIVE': [
                'https://www.googleapis.com/auth/drive.readonly',
                'https://www.googleapis.com/auth/drive.file'
            ],
            'OUTLOOK': [
                'Mail.Read',
                'Mail.Send'
            ],
            'MICROSOFT_CALENDAR': [
                'Calendars.ReadWrite'
            ]
        };

        const serviceScopesRequired = requiredScopes[service];
        const missingScopes = serviceScopesRequired.filter(scope => !grantedScopes.includes(scope));

        if (missingScopes.length > 0) {
            logger.warn({ connectionId, service, grantedScopes, missingScopes, userId: tokenRecord.userId }, 
                `Token missing required scopes for ${service}`);
            throw new InsufficientScopesError(
                `Token is missing required scopes for ${service}. Forcing re-authentication.`,
                missingScopes
            );
        }

        logger.debug({ connectionId, service, grantedScopes }, `Token has all required scopes for ${service}`);
    }
}
