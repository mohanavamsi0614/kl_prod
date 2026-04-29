import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import logger from "../utils/logger";

/**
 * Middleware to add request ID for distributed tracing
 * Creates a child logger with the request ID in context
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  req.headers["x-request-id"] = requestId;
  res.setHeader("x-request-id", requestId);
  
  // Create a child logger with request ID in context
  // This ensures all logs within this request include the requestId
  (req as any).log = logger.child({ requestId });
  
  next();
}
