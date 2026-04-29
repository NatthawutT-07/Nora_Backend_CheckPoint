/**
 * Order Service
 * จัดการ Business Logic สำหรับ Orders
 */
const functions = require('firebase-functions');
const { db, FieldValue, Timestamp } = require('../config/firebase');
const { TIER_DURATIONS, ORDER_STATUS, EDIT_CONFIG } = require('../config/constants');
const { generateUniqueStoryId, checkDomainAvailability } = require('../utils/idGenerator');
const { validateOrderData, sanitizeString } = require('../utils/validators');
const { notifyNewOrder } = require('./notificationService');
const { templateRequiresField } = require('../config/templateConfig');

/**
 * Safely convert Firestore Timestamp to ISO string for JSON serialization.
 * Date objects become {} when serialized by Cloud Functions callable,
 * so we must convert to string before returning.
 */
const toISO = (ts) => {
    if (!ts) return null;
    try {
        const d = typeof ts.toDate === 'function' ? ts.toDate() : ts;
        return d instanceof Date ? d.toISOString() : null;
    } catch { return null; }
};

/**
 * Create a new order
 * @param {object} data - Order data from client
 * @returns {Promise<object>} { success: boolean, orderId?: string, error?: string }
 */
const createOrder = async (data) => {
    // Validate input
    const validation = validateOrderData(data);
    if (!validation.valid) {
        return { success: false, errors: validation.errors };
    }

    try {
        // Generate or use custom story ID
        let storyId = data.orderId;
        
        if (!storyId) {
            if (data.wantSpecialLink || data.wantCustomLink) {
                // Check domain availability
                const available = await checkDomainAvailability(data.customDomain);
                if (!available) {
                    return { success: false, error: 'ชื่อลิงก์นี้มีคนใช้งานแล้ว กรุณาเลือกชื่ออื่น' };
                }
                storyId = data.customDomain;
            } else {
                storyId = await generateUniqueStoryId();
            }
        }

        // Build order document — fields saved based on template config
        const tierId = parseInt(data.tierId);
        const templateId = data.selectedTemplate;
        const rf = (field) => templateRequiresField(templateId, field);

        const orderData = {
            tier_id: tierId,
            tier_name: data.tierName,
            price: data.price,

            // Buyer info (sanitized)
            buyer_name: sanitizeString(data.buyerName),
            buyer_email: data.buyerEmail.trim().toLowerCase(),
            buyer_phone: data.buyerPhone.trim(),

            // Template-specific fields — saved only if the template requires them
            pin_code: rf('pin') ? data.pin : null,
            target_name: rf('targetName') ? sanitizeString(data.targetName) : null,
            sign_off: rf('signOff') ? sanitizeString(data.signOff) : null,
            message: rf('message') ? sanitizeString(data.message) : null,
            short_message: rf('shortMessage') ? sanitizeString(data.shortMessage) : null,
            custom_message: rf('customMessage') ? sanitizeString(data.customMessage) : null,

            // Timeline data (Tier 3)
            timelines: rf('timelines') ? data.timelines : null,
            finale_message: rf('finaleMessage') ? sanitizeString(data.finaleMessage) : null,
            finale_sign_off: rf('finaleSignOff') ? sanitizeString(data.finaleSignOff) : null,

            // Link configuration
            custom_domain: (data.wantSpecialLink || data.wantCustomLink) ? data.customDomain : null,
            want_special_link: !!data.wantSpecialLink,
            want_custom_link: !!data.wantCustomLink,
            link_type: data.wantSpecialLink ? 'special' : (data.wantCustomLink ? 'custom' : 'random'),

            // Template & media
            selected_template_id: data.selectedTemplate,
            template_id: null,
            slip_url: data.slipUrl,
            content_images: data.contentImages || [],
            music_url: data.musicUrl || null,
            color_theme_id: data.colorThemeId || null,

            // Payment tracking (slip-only, no Omise)
            payment_method: 'slip',

            // Status & metadata
            status: ORDER_STATUS.PENDING,
            created_at: FieldValue.serverTimestamp(),
            platform: data.platform || 'web',
            story_url: data.wantSpecialLink 
                ? `https://${storyId}.norastory.com` 
                : `https://norastory.com/${storyId}`,

            // Edit tracking
            text_edits_used: 0,
            image_edits_used: 0,
            text_edit_payment_status: null,
            text_edit_payment_slip_url: null,
            text_edit_payment_price: null,
            image_edit_payment_status: null,
            image_edit_payment_slip_url: null,
            image_edit_payment_price: null,
        };

        // Use transaction to prevent duplicates
        await db.runTransaction(async (transaction) => {
            const orderRef = db.collection('orders').doc(storyId);
            const orderDoc = await transaction.get(orderRef);

            if (orderDoc.exists) {
                throw new Error('ลิงก์นี้ถูกใช้งานแล้ว กรุณาเลือกชื่อใหม่');
            }

            transaction.set(orderRef, orderData);
        });

        // Update global stats
        await updateStatsCounter();

        // Send notification (non-blocking)
        notifyNewOrder({
            id: storyId,
            tierName: data.tierName,
            price: data.price,
            buyerName: data.buyerName,
            buyerEmail: data.buyerEmail
        }).catch(err => functions.logger.error('Notification error', { error: err.message }));

        return {
            success: true,
            orderId: storyId,
            storyUrl: orderData.story_url
        };

    } catch (error) {
        functions.logger.error('Create order error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Get order by ID (public - limited fields)
 * @param {string} orderId 
 * @returns {Promise<object>}
 */
const getOrder = async (orderId) => {
    try {
        const orderRef = db.collection('orders').doc(orderId);
        let orderDoc = await orderRef.get();
        let data;

        if (!orderDoc.exists) {
            // Second try: Query by custom_domain (for VIP subdomains)
            const q = db.collection('orders').where('custom_domain', '==', orderId).limit(1);
            const snapshot = await q.get();
            if (snapshot.empty) {
                return { success: false, error: 'ไม่พบเรื่องราวที่คุณกำลังมองหา' };
            }
            orderDoc = snapshot.docs[0];
        }

        data = orderDoc.data();

        // Check if order is viewable
        if (data.status !== ORDER_STATUS.APPROVED && data.status !== ORDER_STATUS.COMPLETED) {
            return { success: false, error: 'เรื่องราวนี้ยังไม่พร้อมแสดง' };
        }

        // Check expiration
        if (data.expires_at) {
            const expiresAt = data.expires_at.toDate ? data.expires_at.toDate() : new Date(data.expires_at);
            if (new Date() > expiresAt) {
                return { success: false, error: 'ลิงก์นี้หมดอายุแล้ว' };
            }
        }

        return {
            success: true,
            order: {
                id: orderDoc.id,
                tier_id: data.tier_id,
                tier_name: data.tier_name,
                template_id: data.template_id,
                selected_template_id: data.selected_template_id,
                customer_name: data.buyer_name, // Map for StoryPage.jsx
                content_images: data.content_images || [],
                message: data.message,
                shortMessage: data.short_message,
                customMessage: data.custom_message,
                target_name: data.target_name,
                sign_off: data.sign_off,
                pin_code: data.pin_code,
                music_url: data.music_url,
                color_theme_id: data.color_theme_id,
                timelines: data.timelines,
                finale_message: data.finale_message,
                finale_sign_off: data.finale_sign_off,
                status: data.status,
                created_at: toISO(data.created_at),
                approved_at: toISO(data.approved_at),
                expires_at: toISO(data.expires_at),
                story_url: data.story_url,
                custom_domain: data.custom_domain,
                // Do NOT return buyer_email, buyer_phone, or slip_url here
            }
        };

    } catch (error) {
        functions.logger.error('Get order error', { error: error.message, orderId });
        return { success: false, error: error.message };
    }
};

/**
 * Get order for extension page (includes edit info)
 * @param {string} orderId 
 * @returns {Promise<object>}
 */
const getOrderForExtension = async (orderId) => {
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
                tier_id: data.tier_id,
                tier_name: data.tier_name,
                status: data.status,
                created_at: toISO(data.created_at),
                approved_at: toISO(data.approved_at),
                expires_at: toISO(data.expires_at),
                // Content for preview/edit
                content_images: data.content_images || [],
                message: data.message,
                target_name: data.target_name,
                sign_off: data.sign_off,
                pin_code: data.pin_code,
                timelines: data.timelines,
                finale_message: data.finale_message,
                finale_sign_off: data.finale_sign_off,
                // Extension & Edit Tracking
                text_edits_used: data.text_edits_used || 0,
                image_edits_used: data.image_edits_used || 0,
                text_edit_payment_status: data.text_edit_payment_status,
                image_edit_payment_status: data.image_edit_payment_status,
                extension_status: data.extension_status,
                // History (sanitized)
                payment_slips_history: (data.payment_slips_history || []).map(h => ({
                    type: h.type,
                    amount: h.amount,
                    requested_at: h.requested_at,
                    status: h.status || 'pending'
                    // Do NOT return the slip URL in the history for public
                }))
            }
        };

    } catch (error) {
        functions.logger.error('Get order for extension error', { error: error.message, orderId });
        return { success: false, error: error.message };
    }
};

/**
 * Update global stats counter
 * @returns {Promise<void>}
 */
const updateStatsCounter = async () => {
    try {
        const statsRef = db.collection('stats').doc('users');
        await db.runTransaction(async (transaction) => {
            const statDoc = await transaction.get(statsRef);
            if (!statDoc.exists) {
                transaction.set(statsRef, { count: 1 });
            } else {
                const newCount = (statDoc.data().count || 0) + 1;
                transaction.update(statsRef, { count: newCount });
            }
        });
    } catch (error) {
        functions.logger.warn('Stats update error (non-critical)', { error: error.message });
    }
};

/**
 * Check domain availability (for frontend)
 * @param {string} domain 
 * @returns {Promise<object>}
 */
const checkDomain = async (domain) => {
    try {
        const available = await checkDomainAvailability(domain);
        return { success: true, available };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

module.exports = {
    createOrder,
    getOrder,
    getOrderForExtension,
    updateStatsCounter,
    checkDomain,
};
