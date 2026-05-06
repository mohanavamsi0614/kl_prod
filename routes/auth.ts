import express from "express";
import passport from "../lib/auth";
import { requireAuth, AuthRequest, optionalAuth } from "../middleware/auth";
import { generateTokenPair, verifyRefreshToken, verifyAccessToken } from "../utils/jwt";
import logger from "../utils/logger";
import { hashPassword } from "../utils/password";
import { encryptToken } from "../utils/encryption";
import jwt from "jsonwebtoken";
import prisma from "../lib/prisma";
import { setAuthCookies, clearAuthCookies } from "../utils/cookies";
import { clearCache, createCacheKey } from '../utils/cache';
import { normalizePhoneNumber } from "../utils/phone";
import axios from "axios";

const router = express.Router();

if (!process.env.VITE_API_URL) {
    throw new Error('VITE_API_URL environment variable is required');
}

// Use VITE_API_URL directly, ensuring no trailing slash
const rawClientUrl = process.env.VITE_API_URL;
const CLIENT_URL = rawClientUrl.endsWith('/') ? rawClientUrl.slice(0, -1) : rawClientUrl;

// Microsoft OAuth Constants
const MS_AUTH_BASE = "https://login.microsoftonline.com/common/oauth2/v2.0";
const MS_CLIENT_ID = process.env.CLIENT_ID;
const MS_CLIENT_SECRET = process.env.CLIENT_SECRET;
const MS_REDIRECT_URI = process.env.REDIRECT_URI || `${CLIENT_URL}/auth/microsoft/callback`;

// NOTE: Rate limiting for auth routes is handled at the server level (server.ts)
// with PostgreSQL-backed storage for production scalability.

// Initiate Google OAuth (stateless)
router.get("/google", (req, res, next) => {
    // Check for existing authentication to support linking
    const token = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;
    const category = req.query.category as string; // Capture category from query
    let service = (req.query.service as string) || 'AUTH'; // Default to AUTH for basic sign-in/sign-up

    // Validate service parameter - AUTH is for basic sign-in, GMAIL/CALENDAR/TASKS/DRIVE for linking
    if (service !== 'GMAIL' && service !== 'CALENDAR' && service !== 'TASKS' && service !== 'DRIVE' && service !== 'AUTH') {
        logger.warn({ service, query: req.query }, "Invalid service parameter in OAuth request, defaulting to AUTH");
        service = 'AUTH';
    }

    let state = undefined;
    let userId = undefined;

    // Try to get user ID from access token
    if (token) {
        try {
            const decoded = verifyAccessToken(token);
            if (decoded && decoded.userId) {
                userId = decoded.userId;
            }
        } catch (e) {
            // Ignore invalid tokens
        }
    }

    // Fallback: Try to get user ID from refresh token if access token failed
    if (!userId && refreshToken) {
        try {
            const decoded = verifyRefreshToken(refreshToken);
            if (decoded && decoded.userId) {
                userId = decoded.userId;
            }
        } catch (e) {
            // Ignore invalid tokens
        }
    }

    // Encode state: { userId: "...", category: "...", service: "...", isLinking: true/false }
    // Always include service/category so we know where to redirect, even if userId is inferred later
    // isLinking = true when user is already authenticated (linking new service)
    // isLinking = false when user is logging in/signing up
    const stateObj: any = {
        category: category || 'Personal',
        service: service,
        isLinking: !!userId // If userId exists, it's a linking operation
    };
    if (userId) {
        stateObj.userId = userId;
    }

    state = Buffer.from(JSON.stringify(stateObj)).toString('base64');

    // Define scopes based on service
    // AUTH = basic sign-in/sign-up (profile + email only)
    // GMAIL/CALENDAR/TASKS = linking specific services (includes additional scopes)
    const scopes = ["profile", "email"];
    if (service === 'GMAIL') {
        scopes.push(
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.modify"
        );
    } else if (service === 'CALENDAR') {
        scopes.push(
            "https://www.googleapis.com/auth/calendar",
            "https://www.googleapis.com/auth/calendar.events"
        );
    } else if (service === 'TASKS') {
        // Full tasks scope for bi-directional sync (read/write)
        scopes.push(
            "https://www.googleapis.com/auth/tasks"
        );
    } else if (service === 'DRIVE') {
        // Google Drive scopes - read access to all files + write access to app-created files
        scopes.push(
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/drive.file"
        );
    }
    // AUTH service only uses profile + email, no additional scopes

    passport.authenticate("google", {
        scope: scopes,
        session: false,
        accessType: 'offline',
        prompt: 'consent',
        state: state
    })(req, res, next);
});

// Google OAuth callback
router.get(
    "/google/callback",
    passport.authenticate("google", { session: false, failureRedirect: `${CLIENT_URL}/login?error=google_auth_cancelled` }),
    async (req, res) => {
        const userOrProfile = req.user as any;

        if (!userOrProfile) {
            return res.redirect(`${CLIENT_URL}/?error=auth_failed`);
        }

        // Check if it's a full user (has id) or just a profile (needs linking)
        if (userOrProfile.id && !userOrProfile.provider) {
            // It's a user (either logged in via existing identity OR linked to current user)
            const user = userOrProfile;

            // If we were already logged in, we don't strictly need to set cookies again, but it refreshes them.
            // However, if we were linking, we want to redirect back to dashboard/calendar, not just "auth=success".

            // Check if we came from a linking flow (we can infer this if the user ID matches the cookie, but simpler to just redirect)
            // Ideally we'd use 'state' param to know where to redirect, but for now let's default to dashboard if it looks like a link operation.

            const tokens = generateTokenPair(user.id, user.email || "");
            setAuthCookies(res, tokens);

            // Determine redirect URL based on state or user's attached service
            let redirectUrl = `${CLIENT_URL}/dashboard?auth=success`;
            let service: string | undefined;
            let isLinking = false;

            // First try: Get service from state param (passed through by Google OAuth)
            const stateParam = req.query.state as string | undefined;
            if (stateParam) {
                try {
                    const stateJson = Buffer.from(stateParam, 'base64').toString('utf-8');
                    const state = JSON.parse(stateJson);
                    service = state.service;
                    isLinking = state.isLinking === true;
                    logger.info({ service, isLinking, state }, "OAuth callback - parsed state");
                } catch (e) {
                    logger.warn({ error: e }, "Failed to parse OAuth state");
                }
            }

            // Second try: Get service attached by passport callback
            if (!service && (user as any)._oauthService) {
                service = (user as any)._oauthService;
                isLinking = true; // If service was attached by passport, it's always a linking operation
                logger.info({ service, isLinking }, "OAuth callback - using attached service");
            }

            // Set redirect URL based on whether this is a linking operation or initial login
            // For linking: redirect to the specific service page
            // For initial login/signup: redirect to dashboard
            if (isLinking) {
                if (service === 'CALENDAR') {
                    redirectUrl = `${CLIENT_URL}/dashboard/calendar?auth=success`;
                } else if (service === 'GMAIL') {
                    redirectUrl = `${CLIENT_URL}/dashboard/email?auth=success`;
                } else if (service === 'TASKS') {
                    redirectUrl = `${CLIENT_URL}/dashboard/tasks?auth=success`;
                } else if (service === 'DRIVE') {
                    redirectUrl = `${CLIENT_URL}/dashboard/files?auth=success`;
                } else {
                    redirectUrl = `${CLIENT_URL}/dashboard?auth=success`;
                }
            } else {
                // Initial login/signup - always go to dashboard regardless of service
                redirectUrl = `${CLIENT_URL}/dashboard?auth=success`;
            }

            logger.info({ redirectUrl, service }, "OAuth callback - redirecting");
            return res.redirect(redirectUrl);
        } else {
            // It's a profile, need to link
            const profile = userOrProfile;
            // Create a temporary token with profile info
            const tempToken = jwt.sign(
                {
                    googleId: profile.id,
                    email: profile.emails?.[0]?.value,
                    firstName: profile.name?.givenName || profile.displayName,
                    lastName: profile.name?.familyName || ""
                },
                process.env.JWT_SECRET!,
                { expiresIn: '15m' }
            );

            // Redirect to frontend with temp token to complete signup
            return res.redirect(`${CLIENT_URL}/?auth=link_required&token=${tempToken}`);
        }
    }
);

// --- Microsoft OAuth ---

// Initiate Microsoft OAuth
router.get("/microsoft", (req, res) => {
    const service = (req.query.service as string) || "AUTH";
    const category = (req.query.category as string) || "Personal";

    const userId = req.cookies?.userId;

    const stateObj: any = {
        category,
        service,
        isLinking: !!userId
    };

    if (userId) {
        stateObj.userId = userId;
    }

    const state = Buffer
        .from(JSON.stringify(stateObj))
        .toString("base64");

    const scopes = [
        "openid",
        "profile",
        "email",
        "User.Read",
        "offline_access"
    ];

    if (service === "MAIL") {
        scopes.push(
            "Mail.Read",
            "Mail.Send"
        );
    }
    else if (service === "CALENDAR") {
        scopes.push(
            "Calendars.ReadWrite"
        );
    }

    const params: any = {
        client_id: MS_CLIENT_ID || "",
        response_type: "code",
        redirect_uri: MS_REDIRECT_URI,
        response_mode: "query",
        scope: scopes.join(" "),
        state
    };

    const paramsObj = new URLSearchParams(params);

    logger.info({ service, scopes, isLinking: !!userId }, "Initiating Microsoft OAuth");

    res.redirect(
        `${MS_AUTH_BASE}/authorize?${paramsObj.toString()}`
    );
});

// Microsoft OAuth Callback
router.get("/microsoft/callback", async (req, res) => {
    const code = req.query.code as string;
    const stateParam = req.query.state as string;

    if (!code) return res.redirect(`${CLIENT_URL}/login?error=microsoft_auth_cancelled`);

    try {
        // Exchange code for tokens
        const tokenRes = await axios.post(
            `${MS_AUTH_BASE}/token`,
            new URLSearchParams({
                client_id: MS_CLIENT_ID || "",
                client_secret: MS_CLIENT_SECRET || "",
                code,
                grant_type: "authorization_code",
                redirect_uri: MS_REDIRECT_URI
            }),
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const { access_token, refresh_token } = tokenRes.data;

        // Get Microsoft Profile
        const profileRes = await axios.get("https://graph.microsoft.com/v1.0/me", {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const profile = {
            id: profileRes.data.id,
            displayName: profileRes.data.displayName,
            email: profileRes.data.mail || profileRes.data.userPrincipalName,
            firstName: profileRes.data.givenName || profileRes.data.displayName,
            lastName: profileRes.data.surname || ""
        };

        // Parse state
        let service = 'AUTH';
        let isLinking = false;
        if (stateParam) {
            try {
                const state = JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8'));
                service = state.service;
                isLinking = state.isLinking;
            } catch (e) {
                logger.warn({ error: e }, "Failed to parse MS OAuth state");
            }
        }

        // Check if identity exists
        const existingIdentity = await prisma.userAuthIdentity.findUnique({
            where: {
                provider_providerUid: {
                    provider: 'MICROSOFT',
                    providerUid: profile.id
                }
            },
            include: { user: true }
        });

        if (existingIdentity) {
            const user = existingIdentity.user;

            // 1. Log in existing user
            const tokens = generateTokenPair(user.id, profile.email);
            setAuthCookies(res, tokens);

            if (service === 'MAIL' || service === 'CALENDAR' || isLinking) {
                const msService = service === 'CALENDAR' ? 'MICROSOFT_CALENDAR' : 'OUTLOOK';

                await prisma.serviceToken.upsert({
                    where: {
                        userId_service_accountEmail: {
                            userId: user.id,
                            service: msService,
                            accountEmail: profile.email
                        }
                    },
                    update: {
                        encryptedAccessToken: encryptToken(access_token),
                        encryptedRefreshToken: refresh_token ? encryptToken(refresh_token) : undefined,
                        expiresAt: new Date(Date.now() + tokenRes.data.expires_in * 1000),
                        grantedScopes: tokenRes.data.scope,
                        category: (stateParam ? JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8')).category : 'Personal') || 'Personal'
                    },
                    create: {
                        userId: user.id,
                        service: msService,
                        accountEmail: profile.email,
                        encryptedAccessToken: encryptToken(access_token),
                        encryptedRefreshToken: refresh_token ? encryptToken(refresh_token) : undefined,
                        expiresAt: new Date(Date.now() + tokenRes.data.expires_in * 1000),
                        grantedScopes: tokenRes.data.scope,
                        category: (stateParam ? JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8')).category : 'Personal') || 'Personal'
                    }
                });

                // Initialize real-time subscription if it's Outlook mail
                if (msService === 'OUTLOOK') {
                    try {
                        const { OutlookSyncService } = require('../services/outlookSyncService');
                        await OutlookSyncService.subscribeToMail(
                            (await prisma.serviceToken.findFirst({ where: { userId: user.id, service: 'OUTLOOK', accountEmail: profile.email } }))?.id || "",
                            user.id
                        );
                    } catch (e) {
                        logger.error({ err: e, userId: user.id }, "Failed to start Outlook subscription during login");
                    }
                }

                clearCache(createCacheKey('connections', user.id));
            }

            let redirectUrl = `${CLIENT_URL}/dashboard?auth=success`;
            if (service === 'CALENDAR') redirectUrl = `${CLIENT_URL}/dashboard/calendar?auth=success`;
            else if (service === 'MAIL') redirectUrl = `${CLIENT_URL}/dashboard/email?auth=success`;

            return res.redirect(redirectUrl);
        } else {
            // New Microsoft User - Need to link phone
            const tempToken = jwt.sign(
                {
                    microsoftId: profile.id,
                    email: profile.email,
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    provider: 'MICROSOFT',
                    accessToken: access_token,
                    refreshToken: refresh_token,
                    expiresIn: tokenRes.data.expires_in,
                    grantedScopes: tokenRes.data.scope,
                    service: service,
                    category: (stateParam ? JSON.parse(Buffer.from(stateParam, 'base64').toString('utf-8')).category : 'Personal') || 'Personal'
                },
                process.env.JWT_SECRET!,
                { expiresIn: '15m' }
            );

            return res.redirect(`${CLIENT_URL}/?auth=link_required&token=${tempToken}&provider=MICROSOFT`);
        }

    } catch (err: any) {
        logger.error({ error: err.response?.data || err.message }, "Microsoft OAuth Error");
        res.redirect(`${CLIENT_URL}/login?error=${err.response?.data?.error}`);
    }
});

// Complete Microsoft Linking / Signup
router.post("/microsoft/link", async (req, res) => {
    const { token, whatsappPhone } = req.body;

    if (!token || !whatsappPhone) {
        return res.status(400).json({ error: "Missing token or phone number" });
    }

    const phoneResult = normalizePhoneNumber(whatsappPhone);
    if (!phoneResult.success) return res.status(400).json({ error: phoneResult.error });
    const normalizedPhone = phoneResult.normalized;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
        if (decoded.provider !== 'MICROSOFT') throw new Error("Invalid provider");

        const { microsoftId, email, firstName, lastName, accessToken, refreshToken, expiresIn, grantedScopes, service, category } = decoded;

        let user = await prisma.user.findUnique({ where: { whatsappPhone: normalizedPhone } });

        if (user) {
            await prisma.userAuthIdentity.create({
                data: {
                    userId: user.id,
                    provider: 'MICROSOFT',
                    providerUid: microsoftId,
                    identityData: { email, firstName, lastName }
                }
            });
            if (!user.email) {
                user = await prisma.user.update({ where: { id: user.id }, data: { email } });
            }
        } else {
            user = await prisma.user.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    whatsappPhone: normalizedPhone,
                    identities: {
                        create: {
                            provider: 'MICROSOFT',
                            providerUid: microsoftId,
                            identityData: { email, firstName, lastName }
                        }
                    }
                }
            });
        }

        const tokens = generateTokenPair(user.id, user.email || "");
        setAuthCookies(res, tokens);
        res.json({ success: true, user });

    } catch (error) {
        logger.error({ error }, "Error linking Microsoft account");
        res.status(500).json({ error: "Failed to link account" });
    }
});

// Complete Google Linking / Signup
router.post("/google/link", async (req, res) => {
    const { token, whatsappPhone } = req.body;

    if (!token || !whatsappPhone) {
        return res.status(400).json({ error: "Missing token or phone number" });
    }

    // Validate and normalize phone to E.164 format
    const phoneResult = normalizePhoneNumber(whatsappPhone);
    if (!phoneResult.success) {
        return res.status(400).json({ error: phoneResult.error });
    }
    const normalizedPhone = phoneResult.normalized;

    if (!process.env.JWT_SECRET) {
        logger.error("JWT_SECRET is not defined");
        return res.status(500).json({ error: "Internal server error" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
        const { googleId, email, firstName, lastName } = decoded;

        // Check if user with phone exists
        let user = await prisma.user.findUnique({
            where: { whatsappPhone: normalizedPhone }
        });

        if (user) {
            // Link to existing user
            // Check if identity already exists
            const existingIdentity = await prisma.userAuthIdentity.findUnique({
                where: {
                    provider_providerUid: {
                        provider: 'GOOGLE',
                        providerUid: googleId
                    }
                }
            });

            if (existingIdentity) {
                return res.status(409).json({ error: "Google account already linked" });
            }

            // Create identity
            await prisma.userAuthIdentity.create({
                data: {
                    userId: user.id,
                    provider: 'GOOGLE',
                    providerUid: googleId,
                    identityData: { email, firstName, lastName }
                }
            });

            // Update email if missing
            if (!user.email) {
                user = await prisma.user.update({
                    where: { id: user.id },
                    data: { email }
                });
            }
        } else {
            // Create new user with nested identity creation (atomic)
            user = await prisma.user.create({
                data: {
                    firstName,
                    lastName,
                    email,
                    whatsappPhone: normalizedPhone,
                    identities: {
                        create: {
                            provider: 'GOOGLE',
                            providerUid: googleId,
                            identityData: { email, firstName, lastName }
                        }
                    }
                }
            });
        }

        const tokens = generateTokenPair(user.id, user.email || "");
        setAuthCookies(res, tokens);

        const safeUser = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            whatsappPhone: user.whatsappPhone
        };


        res.json({ success: true, user: safeUser });

    } catch (error) {
        logger.error({ error }, "Error linking Google account");
        res.status(500).json({ error: "Failed to link account" });
    }
});

// Form Registration
router.post("/register", async (req, res) => {
    const { firstName, lastName, whatsappPhone, password } = req.body;

    if (!firstName || !whatsappPhone || !password) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate and normalize phone to E.164 format
    const phoneResult = normalizePhoneNumber(whatsappPhone);
    if (!phoneResult.success) {
        return res.status(400).json({ error: phoneResult.error });
    }
    const normalizedPhone = phoneResult.normalized;

    // Validate password strength
    if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long" });
    }

    try {
        const existingUser = await prisma.user.findUnique({
            where: { whatsappPhone: normalizedPhone }
        });

        if (existingUser) {
            return res.status(409).json({ error: "Phone number already registered" });
        }

        const passwordHash = await hashPassword(password);

        const user = await prisma.user.create({
            data: {
                firstName,
                lastName: lastName || null,
                whatsappPhone: normalizedPhone,
                passwordHash,
                identities: {
                    create: {
                        provider: 'FORM',
                        providerUid: normalizedPhone,
                        identityData: {}
                    }
                }
            }
        });

        const tokens = generateTokenPair(user.id, user.email || "");
        setAuthCookies(res, tokens);

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                whatsappPhone: user.whatsappPhone
            }
        });

    } catch (error) {
        logger.error({ error }, "Error registering user");
        res.status(500).json({ error: "Registration failed" });
    }
});

// Merge Account (Mock OTP)
router.post("/merge", async (req, res) => {
    const { whatsappPhone, otp, password } = req.body;

    if (!whatsappPhone || !otp) {
        return res.status(400).json({ error: "Missing phone number or OTP" });
    }

    // Validate and normalize phone to E.164 format
    const phoneResult = normalizePhoneNumber(whatsappPhone);
    if (!phoneResult.success) {
        return res.status(400).json({ error: phoneResult.error });
    }
    const normalizedPhone = phoneResult.normalized;

    // Mock OTP Verification (In production, verify against Redis/DB)
    if (otp !== "123456") {
        return res.status(400).json({ error: "Invalid OTP" });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { whatsappPhone: normalizedPhone }
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // If password provided, update it (Merge flow)
        if (password) {
            const passwordHash = await hashPassword(password);
            await prisma.user.update({
                where: { id: user.id },
                data: { passwordHash }
            });

            // Ensure FORM identity exists
            const formIdentity = await prisma.userAuthIdentity.findUnique({
                where: {
                    provider_providerUid: {
                        provider: 'FORM',
                        providerUid: normalizedPhone
                    }
                }
            });

            if (!formIdentity) {
                await prisma.userAuthIdentity.create({
                    data: {
                        userId: user.id,
                        provider: 'FORM',
                        providerUid: normalizedPhone,
                        identityData: {}
                    }
                });
            }
        }

        const tokens = generateTokenPair(user.id, user.email || "");
        setAuthCookies(res, tokens);

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                whatsappPhone: user.whatsappPhone
            }
        });

    } catch (error) {
        logger.error({ error }, "Error merging account");
        res.status(500).json({ error: "Merge failed" });
    }
});

// Login
router.post("/login", (req, res, next) => {
    passport.authenticate("local", { session: false }, (err: any, user: any, info: any) => {
        if (err) return next(err);
        if (!user) return res.status(401).json({ error: info?.message || "Login failed" });

        const tokens = generateTokenPair(user.id, user.email || "");
        setAuthCookies(res, tokens);

        res.json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                whatsappPhone: user.whatsappPhone
            }
        });
    })(req, res, next);
});

// Get current user (requires JWT authentication)
router.get("/me", requireAuth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user!.id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                whatsappPhone: true
            },
        });

        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({ user });
    } catch (error) {
        logger.error({ error }, "Error fetching user");
        res.status(500).json({ error: "Failed to fetch user" });
    }
});

// Refresh access token using refresh token (stateless)
router.post("/refresh", async (req, res) => {
    try {
        const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({
                error: "No refresh token provided",
            });
        }

        const decoded = verifyRefreshToken(refreshToken);

        if (!decoded) {
            return res.status(401).json({
                error: "Invalid or expired refresh token",
            });
        }

        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
        });

        if (!user) {
            return res.status(401).json({
                error: "User not found",
            });
        }

        const tokens = generateTokenPair(user.id, user.email || "");
        setAuthCookies(res, tokens);

        logger.info({ userId: user.id }, "Tokens refreshed successfully");

        res.json({
            success: true,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
        });
    } catch (error) {
        logger.error({ error }, "Token refresh failed");
        res.status(500).json({ error: "Token refresh failed" });
    }
});

// Logout (clear cookies - stateless)
router.post("/logout", (req, res) => {
    // Get user ID before clearing cookies to clear their cache
    const token = req.cookies?.accessToken;
    let userId: string | null = null;

    if (token) {
        try {
            const decoded = verifyAccessToken(token);
            if (decoded) {
                userId = decoded.userId;
            }
        } catch (e) {
            // Ignore invalid tokens
        }
    }

    // Clear connection cache for this user to prevent stale data after re-login
    if (userId) {
        clearCache(createCacheKey('connections', userId));
        logger.info({ userId }, "Cleared connections cache on logout");
    }

    clearAuthCookies(res);

    logger.info("User logged out successfully");

    res.json({
        success: true,
        message: "Logged out successfully",
    });
});

// Check authentication status (optional auth)
router.get("/status", optionalAuth, async (req, res) => {
    if (!req.user) {
        return res.json({
            authenticated: false,
            user: null,
        });
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                whatsappPhone: true
            },
        });

        res.json({
            authenticated: !!user,
            user,
        });
    } catch (error) {
        logger.error({ error }, "Error checking auth status");
        res.json({
            authenticated: false,
            user: null,
        });
    }
});

// Re-authenticate a connection with missing scopes
// This endpoint returns a redirect URL that the frontend should open to re-auth silently
// GET /auth/detect-country - Detect user's country from server
router.get("/detect-country", async (req, res) => {
    // Return default US values directly without external API calls
    res.json({
        countryCode: '+1',
        countryIso: 'US'
    });
});

router.post("/reauth-connection", requireAuth, async (req: AuthRequest, res) => {
    const { connectionId, service } = req.body;
    const userId = req.user?.id;

    if (!connectionId || !service) {
        return res.status(400).json({ error: "Missing connectionId or service" });
    }

    if (!['GMAIL', 'CALENDAR'].includes(service)) {
        return res.status(400).json({ error: "Invalid service" });
    }

    try {
        // Try to find the connection
        const connection = await prisma.serviceToken.findUnique({
            where: { id: connectionId },
            select: { userId: true, service: true, accountEmail: true }
        });

        // Verify ownership if connection exists
        if (connection) {
            if (connection.userId !== userId) {
                return res.status(403).json({ error: "Access denied to this connection" });
            }

            if (connection.service !== service) {
                return res.status(400).json({ error: "Service mismatch" });
            }
        }

        // Encode reauth data in OAuth state parameter (persists across redirects)
        const stateData = {
            userId,
            service,
            reauth: true,
            connectionId: connection ? connectionId : null,
            accountEmail: connection?.accountEmail,
            category: 'Personal' // Default category for reauth
        };

        const state = Buffer.from(JSON.stringify(stateData)).toString('base64');
        const authUrl = `${process.env.VITE_API_URL || 'http://localhost:4000'}/auth/google?service=${service}&state=${encodeURIComponent(state)}`;

        logger.info({ userId, connectionId, service }, "Generating re-auth URL with state parameter");
        res.json({ authUrl });

    } catch (error: any) {
        logger.error({ error, connectionId, service, userId }, "Failed to initiate re-authentication");
        res.status(500).json({ error: "Failed to initiate re-authentication" });
    }
});

export default router;