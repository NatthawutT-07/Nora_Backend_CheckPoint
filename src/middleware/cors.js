/**
 * CORS Configuration
 * อนุญาตเฉพาะโดเมนที่กำหนด
 */
const cors = require('cors');
const { logger } = require('firebase-functions/v2');

// Get allowed origins from environment/config
const getAllowedOrigins = () => {
    const originsStr = process.env.CORS_ORIGINS;
    if (originsStr) {
        return originsStr.split(',').map(o => o.trim());
    }
    
    // Default origins
    return [
        'https://norastory.com',
        'https://www.norastory.com',
        'https://norastory.web.app',
        'https://norastory.firebaseapp.com',
        // Add localhost for development
        ...(process.env.NODE_ENV !== 'production' ? [
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
        ] : []),
    ];
};

/**
 * CORS middleware for onRequest functions
 */
const corsMiddleware = cors({
    origin: (origin, callback) => {
        const allowedOrigins = getAllowedOrigins();
        
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) {
            return callback(null, true);
        }
        
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        
        // Log blocked origins for debugging
        logger.warn('CORS blocked origin', { origin });
        return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400, // 24 hours
});

/**
 * Wrap an onRequest handler with CORS
 * @param {function} handler - Request handler
 * @returns {function} CORS-wrapped handler
 */
const withCors = (handler) => {
    return (req, res) => {
        corsMiddleware(req, res, () => {
            handler(req, res);
        });
    };
};

module.exports = {
    corsMiddleware,
    withCors,
    getAllowedOrigins,
};
