// utils/logger.ts
import pino from "pino";

const isDev = process.env.NODE_ENV !== "production";

const logger = pino({
	level: process.env.LOG_LEVEL || "info",
	// Use pino-pretty only in development for human-readable logs
	// In production, output structured JSON for Cloud Run/Cloud Logging
	transport: isDev
		? {
			target: "pino-pretty",
			options: {
				colorize: true,
				translateTime: "SYS:standard",
				ignore: "pid,hostname",
			},
		}
		: undefined,
	// Redact sensitive fields to prevent accidental logging of secrets
	redact: {
		paths: [
			"req.headers.authorization",
			"req.headers.cookie",
			"*.password",
			"*.token",
			"*.accessToken",
			"*.refreshToken",
			"*.secret",
			"*.apiKey",
		],
		remove: true, // Remove the field entirely from logs
	},
	// Serializers for common objects
	serializers: {
		req: pino.stdSerializers.req,
		res: pino.stdSerializers.res,
		err: pino.stdSerializers.err,
	},
	// Base context for all logs
	base: {
		env: process.env.NODE_ENV || "development",
	},
});

export default logger;
