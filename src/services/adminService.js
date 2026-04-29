/**
 * Admin Service
 * จัดการ Business Logic สำหรับ Admin Operations
 */
const functions = require('firebase-functions');
const { db, storage, FieldValue } = require('../config/firebase');
const { TIER_DURATIONS, ORDER_STATUS, PAYMENT_STATUS } = require('../config/constants');

/**
 * Get all orders (admin only)
 * @param {object} options - Query options
 * @returns {Promise<object>}
 */
const getAllOrders = async (options = {}) => {
    try {
        const { limit = 100, status, orderBy = 'created_at', orderDir = 'desc' } = options;

        let query = db.collection('orders');

        if (status && status !== 'all') {
            query = query.where('status', '==', status);
        }

        query = query.orderBy(orderBy, orderDir).limit(limit);

        const snapshot = await query.get();
        const orders = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                created_at: data.created_at?.toDate?.() || null,
                approved_at: data.approved_at?.toDate?.() || null,
                expires_at: data.expires_at?.toDate?.() || null,
                extension_requested_at: data.extension_requested_at?.toDate?.() || null,
                extension_approved_at: data.extension_approved_at?.toDate?.() || null,
            };
        });

        return { success: true, orders };

    } catch (error) {
        functions.logger.error('Get all orders error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Get single order with full details (admin only)
 * @param {string} orderId 
 * @returns {Promise<object>}
 */
const getOrderDetails = async (orderId) => {
    try {
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const data = orderDoc.data();
        return {
            success: true,
            order: {
                id: orderDoc.id,
                ...data,
                created_at: data.created_at?.toDate?.() || null,
                approved_at: data.approved_at?.toDate?.() || null,
                expires_at: data.expires_at?.toDate?.() || null,
            }
        };

    } catch (error) {
        functions.logger.error('Get order details error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Approve order
 * @param {object} data - { orderId, templateId }
 * @returns {Promise<object>}
 */
const approveOrder = async (data) => {
    try {
        const { orderId, templateId } = data;
        
        if (!templateId) {
            return { success: false, error: 'กรุณาเลือก Template ก่อนอนุมัติ' };
        }

        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const order = orderDoc.data();
        const tierId = order.tier_id || 1;
        const durationDays = TIER_DURATIONS[tierId] || 3;
        const approvedAt = new Date();
        const expiresAt = new Date(approvedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

        await orderRef.update({
            status: ORDER_STATUS.APPROVED,
            template_id: templateId,
            approved_at: approvedAt,
            expires_at: expiresAt,
            updatedAt: FieldValue.serverTimestamp()
        });

        return { 
            success: true, 
            approvedAt,
            expiresAt
        };

    } catch (error) {
        functions.logger.error('Approve order error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Reject order
 * @param {string} orderId 
 * @returns {Promise<object>}
 */
const rejectOrder = async (orderId) => {
    try {
        const orderRef = db.collection('orders').doc(orderId);
        await orderRef.update({
            status: ORDER_STATUS.REJECTED,
            updatedAt: FieldValue.serverTimestamp()
        });

        return { success: true };

    } catch (error) {
        functions.logger.error('Reject order error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Delete order (with storage cleanup)
 * @param {string} orderId 
 * @returns {Promise<object>}
 */
const deleteOrder = async (orderId) => {
    try {
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const order = orderDoc.data();
        const bucket = storage.bucket();

        // Delete files in /uploads/{orderId}/
        try {
            const [files] = await bucket.getFiles({ prefix: `uploads/${orderId}/` });
            await Promise.all(files.map(file => file.delete()));
        } catch (e) {
            functions.logger.warn('No upload files found or error deleting uploads', { error: e.message });
        }

        // Delete slip file if exists
        if (order.slip_url) {
            try {
                const pathMatch = order.slip_url.match(/\/o\/(.+?)\?/);
                if (pathMatch) {
                    const slipPath = decodeURIComponent(pathMatch[1]);
                    await bucket.file(slipPath).delete();
                }
            } catch (e) {
                functions.logger.warn('Error deleting slip', { error: e.message });
            }
        }

        // Delete extension slips
        try {
            const [extFiles] = await bucket.getFiles({ prefix: `extension_slips/${orderId}/` });
            await Promise.all(extFiles.map(file => file.delete()));
        } catch (e) {
            functions.logger.warn('Error deleting extension slips', { error: e.message });
        }

        // Delete edit slips
        try {
            const [editFiles] = await bucket.getFiles({ prefix: `edit_slips/${orderId}/` });
            await Promise.all(editFiles.map(file => file.delete()));
        } catch (e) {
            functions.logger.warn('Error deleting edit slips', { error: e.message });
        }

        // Delete Firestore document
        await orderRef.delete();

        return { success: true };

    } catch (error) {
        functions.logger.error('Delete order error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Update order content
 * @param {object} data - { orderId, ...fields }
 * @returns {Promise<object>}
 */
const updateOrderContent = async (data) => {
    try {
        const { orderId, ...updates } = data;
        const orderRef = db.collection('orders').doc(orderId);

        await orderRef.update({
            ...updates,
            updatedAt: FieldValue.serverTimestamp()
        });

        return { success: true };

    } catch (error) {
        functions.logger.error('Update order content error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Approve extension request
 * @param {object} data - { orderId, requestedDays }
 * @returns {Promise<object>}
 */
const approveExtension = async (data) => {
    try {
        const orderRef = db.collection('orders').doc(data.orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const order = orderDoc.data();
        const currentExpire = order.expires_at ? order.expires_at.toDate() : new Date();
        const baseDate = currentExpire < new Date() ? new Date() : currentExpire;
        const newDate = new Date(baseDate);
        newDate.setDate(newDate.getDate() + parseInt(data.requestedDays || order.extension_requested_days));

        await orderRef.update({
            expires_at: newDate,
            extension_status: PAYMENT_STATUS.APPROVED,
            extension_approved_at: FieldValue.serverTimestamp()
        });

        return { success: true, newExpiresAt: newDate };

    } catch (error) {
        functions.logger.error('Approve extension error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Reject extension request
 * @param {string} orderId 
 * @returns {Promise<object>}
 */
const rejectExtension = async (orderId) => {
    try {
        const orderRef = db.collection('orders').doc(orderId);
        await orderRef.update({
            extension_status: PAYMENT_STATUS.REJECTED,
            extension_rejected_at: FieldValue.serverTimestamp()
        });

        return { success: true };

    } catch (error) {
        functions.logger.error('Reject extension error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Approve edit payment
 * @param {object} data - { orderId, editType }
 * @returns {Promise<object>}
 */
const approveEditPayment = async (data) => {
    try {
        const { orderId, editType } = data;
        const orderRef = db.collection('orders').doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
            return { success: false, error: 'ไม่พบคำสั่งซื้อ' };
        }

        const order = orderDoc.data();
        const updates = {
            [`${editType}_edit_payment_status`]: PAYMENT_STATUS.APPROVED,
            [`${editType}_edit_payment_approved_at`]: FieldValue.serverTimestamp(),
        };

        // Reset edit counter so customer can edit again
        if (editType === 'text') {
            updates.text_edits_used = Math.max(0, (order.text_edits_used || 0) - 1);
        } else {
            updates.image_edits_used = Math.max(0, (order.image_edits_used || 0) - 1);
        }

        await orderRef.update(updates);

        return { success: true };

    } catch (error) {
        functions.logger.error('Approve edit payment error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Reject edit payment
 * @param {object} data - { orderId, editType }
 * @returns {Promise<object>}
 */
const rejectEditPayment = async (data) => {
    try {
        const { orderId, editType } = data;
        const orderRef = db.collection('orders').doc(orderId);

        await orderRef.update({
            [`${editType}_edit_payment_status`]: PAYMENT_STATUS.REJECTED,
            [`${editType}_edit_payment_rejected_at`]: FieldValue.serverTimestamp()
        });

        return { success: true };

    } catch (error) {
        functions.logger.error('Reject edit payment error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Update order expiry date
 * @param {object} data - { orderId, newExpiresAt }
 * @returns {Promise<object>}
 */
const updateExpiry = async (data) => {
    try {
        const orderRef = db.collection('orders').doc(data.orderId);
        await orderRef.update({
            expires_at: new Date(data.newExpiresAt)
        });

        return { success: true };

    } catch (error) {
        functions.logger.error('Update expiry error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Update order link
 * @param {object} data - { orderId, customDomain, linkType }
 * @returns {Promise<object>}
 */
const updateOrderLink = async (data) => {
    try {
        const { orderId, customDomain, linkType } = data;

        // Check for duplicates
        const ordersRef = db.collection('orders');
        const q = ordersRef.where('custom_domain', '==', customDomain);
        const querySnapshot = await q.get();

        const isDuplicate = !querySnapshot.empty && 
            querySnapshot.docs.some(d => d.id !== orderId);

        if (isDuplicate) {
            return { success: false, error: 'ชื่อลิงก์นี้มีคนใช้งานแล้ว' };
        }

        const storyUrl = linkType === 'special'
            ? `https://${customDomain}.norastory.com`
            : `https://norastory.com/${customDomain}`;

        const orderRef = db.collection('orders').doc(orderId);
        await orderRef.update({
            custom_domain: customDomain,
            link_type: linkType,
            want_special_link: linkType === 'special',
            want_custom_link: linkType === 'custom',
            story_url: storyUrl,
            updatedAt: FieldValue.serverTimestamp()
        });

        return { success: true, storyUrl };

    } catch (error) {
        functions.logger.error('Update order link error', { error: error.message });
        return { success: false, error: error.message };
    }
};

module.exports = {
    getAllOrders,
    getOrderDetails,
    approveOrder,
    rejectOrder,
    deleteOrder,
    updateOrderContent,
    approveExtension,
    rejectExtension,
    approveEditPayment,
    rejectEditPayment,
    updateExpiry,
    updateOrderLink,
};
