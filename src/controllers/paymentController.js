/**
 * Payment Controller
 * Cloud Functions v2 สำหรับ Omise Payment System
 */
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const { withRateLimit } = require('../middleware/rateLimit');
const paymentService = require('../services/paymentService');
const omiseService = require('../services/omiseService');
const extensionService = require('../services/extensionService');
const { db, FieldValue } = require('../config/firebase');
const { PAYMENT_SESSION_STATUS } = require('../config/constants');

// ============================================
// 1. createPaymentSession
// ============================================

/**
 * สร้าง Payment Session + Omise Charge
 * Public function — no auth required
 */
const createPaymentSession = onCall({ secrets: [omiseService.omiseSecretKey] }, async (request) => {
    withRateLimit('createOrder')(request);

    const { tierId, tierName, price, paymentMethod } = request.data;

    if (!tierId || !price || !paymentMethod) {
        throw new HttpsError('invalid-argument', 'ข้อมูลไม่ครบถ้วน: tierId, price, paymentMethod จำเป็น');
    }

    const ip = request.rawRequest?.ip || null;

    const result = await paymentService.createPaymentSession({
        tierId,
        tierName,
        price,
        paymentMethod,
        ip,
    });

    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }

    return result;
});

// ============================================
// 2. createCardCharge
// ============================================

/**
 * สร้าง Charge ด้วย Card Token จาก Omise.js
 * Public function — no auth required
 */
const createCardCharge = onCall({ secrets: [omiseService.omiseSecretKey] }, async (request) => {
    withRateLimit('sensitive')(request);

    const { sessionId, omiseToken } = request.data;

    if (!sessionId || !omiseToken) {
        throw new HttpsError('invalid-argument', 'กรุณาระบุ sessionId และ omiseToken');
    }

    const result = await paymentService.createCardCharge({ sessionId, omiseToken });

    if (!result.success) {
        throw new HttpsError('failed-precondition', result.error);
    }

    return result;
});

// ============================================
// 3. handleOmiseWebhook
// ============================================

/**
 * รับ Webhook จาก Omise (HTTP onRequest)
 * URL นี้ต้องตั้งค่าใน Omise Dashboard → Webhooks
 * ต้องส่ง HTTP 200 เสมอ มิฉะนั้น Omise จะส่งซ้ำ
 */
const handleOmiseWebhook = onRequest({ rawBody: true, secrets: [omiseService.omiseWebhookSecret, omiseService.omiseSecretKey] }, async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const signature = req.headers['x-omise-signature'];
    const rawBody = req.rawBody || req.body;

    // ตรวจสอบ Signature
    if (!omiseService.verifyWebhookSignature(rawBody, signature)) {
        logger.warn('Omise webhook: invalid signature');
        res.status(200).send('OK'); // ยังคืน 200 เพื่อไม่ให้ Omise ส่งซ้ำ
        return;
    }

    let event;
    try {
        event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch (error) {
        logger.error('Omise webhook: JSON parse error', { error: error.message });
        res.status(200).send('OK');
        return;
    }

    try {
        const result = await paymentService.handleWebhookEvent(event);
        logger.info('Omise webhook processed', { key: event.key, result });
    } catch (error) {
        logger.error('Omise webhook handler error', { error: error.message, key: event?.key });
    }

    res.status(200).send('OK');
});

// ============================================
// 4. submitOrderWithPayment
// ============================================

/**
 * ตรวจสอบ Payment Session แล้วสร้าง Order ใน Firestore
 * เรียกหลังจาก Frontend ตรวจพบ status = "paid"
 * Public function — no auth required (session ID เป็น proof of payment)
 */
const submitOrderWithPayment = onCall({ secrets: [omiseService.omiseSecretKey] }, async (request) => {
    withRateLimit('createOrder')(request);

    const { sessionId, ...orderData } = request.data;

    if (!sessionId) {
        throw new HttpsError('invalid-argument', 'กรุณาระบุ sessionId');
    }

    if (!orderData.tierId || !orderData.buyerName || !orderData.buyerEmail) {
        throw new HttpsError('invalid-argument', 'ข้อมูลฟอร์มไม่ครบถ้วน');
    }

    const result = await paymentService.submitOrderWithPayment({ sessionId, ...orderData });

    if (!result.success) {
        const isExpired = result.error?.includes('หมดเวลา');
        throw new HttpsError(
            isExpired ? 'deadline-exceeded' : 'failed-precondition',
            result.error
        );
    }

    return result;
});

// ============================================
// 5. submitExtensionWithPayment
// ============================================

/**
 * ตรวจสอบ Payment Session แล้ว auto-approve การต่ออายุทันที
 * เรียกหลังจาก Frontend ตรวจพบ status = "paid"
 */
const submitExtensionWithPayment = onCall({ secrets: [omiseService.omiseSecretKey] }, async (request) => {
    withRateLimit('createOrder')(request);

    const { sessionId, orderId, packageDays } = request.data;

    if (!sessionId || !orderId || !packageDays) {
        throw new HttpsError('invalid-argument', 'กรุณาระบุ sessionId, orderId และ packageDays');
    }

    const sessionRef = db.collection('payment_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
        throw new HttpsError('not-found', 'ไม่พบรายการชำระเงิน');
    }

    const session = sessionDoc.data();

    if (session.status === PAYMENT_SESSION_STATUS.COMPLETED) {
        throw new HttpsError('already-exists', 'รายการนี้ดำเนินการไปแล้ว');
    }

    // ตรวจสอบสถานะ
    if (session.status !== PAYMENT_SESSION_STATUS.PAID) {
        if (session.status === PAYMENT_SESSION_STATUS.EXPIRED) {
            throw new HttpsError('failed-precondition', 'รายการชำระเงินหมดเวลา กรุณาเริ่มใหม่');
        }

        // Fallback: ถ้า session ยัง pending แต่มี omiseChargeId → เช็คสถานะ charge จาก Omise โดยตรง
        if (session.status === PAYMENT_SESSION_STATUS.PENDING && session.omiseChargeId) {
            try {
                const charge = await omiseService.retrieveCharge(session.omiseChargeId);
                if (charge.status === 'successful') {
                    logger.info('Fallback: Omise charge is successful for extension, updating session', {
                        sessionId, chargeId: session.omiseChargeId,
                    });
                    await sessionRef.update({
                        status: PAYMENT_SESSION_STATUS.PAID,
                        paidAt: FieldValue.serverTimestamp(),
                    });
                    session.status = PAYMENT_SESSION_STATUS.PAID;
                } else {
                    throw new HttpsError('failed-precondition', 'การชำระเงินยังไม่สำเร็จ กรุณารอสักครู่');
                }
            } catch (omiseErr) {
                logger.error('Fallback: Failed to retrieve Omise charge for extension', {
                    sessionId, error: omiseErr.message,
                });
                throw new HttpsError('failed-precondition', 'การชำระเงินยังไม่สำเร็จ กรุณารอสักครู่');
            }
        } else {
            throw new HttpsError('failed-precondition', 'การชำระเงินยังไม่สำเร็จ กรุณารอสักครู่');
        }
    }

    const result = await extensionService.autoApproveExtension({ orderId, packageDays, sessionId });

    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }

    await sessionRef.update({
        status: PAYMENT_SESSION_STATUS.COMPLETED,
        completedAt: FieldValue.serverTimestamp(),
        linkedOrderId: orderId,
    });

    return result;
});

// ============================================
// 6. submitEditPaymentWithOmise
// ============================================

/**
 * ตรวจสอบ Payment Session แล้ว auto-approve สิทธิ์แก้ไขทันที
 * เรียกหลังจาก Frontend ตรวจพบ status = "paid"
 */
const submitEditPaymentWithOmise = onCall({ secrets: [omiseService.omiseSecretKey] }, async (request) => {
    withRateLimit('createOrder')(request);

    const { sessionId, orderId, editType } = request.data;

    if (!sessionId || !orderId || !editType) {
        throw new HttpsError('invalid-argument', 'กรุณาระบุ sessionId, orderId และ editType');
    }

    if (!['text', 'image'].includes(editType)) {
        throw new HttpsError('invalid-argument', 'editType ต้องเป็น text หรือ image');
    }

    const sessionRef = db.collection('payment_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
        throw new HttpsError('not-found', 'ไม่พบรายการชำระเงิน');
    }

    const session = sessionDoc.data();

    if (session.status === PAYMENT_SESSION_STATUS.COMPLETED) {
        throw new HttpsError('already-exists', 'รายการนี้ดำเนินการไปแล้ว');
    }

    // ตรวจสอบสถานะ
    if (session.status !== PAYMENT_SESSION_STATUS.PAID) {
        if (session.status === PAYMENT_SESSION_STATUS.EXPIRED) {
            throw new HttpsError('failed-precondition', 'รายการชำระเงินหมดเวลา กรุณาเริ่มใหม่');
        }

        // Fallback: ถ้า session ยัง pending แต่มี omiseChargeId → เช็คสถานะ charge จาก Omise โดยตรง
        if (session.status === PAYMENT_SESSION_STATUS.PENDING && session.omiseChargeId) {
            try {
                const charge = await omiseService.retrieveCharge(session.omiseChargeId);
                if (charge.status === 'successful') {
                    logger.info('Fallback: Omise charge is successful for edit payment, updating session', {
                        sessionId, chargeId: session.omiseChargeId,
                    });
                    await sessionRef.update({
                        status: PAYMENT_SESSION_STATUS.PAID,
                        paidAt: FieldValue.serverTimestamp(),
                    });
                    session.status = PAYMENT_SESSION_STATUS.PAID;
                } else {
                    throw new HttpsError('failed-precondition', 'การชำระเงินยังไม่สำเร็จ กรุณารอสักครู่');
                }
            } catch (omiseErr) {
                logger.error('Fallback: Failed to retrieve Omise charge for edit payment', {
                    sessionId, error: omiseErr.message,
                });
                throw new HttpsError('failed-precondition', 'การชำระเงินยังไม่สำเร็จ กรุณารอสักครู่');
            }
        } else {
            throw new HttpsError('failed-precondition', 'การชำระเงินยังไม่สำเร็จ กรุณารอสักครู่');
        }
    }

    const result = await extensionService.autoApproveEditPayment({ orderId, editType, sessionId });

    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }

    await sessionRef.update({
        status: PAYMENT_SESSION_STATUS.COMPLETED,
        completedAt: FieldValue.serverTimestamp(),
        linkedOrderId: orderId,
    });

    return result;
});

// ============================================
// 7. cleanupExpiredPaymentSessions
// ============================================

/**
 * Scheduled Function: ทำเครื่องหมาย Sessions ที่หมดอายุ
 * รันทุก 5 นาที
 */
const cleanupExpiredPaymentSessions = onSchedule('every 5 minutes', async () => {
    const result = await paymentService.cleanupExpiredSessions();
    logger.info('Expired sessions cleanup', result);
});

module.exports = {
    createPaymentSession,
    createCardCharge,
    handleOmiseWebhook,
    submitOrderWithPayment,
    submitExtensionWithPayment,
    submitEditPaymentWithOmise,
    cleanupExpiredPaymentSessions,
};
