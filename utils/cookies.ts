import { Response } from "express";
import { generateCsrfToken, setCsrfCookie } from "../middleware/csrf";

// Cookie expiry constants
const ACCESS_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;  // 7 days
const REFRESH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Sets authentication cookies (accessToken, refreshToken) with proper security settings.
 * Also sets the CSRF token cookie.
 */
export function setAuthCookies(
    res: Response, 
    tokens: { accessToken: string; refreshToken: string }
): void {
    const isProduction = process.env.NODE_ENV === "production";
    
    const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "strict" as const : "lax" as const,
    };

    res.cookie("accessToken", tokens.accessToken, {
        ...cookieOptions,
        maxAge: ACCESS_TOKEN_MAX_AGE,
    });

    res.cookie("refreshToken", tokens.refreshToken, {
        ...cookieOptions,
        maxAge: REFRESH_TOKEN_MAX_AGE,
    });

    // Set CSRF Token
    const csrfToken = generateCsrfToken();
    setCsrfCookie(res, csrfToken);
}

/**
 * Clears all authentication cookies.
 */
export function clearAuthCookies(res: Response): void {
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.clearCookie("csrf_token");
}
