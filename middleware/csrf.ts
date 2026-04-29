import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Express Request type to include csrfToken
declare global {
  namespace Express {
    interface Request {
      csrfToken?: string;
    }
  }
}

/**
 * Generates a random CSRF token
 */
export const generateCsrfToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Middleware to validate CSRF token
 * Implements the Double-Submit Cookie Pattern
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  // Skip for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const tokenFromCookie = req.cookies['csrf_token'];
  const tokenFromHeader = req.headers['x-csrf-token'];

  if (!tokenFromCookie || !tokenFromHeader || tokenFromCookie !== tokenFromHeader) {
    return res.status(403).json({ 
      error: 'CSRF token validation failed',
      code: 'CSRF_ERROR'
    });
  }

  next();
};

/**
 * Helper to set the CSRF cookie
 */
export const setCsrfCookie = (res: Response, token: string) => {
  res.cookie('csrf_token', token, {
    httpOnly: false, // Must be accessible by JS to read and send in header
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  });
};
