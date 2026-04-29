import * as jwt from "jsonwebtoken";
import logger from "./logger";

export interface JWTPayload {
	userId: string;
	email: string;
	type: "access" | "refresh";
}

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "30d";

/**
 * Generate access token (short-lived)
 */
export function generateAccessToken(userId: string, email: string): string {
	const payload: any = {
		userId,
		email,
		type: "access",
	};

	return jwt.sign(payload, JWT_SECRET, {
		expiresIn: JWT_EXPIRES_IN,
		issuer: "kalvium-stack",
		audience: "kalvium-users",
	} as jwt.SignOptions);
}

/**
 * Generate refresh token (long-lived)
 */
export function generateRefreshToken(userId: string, email: string): string {
	const payload: any = {
		userId,
		email,
		type: "refresh",
	};

	return jwt.sign(payload, JWT_REFRESH_SECRET, {
		expiresIn: JWT_REFRESH_EXPIRES_IN,
		issuer: "kalvium-stack",
		audience: "kalvium-users",
	} as jwt.SignOptions);
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): JWTPayload | null {
	try {
		const decoded = jwt.verify(token, JWT_SECRET, {
			issuer: "kalvium-stack",
			audience: "kalvium-users",
		}) as JWTPayload;

		if (decoded.type !== "access") {
			logger.warn("Invalid token type for access token");
			return null;
		}

		return decoded;
	} catch (error) {
		logger.error({ error }, "Access token verification failed");
		return null;
	}
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): JWTPayload | null {
	try {
		const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
			issuer: "kalvium-stack",
			audience: "kalvium-users",
		}) as JWTPayload;

		if (decoded.type !== "refresh") {
			logger.warn("Invalid token type for refresh token");
			return null;
		}

		return decoded;
	} catch (error) {
		logger.error({ error }, "Refresh token verification failed");
		return null;
	}
}

/**
 * Generate both access and refresh tokens
 */
export function generateTokenPair(userId: string, email: string) {
	return {
		accessToken: generateAccessToken(userId, email),
		refreshToken: generateRefreshToken(userId, email),
	};
}
