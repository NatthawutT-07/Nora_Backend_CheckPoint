/**
 * Rate Limiting Middleware
 * ป้องกันการยิง API ถี่เกินไป
 */
const { logger } = require('firebase-functions/v2');
const { HttpsError } = require('firebase-functions/v2/https');

// In-memory rate limit store (resets when function cold starts)
// For production scale, consider using Redis or Firestore
const rateLimitStore = new Map();

// Cleanup old entries periodically
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
let lastCleanup = Date.now();

/**
 * Clean up expired entries from rate limit store
 */
const cleanupExpiredEntries = () => {
    const now = Date.now();
    if (now - lastCleanup < CLEANUP_INTERVAL) return;
    
    for (const [key, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > data.windowMs * 2) {
            rateLimitStore.delete(key);
        }
    }
    lastCleanup = now;
};

/**
 * Rate limit configuration presets
 */
const RATE_LIMITS = {
    // Public endpoints - more lenient
    public: {
        windowMs: 60 * 1000,    // 1 minute
        maxRequests: 30,         // 30 requests per minute
    },
    // Order creation - moderate
    createOrder: {
        windowMs: 60 * 1000,    // 1 minute
        maxRequests: 5,          // 5 orders per minute
    },
    // Admin endpoints - more strict (to prevent abuse if credentials leak)
    admin: {
        windowMs: 60 * 1000,    // 1 minute
        maxRequests: 60,         // 60 requests per minute
    },
    // Sensitive operations
    sensitive: {
        windowMs: 60 * 1000,    // 1 minute
        maxRequests: 10,         // 10 requests per minute
    },
};

/**
 * Check if request is within rate limit
 * @param {string} identifier - Unique identifier (uid, IP, etc.)
 * @param {string} endpoint - Endpoint name for specific limits
 * @param {object} customLimits - Optional custom limits { windowMs, maxRequests }
 * @returns {object} { allowed: boolean, remaining: number, resetAt: Date }
 */
const checkRateLimit = (identifier, endpoint = 'public', customLimits = null) => {
    cleanupExpiredEntries();
    
    const config = customLimits || RATE_LIMITS[endpoint] || RATE_LIMITS.public;
    const { windowMs, maxRequests } = config;
    
    const key = `${endpoint}:${identifier}`;
    const now = Date.now();
    
    let data = rateLimitStore.get(key);
    
    // Initialize or reset window
    if (!data || (now - data.windowStart) > windowMs) {
        data = {
            windowStart: now,
            windowMs,
            count: 0,
        };
    }
    
    // Increment count
    data.count++;
    rateLimitStore.set(key, data);
    
    const remaining = Math.max(0, maxRequests - data.count);
    const resetAt = new Date(data.windowStart + windowMs);
    
    if (data.count > maxRequests) {
        return {
            allowed: false,
            remaining: 0,
            resetAt,
            retryAfter: Math.ceil((data.windowStart + windowMs - now) / 1000),
        };
    }
    
    return {
        allowed: true,
        remaining,
        resetAt,
    };
};

/**
 * Get identifier from Firebase callable context
 * @param {object} context - Firebase callable context
 * @returns {string} Identifier for rate limiting
 */
const getIdentifier = (context) => {
    // Prefer UID if authenticated
    if (context.auth?.uid) {
        return `uid:${context.auth.uid}`;
    }
    
    // Fallback to IP (from rawRequest if available)
    if (context.rawRequest?.ip) {
        return `ip:${context.rawRequest.ip}`;
    }
    
    // Last resort: use a generic key (not ideal)
    return 'anonymous';
};

/**
 * Rate limit wrapper for Cloud Functions
 * @param {string} endpoint - Endpoint type for rate limit config
 * @returns {function} Middleware function
 */
const withRateLimit = (endpoint = 'public') => {
    return (context) => {
        const identifier = getIdentifier(context);
        const result = checkRateLimit(identifier, endpoint);
        
        if (!result.allowed) {
            logger.warn('Rate limit exceeded', {
                identifier,
                endpoint,
                retryAfter: result.retryAfter,
            });
            
            throw new HttpsError(
                'resource-exhausted',
                `คุณส่งคำขอบ่อยเกินไป กรุณารอ ${result.retryAfter} วินาที`,
                { retryAfter: result.retryAfter }
            );
        }
        
        return result;
    };
};

module.exports = {
    checkRateLimit,
    withRateLimit,
    getIdentifier,
    RATE_LIMITS,
};
