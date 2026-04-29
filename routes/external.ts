import express from "express";
import crypto from "crypto";
import { generateTokenPair } from "../utils/jwt";
import logger from "../utils/logger";
import prisma from "../lib/prisma";
import { normalizePhoneNumber } from "../utils/phone";

const router = express.Router();

// Environment variable for external API secret
const EXTERNAL_API_SECRET = process.env.EXTERNAL_API_SECRET;

if (!EXTERNAL_API_SECRET) {
    logger.warn("EXTERNAL_API_SECRET is not defined - external API endpoints will reject all requests");
}

/**
 * External API: Get User Token by Phone Number
 * 
 * This endpoint allows trusted external backends to obtain access tokens
 * for users by their phone number. This enables M2M (machine-to-machine)
 * authentication for accessing user resources (calendar, gmail, etc.)
 * 
 * Security:
 * - Requires a shared secret token (stored in .env)
 * - Only returns tokens for existing users
 * - Logs all access attempts for audit
 * - Uses constant-time comparison to prevent timing attacks
 * 
 * POST /external/getUserToken
 * Body: { phone_number: string, secret_token: string }
 * Response: { success: true, access_token: string, refresh_token: string, user: {...} }
 */
router.post("/getUserToken", async (req, res) => {
    const { phone_number, secret_token } = req.body;
    
    // Get request metadata for logging
    const requestIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Validate required fields
    if (!phone_number || !secret_token) {
        logger.warn({ 
            ip: requestIp, 
            hasPhone: !!phone_number, 
            hasToken: !!secret_token 
        }, "External API: Missing required fields");
        
        return res.status(400).json({ 
            success: false,
            error: "Missing required fields: phone_number and secret_token are required" 
        });
    }

    // Validate secret token
    if (!EXTERNAL_API_SECRET) {
        logger.error("External API: EXTERNAL_API_SECRET not configured");
        return res.status(503).json({ 
            success: false,
            error: "Service not configured" 
        });
    }

    // Constant-time comparison to prevent timing attacks
    let isValidToken = false;
    try {
        const secretBuffer = Buffer.from(String(secret_token));
        const expectedBuffer = Buffer.from(EXTERNAL_API_SECRET);
        
        if (secretBuffer.length === expectedBuffer.length) {
            isValidToken = crypto.timingSafeEqual(secretBuffer, expectedBuffer);
        }
    } catch (error) {
        // If comparison fails for any reason, token is invalid
        isValidToken = false;
    }

    if (!isValidToken) {
        logger.warn({ 
            ip: requestIp, 
            userAgent,
            phoneNumber: phone_number 
        }, "External API: Invalid secret token attempt");
        
        return res.status(401).json({ 
            success: false,
            error: "Invalid secret token" 
        });
    }

    // Normalize phone number to E.164 format
    const phoneResult = normalizePhoneNumber(phone_number);
    if (!phoneResult.success) {
        logger.warn({ 
            ip: requestIp, 
            phoneNumber: phone_number,
            error: phoneResult.error 
        }, "External API: Invalid phone number format");
        
        return res.status(400).json({ 
            success: false,
            error: phoneResult.error 
        });
    }
    const normalizedPhone = phoneResult.normalized;

    try {
        // Find user by phone number
        const user = await prisma.user.findUnique({
            where: { whatsappPhone: normalizedPhone },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                whatsappPhone: true
            }
        });

        if (!user) {
            logger.warn({ 
                ip: requestIp, 
                phoneNumber: normalizedPhone 
            }, "External API: User not found");
            
            return res.status(404).json({ 
                success: false,
                error: "User not found" 
            });
        }

        // Generate tokens for the user
        const tokens = generateTokenPair(user.id, user.email || "");

        // Log successful token generation
        logger.info({ 
            ip: requestIp,
            userId: user.id,
            phoneNumber: normalizedPhone,
            userAgent
        }, "External API: Token generated successfully");

        // Return tokens and user info
        res.json({
            success: true,
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            expires_in: 604800, // 7 days in seconds (matches JWT_EXPIRES_IN)
            token_type: "Bearer",
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                whatsappPhone: user.whatsappPhone
            }
        });

    } catch (error) {
        logger.error({ 
            error, 
            ip: requestIp, 
            phoneNumber: normalizedPhone 
        }, "External API: Error generating token");
        
        res.status(500).json({ 
            success: false,
            error: "Internal server error" 
        });
    }
});

/**
 * Health check for external API
 * Allows external services to verify connectivity without authentication
 */
router.get("/health", (req, res) => {
    res.json({ 
        success: true,
        service: "AskOrb External API",
        timestamp: new Date().toISOString()
    });
});

export default router;
