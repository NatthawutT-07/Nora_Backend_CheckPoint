/**
 * Payment Service
 * Business Logic สำหรับ Omise Payment Sessions
 */
const { logger } = require('firebase-functions/v2');
const { db, FieldValue, Timestamp } = require('../config/firebase');
const {
    PAYMENT_SESSION_STATUS,
    PAYMENT_METHOD,
    PAYMENT_SESSION_DURATION_MS,
} = require('../config/constants');
const omiseService = require('./omiseService');
const orderService = require('./orderService');

// ============================================
// Session Management
// ============================================

/**
 * สร้าง Payment Session ใหม่ + Omise Charge
 * @param {object} data - { tierId, tierName, price, paymentMethod, ip }
 * @returns {Promise<object>} { success, sessionId, expiresAt, qrCodeUrl? }
 */
const createPaymentSession = async ({ tierId, tierName, price, paymentMethod, ip }) => {
    if (!paymentMethod || !Object.values(PAYMENT_METHOD).includes(paymentMethod)) {
        return { success: false, error: 'ช่องทางชำระเงินไม่ถูกต้อง' };
    }
    if (paymentMethod === PAYMENT_METHOD.SLIP) {
        return { success: false, error: 'ช่องทาง slip ไม่รองรับในระบบนี้' };
    }

    let amountSatang;
    try {
        amountSatang = omiseService.toSatang(price);
    } catch {
        return { success: false, error: 'ยอดเงินไม่ถูกต้อง' };
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PAYMENT_SESSION_DURATION_MS);

    let qrCodeUrl = null;
    let qrPayload = null;
    let omiseChargeId = null;
    let omiseSourceId = null;

    try {
        if (paymentMethod === PAYMENT_METHOD.PROMPTPAY) {
            const source = await omiseService.createPromptPaySource(amountSatang);
            const charge = await omiseService.createChargeFromSource(
                amountSatang,
                source.id,
                `NoraStory - ${tierName}`
            );
            omiseSourceId = source.id;
            omiseChargeId = charge.id;

            // Try source directly first
            qrCodeUrl = source.scannable_code?.image?.uri
                || source.scannable_code?.image?.download_uri
                || null;
            qrPayload = source.references?.payload || null;

            // Also check charge's embedded source object
            if (!qrCodeUrl && !qrPayload) {
                const cs = charge.source || {};
                qrCodeUrl = cs.scannable_code?.image?.uri
                    || cs.scannable_code?.image?.download_uri
                    || null;
                qrPayload = cs.references?.payload || null;
            }

            // Retrieve updated source after charge creation (Omise generates QR post-charge)
            if (!qrCodeUrl && !qrPayload) {
                const updatedSource = await omiseService.retrieveSource(source.id);
                if (updatedSource) {
                    qrCodeUrl = updatedSource.scannable_code?.image?.uri
                        || updatedSource.scannable_code?.image?.download_uri
                        || null;
                    qrPayload = updatedSource.references?.payload || null;
                }
            }

            logger.info('PromptPay QR debug', {
                sourceId: source.id,
                sourceKeys: Object.keys(source).join(','),
                hasScannable: !!source.scannable_code,
                hasReferences: !!source.references,
                chargeSourceKeys: Object.keys(charge.source || {}).join(','),
                hasPayload: !!qrPayload,
                hasQrUrl: !!qrCodeUrl,
            });
        }
        // Card: charge is created later via createCardCharge (needs token from browser)
    } catch (error) {
        logger.error('Payment session: Omise error', { error: error.message });
        return { success: false, error: `ไม่สามารถสร้างรายการชำระเงิน: ${error.message}` };
    }

    try {
        const sessionRef = db.collection('payment_sessions').doc();
        await sessionRef.set({
            tierId: String(tierId),
            tierName: tierName || '',
            price: String(price),
            amountSatang,
            status: PAYMENT_SESSION_STATUS.PENDING,
            paymentMethod,
            omiseChargeId,
            omiseSourceId,
            qrCodeUrl,
            qrPayload,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: Timestamp.fromDate(expiresAt),
            ip: ip || null,
        });

        return {
            success: true,
            sessionId: sessionRef.id,
            expiresAt: expiresAt.toISOString(),
            qrCodeUrl,
            qrPayload,
            chargeId: omiseChargeId,
        };
    } catch (error) {
        logger.error('Payment session: Firestore error', { error: error.message });
        return { success: false, error: 'ไม่สามารถบันทึกรายการได้' };
    }
};

// ============================================
// Card Charge
// ============================================

/**
 * สร้าง Charge สำหรับบัตรเครดิต
 * @param {object} data - { sessionId, omiseToken }
 * @returns {Promise<object>} { success, status, chargeId }
 */
const createCardCharge = async ({ sessionId, omiseToken }) => {
    if (!sessionId || !omiseToken) {
        return { success: false, error: 'ข้อมูลไม่ครบถ้วน' };
    }

    const sessionRef = db.collection('payment_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
        return { success: false, error: 'ไม่พบรายการชำระเงิน' };
    }

    const session = sessionDoc.data();

    if (session.status !== PAYMENT_SESSION_STATUS.PENDING) {
        return { success: false, error: `สถานะรายการไม่ถูกต้อง: ${session.status}` };
    }

    const expiresAt = session.expiresAt.toDate();
    if (new Date() > expiresAt) {
        await sessionRef.update({ status: PAYMENT_SESSION_STATUS.EXPIRED });
        return { success: false, error: 'รายการชำระเงินหมดเวลา กรุณาเริ่มใหม่' };
    }

    if (session.paymentMethod !== PAYMENT_METHOD.CARD) {
        return { success: false, error: 'รายการนี้ไม่ใช่การชำระด้วยบัตร' };
    }

    let charge;
    try {
        charge = await omiseService.createChargeFromToken(
            session.amountSatang,
            omiseToken,
            `NoraStory - ${session.tierName}`
        );
    } catch (error) {
        logger.error('Card charge error', { sessionId, error: error.message });
        return { success: false, error: `ชำระเงินไม่สำเร็จ: ${error.message}` };
    }

    const isPaid = charge.status === 'successful';

    const updateData = {
        omiseChargeId: charge.id,
        ...(isPaid && {
            status: PAYMENT_SESSION_STATUS.PAID,
            paidAt: FieldValue.serverTimestamp(),
        }),
    };
    await sessionRef.update(updateData);

    return {
        success: true,
        status: isPaid ? PAYMENT_SESSION_STATUS.PAID : PAYMENT_SESSION_STATUS.PENDING,
        chargeId: charge.id,
        chargeStatus: charge.status,
    };
};

// ============================================
// Webhook Handler
// ============================================

/**
 * จัดการ Omise Webhook Event
 * @param {object} event - Parsed webhook payload
 * @returns {Promise<object>}
 */
const handleWebhookEvent = async (event) => {
    const { key, data: chargeData } = event;

    if (!key || !chargeData) {
        return { success: false, error: 'Invalid webhook payload' };
    }

    // จัดการเฉพาะ charge.complete event
    if (key !== 'charge.complete') {
        return { success: true, skipped: true, reason: `Unhandled event: ${key}` };
    }

    const chargeId = chargeData.id;
    const chargeStatus = chargeData.status;

    if (!chargeId) {
        return { success: false, error: 'Missing charge ID in webhook' };
    }

    // ค้นหา session ที่ตรงกับ chargeId
    const sessionsQuery = await db
        .collection('payment_sessions')
        .where('omiseChargeId', '==', chargeId)
        .limit(1)
        .get();

    if (sessionsQuery.empty) {
        logger.warn('Webhook: No session found for chargeId', { chargeId });
        return { success: false, error: `No session for charge ${chargeId}` };
    }

    const sessionDoc = sessionsQuery.docs[0];
    const session = sessionDoc.data();

    if (session.status !== PAYMENT_SESSION_STATUS.PENDING) {
        logger.info('Webhook: Session already processed', { sessionId: sessionDoc.id, status: session.status });
        return { success: true, skipped: true, reason: 'Already processed' };
    }

    if (chargeStatus === 'successful') {
        await sessionDoc.ref.update({
            status: PAYMENT_SESSION_STATUS.PAID,
            paidAt: FieldValue.serverTimestamp(),
        });
        logger.info('Webhook: Session marked as paid', { sessionId: sessionDoc.id, chargeId });
        return { success: true, sessionId: sessionDoc.id };
    }

    if (chargeStatus === 'failed') {
        await sessionDoc.ref.update({ status: PAYMENT_SESSION_STATUS.EXPIRED });
        logger.info('Webhook: Charge failed, session expired', { sessionId: sessionDoc.id });
        return { success: true, sessionId: sessionDoc.id, failed: true };
    }

    return { success: true, skipped: true, reason: `Charge status not final: ${chargeStatus}` };
};

// ============================================
// Submit Order With Payment
// ============================================

/**
 * ตรวจสอบ Session และสร้าง Order หลังชำระเงินสำเร็จ
 * @param {object} data - { sessionId, ...orderData fields }
 * @returns {Promise<object>} { success, orderId, storyUrl }
 */
const submitOrderWithPayment = async (data) => {
    const { sessionId, ...orderData } = data;

    if (!sessionId) {
        return { success: false, error: 'ไม่พบรหัสรายการชำระเงิน' };
    }

    const sessionRef = db.collection('payment_sessions').doc(sessionId);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
        return { success: false, error: 'ไม่พบรายการชำระเงิน' };
    }

    const session = sessionDoc.data();

    // ป้องกันการสร้างออเดอร์ดัมเบิ้ลเบื้องต้น (Fast Check)
    if (session.status === PAYMENT_SESSION_STATUS.COMPLETED && session.orderId) {
        return { success: true, orderId: session.orderId, isDuplicate: true };
    }

    // ตรวจสอบสถานะ
    if (session.status !== PAYMENT_SESSION_STATUS.PAID) {
        if (session.status === PAYMENT_SESSION_STATUS.EXPIRED) {
            return { success: false, error: 'รายการชำระเงินหมดเวลา กรุณาเริ่มใหม่' };
        }

        // Fallback: ถ้า session ยัง pending แต่มี omiseChargeId → เช็คสถานะ charge จาก Omise โดยตรง
        // (กรณี webhook ไม่มาถึง หรือล่าช้า)
        if (session.status === PAYMENT_SESSION_STATUS.PENDING && session.omiseChargeId) {
            try {
                const charge = await omiseService.retrieveCharge(session.omiseChargeId);
                if (charge.status === 'successful') {
                    logger.info('Fallback: Omise charge is successful, updating session', {
                        sessionId, chargeId: session.omiseChargeId,
                    });
                    await sessionRef.update({
                        status: PAYMENT_SESSION_STATUS.PAID,
                        paidAt: FieldValue.serverTimestamp(),
                    });
                    // อัปเดต session object ในตัวแปรเพื่อใช้ต่อ
                    session.status = PAYMENT_SESSION_STATUS.PAID;
                } else {
                    logger.info('Fallback: Omise charge not yet successful', {
                        sessionId, chargeStatus: charge.status,
                    });
                    return { success: false, error: 'กรุณาชำระเงินให้เสร็จสิ้นก่อนดำเนินการต่อ' };
                }
            } catch (omiseErr) {
                logger.error('Fallback: Failed to retrieve Omise charge', {
                    sessionId, error: omiseErr.message,
                });
                return { success: false, error: 'กรุณาชำระเงินให้เสร็จสิ้นก่อนดำเนินการต่อ' };
            }
        } else {
            return { success: false, error: 'กรุณาชำระเงินให้เสร็จสิ้นก่อนดำเนินการต่อ' };
        }
    }

    // ตรวจสอบเวลา session ไม่หมดอายุ
    const expiresAt = session.expiresAt.toDate();
    if (new Date() > expiresAt) {
        await sessionRef.update({ status: PAYMENT_SESSION_STATUS.EXPIRED });
        return { success: false, error: 'รายการชำระเงินหมดเวลา กรุณาเริ่มใหม่' };
    }

    // ============================================
    // ล็อค Session ด้วย Transaction เพื่อป้องกัน Race Condition (Double Submit)
    // ============================================
    try {
        await db.runTransaction(async (t) => {
            const tDoc = await t.get(sessionRef);
            if (!tDoc.exists) throw new Error('not_found');
            const tData = tDoc.data();

            if (tData.orderId || tData.status === PAYMENT_SESSION_STATUS.COMPLETED) {
                throw new Error('already_completed');
            }
            if (tData.isProcessing) {
                throw new Error('already_processing');
            }

            t.update(sessionRef, { isProcessing: true });
        });
    } catch (e) {
        if (e.message === 'already_completed') {
            const finalDoc = await sessionRef.get();
            const existingOrderId = finalDoc.data().orderId;
            return { success: true, orderId: existingOrderId, isDuplicate: true };
        }
        if (e.message === 'already_processing') {
            return { success: false, error: 'ระบบกำลังดำเนินการสร้างออเดอร์ กรุณารอสักครู่...' };
        }
        return { success: false, error: 'เกิดข้อผิดพลาดในการตรวจสอบรายการชำระเงิน' };
    }

    // สร้าง Order ผ่าน existing orderService
    const orderResult = await orderService.createOrder({
        ...orderData,
        payment_method: session.paymentMethod,
        payment_session_id: sessionId,
        omise_charge_id: session.omiseChargeId || null,
    });

    if (!orderResult.success) {
        // Unlock if failed to create order
        await sessionRef.update({ isProcessing: false });
        return orderResult;
    }

    // อัปเดต session เป็น completed
    try {
        await sessionRef.update({
            status: PAYMENT_SESSION_STATUS.COMPLETED,
            orderId: orderResult.orderId,
            isProcessing: false,
            completedAt: FieldValue.serverTimestamp(),
        });
    } catch (error) {
        logger.warn('Failed to mark session as completed (non-critical)', { sessionId, error: error.message });
    }

    return orderResult;
};

// ============================================
// Scheduled Cleanup
// ============================================

/**
 * ทำเครื่องหมาย Sessions ที่หมดอายุ
 * เรียกโดย Scheduled Function ทุก 5 นาที
 * @returns {Promise<object>} { success, expiredCount }
 */
const cleanupExpiredSessions = async () => {
    const now = Timestamp.now();
    const expiredQuery = await db
        .collection('payment_sessions')
        .where('status', '==', PAYMENT_SESSION_STATUS.PENDING)
        .where('expiresAt', '<', now)
        .get();

    if (expiredQuery.empty) {
        return { success: true, expiredCount: 0 };
    }

    const batch = db.batch();
    expiredQuery.docs.forEach(doc => {
        batch.update(doc.ref, { status: PAYMENT_SESSION_STATUS.EXPIRED });
    });
    await batch.commit();

    logger.info('Cleaned up expired sessions', { count: expiredQuery.size });
    return { success: true, expiredCount: expiredQuery.size };
};

module.exports = {
    createPaymentSession,
    createCardCharge,
    handleWebhookEvent,
    submitOrderWithPayment,
    cleanupExpiredSessions,
};
