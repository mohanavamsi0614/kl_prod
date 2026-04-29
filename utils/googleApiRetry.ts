import logger from "./logger";

/**
 * Google API Retry Wrapper
 * 
 * ONLY retries transient errors:
 * - 429: Rate limit exceeded
 * - 500: Internal server error
 * - 503: Service unavailable
 * - Network/timeout errors (ECONNRESET, ETIMEDOUT, etc.)
 * 
 * NEVER retries:
 * - 401: Unauthorized (token expired/invalid)
 * - 403: Fproductivitydden (insufficient scopes, permissions)
 * - 400: Bad request (validation errors)
 * - invalid_grant errors
 */

interface RetryOptions {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
};

// Errors that should NEVER be retried
const NON_RETRYABLE_CODES = [400, 401, 403, 404];
const NON_RETRYABLE_MESSAGES = [
    'invalid_grant',
    'Invalid Credentials',
    'insufficient authentication scopes',
    'access denied',
    'not found',
    'bad request',
];

// Errors that SHOULD be retried
const RETRYABLE_CODES = [429, 500, 502, 503, 504];
const RETRYABLE_NETWORK_ERRORS = [
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'EPIPE',
    'EHOSTUNREACH',
];

function isRetryableError(error: any): boolean {
    // Check for non-retryable errors first
    const statusCode = error?.code || error?.response?.status || error?.status;
    
    if (NON_RETRYABLE_CODES.includes(statusCode)) {
        return false;
    }

    const errorMessage = (error?.message || error?.response?.data?.error || '').toLowerCase();
    
    for (const msg of NON_RETRYABLE_MESSAGES) {
        if (errorMessage.includes(msg.toLowerCase())) {
            return false;
        }
    }

    // Check for retryable status codes
    if (RETRYABLE_CODES.includes(statusCode)) {
        return true;
    }

    // Check for retryable network errors
    const errorCode = error?.code || '';
    if (RETRYABLE_NETWORK_ERRORS.includes(errorCode)) {
        return true;
    }

    // Check for rate limit errors in message
    if (errorMessage.includes('rate limit') || errorMessage.includes('quota exceeded')) {
        return true;
    }

    return false;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateBackoff(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
    // Exponential backoff with jitter
    const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter
    return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Wraps an async function with retry logic for transient Google API errors.
 * 
 * @example
 * const events = await withGoogleApiRetry(
 *   () => calendar.events.list({ calendarId: 'primary' }),
 *   { maxRetries: 3 }
 * );
 */
export async function withGoogleApiRetry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
    context?: string
): Promise<T> {
    const { maxRetries, baseDelayMs, maxDelayMs } = { ...DEFAULT_OPTIONS, ...options };
    
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            
            // Log the error
            const errorInfo = {
                attempt: attempt + 1,
                maxRetries: maxRetries + 1,
                context,
                errorCode: error?.code || error?.response?.status,
                errorMessage: error?.message,
            };
            
            // Check if we should retry
            if (attempt < maxRetries && isRetryableError(error)) {
                const delayMs = calculateBackoff(attempt, baseDelayMs, maxDelayMs);
                
                logger.warn({
                    ...errorInfo,
                    delayMs,
                }, `Google API transient error, retrying in ${delayMs}ms`);
                
                await sleep(delayMs);
                continue;
            }
            
            // Not retryable or max retries exceeded
            if (attempt >= maxRetries) {
                logger.error({
                    ...errorInfo,
                    exhaustedRetries: true,
                }, 'Google API call failed after all retry attempts');
            } else {
                logger.error({
                    ...errorInfo,
                    retryable: false,
                }, 'Google API call failed with non-retryable error');
            }
            
            throw error;
        }
    }
    
    // This should never be reached, but TypeScript needs it
    throw lastError;
}

export default withGoogleApiRetry;
