/**
 * Extension Service
 * จัดการ Business Logic สำหรับการต่ออายุและแก้ไข
 */
const functions = require('firebase-functions');
const { db, FieldValue, Timestamp } = require('../config/firebase');
const { EDIT_CONFIG, EXTENSION_PACKAGES, PAYMENT_STATUS } = require('../config/constants');
const { validateExtensionData } = require('../utils/validators');
const { notifyExtensionRequest, notifyTextEdit, notifyImageEdit, notifyEditPayment } = require('./notificationService');

/**
 * Request link extension
 * @param {object} data - Extension request data
 * @returns {Promise<object>}
 */
const requestExtension = async (data) => {
    const validation = validateExtensionData(data);
    if (!validation.valid) {
        return { success: false, errors: validation.errors };
    }

    try {
        const orderRef = db.collection('orders').doc(data.orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const order = orderDoc.data();
        const tierId = parseInt(order.tier_id) || 1;
        const tierPackages = EXTENSION_PACKAGES[tierId] || EXTENSION_PACKAGES[1];
        
        const selectedPackage = tierPackages.find(p => p.days === parseInt(data.packageDays));
        if (!selectedPackage) {
            return { success: false, error: 'แพ็คเกจไม่ถูกต้องสำหรับเทียร์นี้' };
        }

        const totalPrice = selectedPackage.price + 
            (data.wantSpecialLink ? 999 : 0) + 
            (data.wantCustomLink ? 99 : 0);

        const updates = {
            extension_status: PAYMENT_STATUS.PENDING,
            extension_slip_url: data.slipUrl,
            extension_requested_days: data.packageDays,
            extension_requested_price: totalPrice,
            extension_requested_special_link: !!data.wantSpecialLink,
            extension_requested_custom_link: !!data.wantCustomLink,
            extension_requested_at: FieldValue.serverTimestamp(),
            extension_approved_at: FieldValue.delete(),
            extension_rejected_at: FieldValue.delete(),
            payment_slips_history: FieldValue.arrayUnion({
                url: data.slipUrl,
                type: 'extension',
                amount: totalPrice,
                requested_at: new Date().toISOString()
            })
        };

        if (data.wantSpecialLink || data.wantCustomLink) {
            updates.custom_domain_choice_1 = data.customDomain1;
        }

        await orderRef.update(updates);

        // Send notification
        notifyExtensionRequest({
            orderId: data.orderId,
            packageLabel: selectedPackage.label,
            totalPrice
        }).catch(err => functions.logger.error('Extension notification error', { error: err.message }));

        return { success: true };

    } catch (error) {
        functions.logger.error('Request extension error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Save text edit (free edit)
 * @param {object} data - Edit data
 * @returns {Promise<object>}
 */
const saveTextEdit = async (data) => {
    try {
        const orderRef = db.collection('orders').doc(data.orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const order = orderDoc.data();
        const tierId = parseInt(order.tier_id) || 1;
        const editConfig = EDIT_CONFIG[tierId] || EDIT_CONFIG[1];

        const textEditsUsed = order.text_edits_used || 0;
        const textEditsRemaining = Math.max(0, editConfig.freeTextEdits - textEditsUsed);

        if (textEditsRemaining <= 0) {
            return { success: false, error: 'สิทธิ์แก้ไขฟรีหมดแล้ว กรุณาชำระเงินเพิ่มเติม' };
        }

        const updates = { 
            text_edits_used: textEditsUsed + 1 
        };

        // Update based on tier
        if (tierId === 3) {
            updates.timelines = data.timelines;
            updates.finale_message = data.finaleMessage;
            updates.finale_sign_off = data.finaleSignOff;
        } else {
            updates.pin_code = data.pin;
            updates.message = data.message;
            updates.target_name = data.targetName;
            updates.sign_off = data.signOff;
        }

        await orderRef.update(updates);

        // Send notification
        notifyTextEdit(data.orderId).catch(err => functions.logger.error('Text edit notification error', { error: err.message }));

        return { 
            success: true, 
            textEditsRemaining: textEditsRemaining - 1 
        };

    } catch (error) {
        functions.logger.error('Save text edit error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Save image edit (free edit)
 * @param {object} data - Edit data with new image URLs
 * @returns {Promise<object>}
 */
const saveImageEdit = async (data) => {
    try {
        const orderRef = db.collection('orders').doc(data.orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const order = orderDoc.data();
        const tierId = parseInt(order.tier_id) || 1;
        const editConfig = EDIT_CONFIG[tierId] || EDIT_CONFIG[1];

        const imageEditsUsed = order.image_edits_used || 0;
        const imageEditsRemaining = Math.max(0, editConfig.freeImageEdits - imageEditsUsed);

        if (imageEditsRemaining <= 0) {
            return { success: false, error: 'สิทธิ์แก้ไขฟรีหมดแล้ว กรุณาชำระเงินเพิ่มเติม' };
        }

        const updates = {
            image_edits_used: imageEditsUsed + 1,
            content_images: data.contentImages,
        };

        await orderRef.update(updates);

        // Send notification
        notifyImageEdit(data.orderId).catch(err => functions.logger.error('Image edit notification error', { error: err.message }));

        return { 
            success: true, 
            imageEditsRemaining: imageEditsRemaining - 1 
        };

    } catch (error) {
        functions.logger.error('Save image edit error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Submit edit payment
 * @param {object} data - Payment data
 * @returns {Promise<object>}
 */
const submitEditPayment = async (data) => {
    try {
        const orderRef = db.collection('orders').doc(data.orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const order = orderDoc.data();
        const tierId = parseInt(order.tier_id) || 1;
        const editConfig = EDIT_CONFIG[tierId] || EDIT_CONFIG[1];
        const price = data.editType === 'text' ? editConfig.paidTextPrice : editConfig.paidImagePrice;

        await orderRef.update({
            [`${data.editType}_edit_payment_status`]: PAYMENT_STATUS.PENDING,
            [`${data.editType}_edit_payment_slip_url`]: data.slipUrl,
            [`${data.editType}_edit_payment_price`]: price,
            [`${data.editType}_edit_payment_requested_at`]: FieldValue.serverTimestamp(),
            [`${data.editType}_edit_payment_approved_at`]: FieldValue.delete(),
            [`${data.editType}_edit_payment_rejected_at`]: FieldValue.delete(),
            payment_slips_history: FieldValue.arrayUnion({
                url: data.slipUrl,
                type: data.editType,
                amount: price,
                requested_at: new Date().toISOString()
            })
        });

        // Send notification
        notifyEditPayment({
            orderId: data.orderId,
            editType: data.editType,
            price
        }).catch(err => functions.logger.error('Edit payment notification error', { error: err.message }));

        return { success: true, price };

    } catch (error) {
        functions.logger.error('Submit edit payment error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Get edit configuration for order
 * @param {string} orderId 
 * @returns {Promise<object>}
 */
const getEditConfig = async (orderId) => {
    try {
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const order = orderDoc.data();
        const tierId = parseInt(order.tier_id) || 1;
        const editConfig = EDIT_CONFIG[tierId] || EDIT_CONFIG[1];

        const textEditsUsed = order.text_edits_used || 0;
        const imageEditsUsed = order.image_edits_used || 0;

        return {
            success: true,
            config: {
                ...editConfig,
                textEditsUsed,
                imageEditsUsed,
                textEditsRemaining: Math.max(0, editConfig.freeTextEdits - textEditsUsed),
                imageEditsRemaining: Math.max(0, editConfig.freeImageEdits - imageEditsUsed),
                textPaymentPending: order.text_edit_payment_status === PAYMENT_STATUS.PENDING,
                imagePaymentPending: order.image_edit_payment_status === PAYMENT_STATUS.PENDING,
            }
        };

    } catch (error) {
        functions.logger.error('Get edit config error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Auto-approve extension after successful Omise payment
 * @param {object} data - { orderId, packageDays, sessionId }
 * @returns {Promise<object>}
 */
const autoApproveExtension = async (data) => {
    const { orderId, packageDays, sessionId } = data;
    try {
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const order = orderDoc.data();

        // Compute new expiry date
        const currentExpiry = order.expires_at
            ? new Date(order.expires_at.seconds * 1000)
            : new Date();
        const isExpired = currentExpiry < new Date();
        const baseDate = isExpired ? new Date() : currentExpiry;
        const newExpiry = new Date(baseDate);
        newExpiry.setDate(newExpiry.getDate() + parseInt(packageDays));

        await orderRef.update({
            expires_at: Timestamp.fromDate(newExpiry),
            extension_status: PAYMENT_STATUS.APPROVED,
            extension_approved_at: FieldValue.serverTimestamp(),
            extension_payment_session_id: sessionId,
            extension_requested_days: parseInt(packageDays),
            extension_rejected_at: FieldValue.delete(),
        });

        notifyExtensionRequest({
            orderId,
            packageLabel: `${packageDays} วัน`,
            totalPrice: 0,
        }).catch(() => {});

        return { success: true, newExpiry: newExpiry.toISOString() };

    } catch (error) {
        functions.logger.error('autoApproveExtension error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Auto-approve paid text/image edit after successful Omise payment
 * @param {object} data - { orderId, editType, sessionId }
 * @returns {Promise<object>}
 */
const autoApproveEditPayment = async (data) => {
    const { orderId, editType, sessionId } = data;
    try {
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const order = orderDoc.data();
        const tierId = parseInt(order.tier_id) || 1;
        const editConfig = EDIT_CONFIG[tierId] || EDIT_CONFIG[1];
        const price = editType === 'text' ? editConfig.paidTextPrice : editConfig.paidImagePrice;

        const editsUsedField = editType === 'text' ? 'text_edits_used' : 'image_edits_used';
        const currentEditsUsed = editType === 'text'
            ? (order.text_edits_used || 0)
            : (order.image_edits_used || 0);

        await orderRef.update({
            [`${editType}_edit_payment_status`]: PAYMENT_STATUS.APPROVED,
            [`${editType}_edit_payment_price`]: price,
            [`${editType}_edit_payment_requested_at`]: FieldValue.serverTimestamp(),
            [`${editType}_edit_payment_approved_at`]: FieldValue.serverTimestamp(),
            [`${editType}_edit_payment_session_id`]: sessionId,
            [`${editType}_edit_payment_rejected_at`]: FieldValue.delete(),
            [editsUsedField]: Math.max(0, currentEditsUsed - 1),
        });

        notifyEditPayment({
            orderId,
            editType,
            price,
        }).catch(() => {});

        return { success: true, price };

    } catch (error) {
        functions.logger.error('autoApproveEditPayment error', { error: error.message });
        return { success: false, error: error.message };
    }
};

module.exports = {
    requestExtension,
    saveTextEdit,
    saveImageEdit,
    submitEditPayment,
    getEditConfig,
    autoApproveExtension,
    autoApproveEditPayment,
};
