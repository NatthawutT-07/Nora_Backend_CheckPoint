/**
 * Structured Logging Utility
 * ปรับปรุงการเก็บ Log ให้มีระเบียบและค้นหาง่ายขึ้นใน Firebase Console
 */
const { logger } = require('firebase-functions/v2');

/**
 * Log structured info
 * @param {string} message - ข้อความหลัก
 * @param {object} context - ข้อมูลเพิ่มเติม (user, orderId, functionName, etc.)
 */
const info = (message, context = {}) => {
    logger.info(message, {
        ...context,
        timestamp: new Date().toISOString(),
        severity: 'INFO'
    });
};

/**
 * Log structured warning
 * @param {string} message 
 * @param {object} context 
 */
const warn = (message, context = {}) => {
    logger.warn(message, {
        ...context,
        timestamp: new Date().toISOString(),
        severity: 'WARNING'
    });
};

/**
 * Log structured error
 * @param {string} message 
 * @param {Error|object} error - Object ข้อผิดพลาด
 * @param {object} context 
 */
const error = (message, error, context = {}) => {
    const errorDetails = error instanceof Error ? {
        message: error.message,
        stack: error.stack,
        code: error.code
    } : error;

    logger.error(message, {
        ...context,
        error: errorDetails,
        timestamp: new Date().toISOString(),
        severity: 'ERROR'
    });
};

module.exports = {
    info,
    warn,
    error
};
