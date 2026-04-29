import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import logger from "../utils/logger";

export interface PublicUser {
	id: string;
	email: string | null;
    firstName: string | null;
    lastName: string | null;
    whatsappPhone: string | null;
}

export interface AuthRequest extends Request {
	user?: PublicUser;
}

/**
 * Extracts the JWT from the request's Authorization header or cookies.
 * @param req The Express request object.
 * @returns The token string or null if not found.
 */
function getTokenFromRequest(req: Request): string | null {
	const authHeader = req.headers.authorization;
	const cookieToken = (req as any).cookies?.accessToken;

	// Prefer the "Bearer" token from the header if it exists
	if (authHeader?.startsWith("Bearer ")) {
		return authHeader.substring(7);
	}

	// Otherwise, fall back to the cookie
	if (cookieToken) {
		return cookieToken;
	}

	// If no token is found, return null
	return null;
}

/**
 * Middleware to require JWT authentication
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
	try {
		const token = getTokenFromRequest(req);

		if (!token) {
			return res.status(401).json({
				error: "Unauthorized",
				message: "No token provided. Please login first.",
			});
		}

		// Verify token
		const decoded = verifyAccessToken(token);

		if (!decoded) {
			return res.status(401).json({
				error: "Unauthorized",
				message: "Invalid or expired token. Please login again.",
			});
		}

		// Attach user info to request
		(req as any).user = {
			id: decoded.userId,
			email: decoded.email,
            firstName: null,
            lastName: null,
            whatsappPhone: null
		};

		next();
	} catch (error) {
		logger.error({ error }, "Authentication error");
		res.status(401).json({
			error: "Unauthorized",
			message: "Authentication failed",
		});
	}
}

/**
 * Optional authentication - doesn't fail if no token
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
	try {
		const token = getTokenFromRequest(req);

		if (token) {
			const decoded = verifyAccessToken(token);
			if (decoded) {
				(req as any).user = {
					id: decoded.userId,
					email: decoded.email,
                    firstName: null,
                    lastName: null,
                    whatsappPhone: null
				};
			}
		}
	} catch (error) {
		logger.debug("Optional auth failed, continuing without user");
	}

	next();
}
