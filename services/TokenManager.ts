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
        logger.info({ connectionId, oldExpiry: tokenRecord.expiresAt?.toISOString() }, "Refreshing expired access token");

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

            // 4. Update DB
            // expiry_date is in milliseconds from epoch
            const newExpiresAt = expiry_date ? new Date(expiry_date) : new Date(Date.now() + 3600 * 1000);
            
            await prisma.serviceToken.update({
                where: { id: connectionId },
                data: {
                    encryptedAccessToken: encryptToken(access_token),
                    // Preserve existing refresh token if Google doesn't rotate it
                    encryptedRefreshToken: newRefreshToken ? encryptToken(newRefreshToken) : tokenRecord.encryptedRefreshToken,
                    expiresAt: newExpiresAt,
                },
            });

            // NOTE: Do NOT sync tokens across services (GMAIL/CALENDAR)
            // Each service has its own OAuth scopes. Syncing tokens causes 403 errors
            // because a GMAIL-scoped token cannot be used for CALENDAR operations.

            // Cache the new token
            tokenCache.set(connectionId, {
                accessToken: access_token,
                expiresAt: newExpiresAt.getTime()
            });

            return access_token;

        } catch (error: any) {
            logger.error({ error: error.message, connectionId, code: error.code, response: error.response?.data }, "Failed to refresh token");
            
            // Check for token revocation or invalid grant
            const isRevoked = 
                error.response?.data?.error === 'invalid_grant' ||
                error.code === '400' ||
                error.message?.includes('invalid_grant') ||
                error.message?.includes('Token has been expired or revoked');
            
            if (isRevoked) {
                // Delete the invalid token from DB
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
    static async ensureTokenHasScopes(connectionId: string, service: 'GMAIL' | 'CALENDAR' | 'TASKS' | 'DRIVE'): Promise<void> {
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
