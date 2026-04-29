/**
 * Order Controller
 * Cloud Functions v2 สำหรับจัดการ Orders
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger: firebaseLogger } = require('firebase-functions/v2');
const orderService = require('../services/orderService');
const extensionService = require('../services/extensionService');
const { withRateLimit } = require('../middleware/rateLimit');
const { validate } = require('../utils/validator');
const logger = require('../utils/logger');

/**
 * Create new order
 * Public function - no auth required
 */
const createOrder = onCall(async (request) => {
    // Rate limit: 5 orders per minute per IP/user
    withRateLimit('createOrder')(request);
    
    try {
        // 1. Validate Input
        const validatedData = validate('createOrder', request.data);
        
        logger.info('Creating order', { 
            tier: validatedData.tierId, 
            customer: validatedData.buyerName,
            ip: request.rawRequest?.ip 
        });

        // 2. Call Service
        const result = await orderService.createOrder(validatedData);
        
        if (!result.success) {
            throw new HttpsError(
                'invalid-argument',
                result.error || result.errors?.join(', ')
            );
        }
        
        return result;
    } catch (err) {
        if (err instanceof HttpsError) throw err;
        
        logger.error('Unexpected error in createOrder', err, { data: request.data });
        throw new HttpsError('internal', 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์');
    }
});

/**
 * Get order (public view)
 * Public function - no auth required
 */
const getOrder = onCall(async (request) => {
    const { orderId } = request.data;
    
    if (!orderId) {
        throw new HttpsError('invalid-argument', 'กรุณาระบุรหัสคำสั่งซื้อ');
    }
    
    const result = await orderService.getOrder(orderId);
    
    if (!result.success) {
        throw new HttpsError('not-found', result.error);
    }
    
    return result;
});

/**
 * Get order for extension page
 * Public function - no auth required (but requires order ID)
 */
const getOrderForExtension = onCall(async (request) => {
    const { orderId } = request.data;
    
    if (!orderId) {
        throw new HttpsError('invalid-argument', 'กรุณาระบุรหัสคำสั่งซื้อ');
    }
    
    const result = await orderService.getOrderForExtension(orderId);
    
    if (!result.success) {
        throw new HttpsError('not-found', result.error);
    }
    
    return result;
});

/**
 * Check domain availability
 * Public function
 */
const checkDomain = onCall(async (request) => {
    const { domain } = request.data;
    
    if (!domain) {
        throw new HttpsError('invalid-argument', 'กรุณาระบุชื่อลิงก์');
    }
    
    const result = await orderService.checkDomain(domain);
    return result;
});

/**
 * Request link extension
 * Public function
 */
const requestExtension = onCall(async (request) => {
    const result = await extensionService.requestExtension(request.data);
    
    if (!result.success) {
        throw new HttpsError(
            'invalid-argument',
            result.error || result.errors?.join(', ')
        );
    }
    
    return result;
});

/**
 * Save text edit (free)
 * Public function
 */
const saveTextEdit = onCall(async (request) => {
    const result = await extensionService.saveTextEdit(request.data);
    
    if (!result.success) {
        throw new HttpsError('failed-precondition', result.error);
    }
    
    return result;
});

/**
 * Save image edit (free)
 * Public function
 */
const saveImageEdit = onCall(async (request) => {
    const result = await extensionService.saveImageEdit(request.data);
    
    if (!result.success) {
        throw new HttpsError('failed-precondition', result.error);
    }
    
    return result;
});

/**
 * Submit edit payment
 * Public function
 */
const submitEditPayment = onCall(async (request) => {
    const result = await extensionService.submitEditPayment(request.data);
    
    if (!result.success) {
        throw new HttpsError('invalid-argument', result.error);
    }
    
    return result;
});

/**
 * Get edit configuration
 * Public function
 */
const getEditConfig = onCall(async (request) => {
    const result = await extensionService.getEditConfig(request.data.orderId);
    
    if (!result.success) {
        throw new HttpsError('not-found', result.error);
    }
    
    return result;
});

module.exports = {
    createOrder,
    getOrder,
    getOrderForExtension,
    checkDomain,
    requestExtension,
    saveTextEdit,
    saveImageEdit,
    submitEditPayment,
    getEditConfig,
};
