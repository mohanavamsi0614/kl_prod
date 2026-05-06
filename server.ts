require("dotenv").config();
import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import rateLimit, { MemoryStore, ipKeyGenerator } from "express-rate-limit";
// PostgresStore removed - using MemoryStore to avoid migration conflicts
// import { PostgresStore } from "@acpr/rate-limit-postgresql";
import logger from "./utils/logger";
import passport from "./lib/auth";
import authRouter from "./routes/auth";
import calendarRouter from "./routes/calendar";
import connectionsRouter from "./routes/connections";
import gmailRouter from "./routes/gmail";
import externalRouter from "./routes/external";
import tasksRouter from "./routes/tasks";
import storageRouter from "./routes/storage";
import sharingRouter from "./routes/sharing";
import driveRouter from "./routes/drive";
import { requestIdMiddleware } from "./middleware/requestId";
import prisma from "./lib/prisma";
import { verifyAccessToken } from "./utils/jwt";

// Load environment variables first
const app = express();

// Validate required environment variables
if (!process.env.PORT) {
	throw new Error('PORT environment variable is required');
}

if (!process.env.VITE_API_URL) {
	throw new Error('VITE_API_URL environment variable is required');
}

const PORT = process.env.PORT || "3000";
const allowedOrigins = [
	...process.env.VITE_API_URL ? process.env.VITE_API_URL.split(',').map(url => url.trim()) : [],
	`http://localhost:${PORT}`,
	`http://127.0.0.1:${PORT}`,
	"http://localhost:5173",
];

// Security Middleware
app.use(requestIdMiddleware);

// Enable GZIP compression
app.use(compression());

app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'"],
				styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], // Allow inline styles and Google Fonts
				imgSrc: ["'self'", "data:", "blob:", "https:"], // Allow blob URLs for email images
				frameSrc: ["'self'", "blob:"], // Allow blob URLs in iframes for PDF/document preview
				objectSrc: ["'self'", "blob:"], // Allow blob URLs in object/embed for PDF preview
				mediaSrc: ["'self'", "blob:"], // Allow blob URLs for video/audio playback
				connectSrc: [
					"'self'",
					"https://accounts.google.com",
					// S3 URLs - using specific region patterns since wildcards in middle are invalid
					"https://*.s3.amazonaws.com",
					"https://*.s3.us-east-1.amazonaws.com",
					"https://*.s3.us-east-2.amazonaws.com",
					"https://*.s3.us-west-1.amazonaws.com",
					"https://*.s3.us-west-2.amazonaws.com",
					"https://*.s3.eu-west-1.amazonaws.com",
					"https://*.s3.eu-central-1.amazonaws.com",
					"https://*.s3.ap-south-1.amazonaws.com",
					"https://*.s3.ap-southeast-1.amazonaws.com",
					"https://*.s3.ap-southeast-2.amazonaws.com",
					"https://*.s3.ap-northeast-1.amazonaws.com"
				],
				fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"], // Allow fonts including Google Fonts
			},
		},
		hsts: {
			maxAge: 31536000,
			includeSubDomains: true,
			preload: true,
		},
	})
);

app.use(
	cors({
		origin: (origin, callback) => {
			if (!origin || allowedOrigins.includes(origin)) {
				callback(null, true);
			} else {
				callback(new Error('Not allowed by CORS'));
			}
		},
		credentials: true,
		methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
		allowedHeaders: ["Content-Type", "Authorization", "x-filename", "x-request-id"],
	})
);

// Create rate limiting store
// Note: Using MemoryStore for reliability. PostgreSQL store requires async migrations
// that can conflict with existing tables during initialization.
// For production with many concurrent users, consider implementing a Redis store.
let rateLimitStore = new MemoryStore();

if (process.env.DATABASE_URL) {
	logger.info('DATABASE_URL configured but using in-memory store for rate limiting (PostgreSQL store requires async migrations)');
} else {
	logger.info('Using in-memory store for rate limiting');
}

// Key generator: combines IP + userId (if authenticated) for per-user limiting
const keyGenerator = (req: express.Request): string => {
	const token = req.cookies?.accessToken;

	if (token) {
		try {
			const decoded = verifyAccessToken(token);
			if (decoded?.userId) {
				return `user:${decoded.userId}`;
			}
		} catch {
			// Invalid token, fall back to IP
		}
	}

	// Use ipKeyGenerator helper for proper IPv6 handling
	const ip = req.ip || req.socket.remoteAddress || 'unknown';
	return ipKeyGenerator(ip);
};

// General API rate limiter with PostgreSQL store
const apiLimiter = rateLimit({
	windowMs: 10 * 60 * 1000, // 10 minutes
	max: 900, // Max 900 requests per 10 min
	message: { error: "Too many requests, please try again later" },
	standardHeaders: true,
	legacyHeaders: false,
	store: rateLimitStore,
	keyGenerator,
	skip: (req) => {
		// Skip rate limiting for health checks
		return req.path === '/api/health';
	},
});

// Stricter rate limiter for auth endpoints (but not too strict for legitimate retries)
// Using MemoryStore for reliability - PostgresStore migration conflicts with existing tables
const authLimiterStore = new MemoryStore();

const strictAuthLimiter = rateLimit({
	windowMs: 10 * 60 * 1000, // 10 minutes
	max: 150, // Max 150 requests per 15 min (allows legitimate retries)
	message: { error: "Too many authentication attempts, please try again after 10 minutes" },
	standardHeaders: true,
	legacyHeaders: false,
	store: authLimiterStore,
	skip: (req) => {
		// Skip rate limiting for non-auth-sensitive endpoints
		const path = req.path;
		return path === '/google/callback' || // OAuth callback
			path === '/google'; // OAuth initiation
	},
});

app.use(express.json());
app.use(cookieParser());

// Initialize Passport (stateless for OAuth)
app.use(passport.initialize());

// 🔹 Request logging middleware
app.use((req, res, next) => {
	const start = Date.now();
	const reqLogger = req.log || logger;

	// Log incoming request
	reqLogger.info({
		method: req.method,
		url: req.originalUrl,
		userAgent: req.get("user-agent"),
	}, "Incoming request");

	res.on("finish", () => {
		const duration = Date.now() - start;
		reqLogger.info({
			method: req.method,
			url: req.originalUrl,
			statusCode: res.statusCode,
			duration,
		}, "Request completed");
	});
	next();
});

// 🔹 API Routes
app.use("/auth", strictAuthLimiter, authRouter);
app.use("/api/calendar", apiLimiter, calendarRouter);
app.use("/api/connections", apiLimiter, connectionsRouter);
app.use("/api/gmail", apiLimiter, gmailRouter);
app.use("/api/tasks", apiLimiter, tasksRouter);
app.use("/api/storage", apiLimiter, storageRouter);
app.use("/api/sharing", apiLimiter, sharingRouter);
app.use("/api/drive", apiLimiter, driveRouter);

// 🔹 External M2M API (no rate limiting, no CSRF - trusted service-to-service)
app.use("/external", externalRouter);

// 🔹 Sync intervals configuration endpoint
const SYNC_INTERVALS = {
	gmail: parseInt(process.env.GMAIL_SYNC_INTERVAL_MINUTES || '15'),
	calendar: parseInt(process.env.CALENDAR_SYNC_INTERVAL_MINUTES || '15'),
	tasks: parseInt(process.env.TASKS_SYNC_INTERVAL_MINUTES || '15')
};

app.get("/api/config/sync-intervals", (req, res) => {
	res.json({
		gmail: {
			intervalMinutes: SYNC_INTERVALS.gmail,
			intervalMs: SYNC_INTERVALS.gmail * 60 * 1000
		},
		calendar: {
			intervalMinutes: SYNC_INTERVALS.calendar,
			intervalMs: SYNC_INTERVALS.calendar * 60 * 1000
		},
		tasks: {
			intervalMinutes: SYNC_INTERVALS.tasks,
			intervalMs: SYNC_INTERVALS.tasks * 60 * 1000
		}
	});
});

// 🔹 Health check with DB validation
app.get("/api/health", async (req, res) => {
	try {
		// Check database connection
		await prisma.$queryRaw`SELECT 1`;

		res.json({
			ok: true,
			message: "Backend is alive",
			timestamp: new Date().toISOString(),
			database: "connected",
			environment: process.env.NODE_ENV || "development",
		});
	} catch (error) {
		logger.error({ error }, "Health check failed");
		res.status(503).json({
			ok: false,
			message: "Service unhealthy",
			database: "disconnected",
			timestamp: new Date().toISOString(),
		});
	}
});

const publicDir = path.join(process.cwd(), "public");
logger.info(`Serving static files from: ${publicDir}`);

app.use(express.static(publicDir));

// SPA fallback - but DO NOT override requests for real files
app.get("*", (req, res, next) => {
	if (req.path.includes(".")) {
		return next();
	}
	res.sendFile(path.join(publicDir, "index.html"));
});

// 🔹 Start server
app.listen(Number(PORT), () => {
	const host = process.env.VITE_API_URL || `http://localhost:${PORT}`;
	logger.info(`Server running on ${host}`);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
	logger.info("SIGTERM received, closing server...");
	await prisma.$disconnect();
	process.exit(0);
});