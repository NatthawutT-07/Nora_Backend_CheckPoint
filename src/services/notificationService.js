/**
 * Notification Service
 * จัดการการส่ง Notification ต่างๆ (LINE, Email, etc.)
 */
const axios = require('axios');
const functions = require('firebase-functions');

// Get LINE Notify token from environment/config
const getLineNotifyConfig = () => {
    // Try Firebase Functions config first, then environment variables
    try {
        const config = functions.config();
        return {
            accessToken: config.line?.notify_token || process.env.LINE_NOTIFY_TOKEN,
            gasUrl: config.line?.gas_url || process.env.LINE_NOTIFY_GAS_URL
        };
    } catch {
        return {
            accessToken: process.env.LINE_NOTIFY_TOKEN,
            gasUrl: process.env.LINE_NOTIFY_GAS_URL
        };
    }
};

/**
 * Send LINE Notify message via Google Apps Script proxy
 * @param {string} message - Message to send
 * @returns {Promise<object>}
 */
const sendLineNotifyViaGAS = async (message) => {
    const config = getLineNotifyConfig();
    
    if (!config.gasUrl) {
        functions.logger.warn('LINE Notify GAS URL not configured');
        return { success: false, error: 'LINE Notify not configured' };
    }

    try {
        await axios.post(config.gasUrl, { message }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
        });
        return { success: true };
    } catch (error) {
        functions.logger.error('LINE Notify GAS error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Send LINE Notify message directly
 * @param {string} message - Message to send
 * @returns {Promise<object>}
 */
const sendLineNotifyDirect = async (message) => {
    const config = getLineNotifyConfig();
    
    if (!config.accessToken) {
        functions.logger.warn('LINE Notify token not configured');
        return { success: false, error: 'LINE Notify not configured' };
    }

    try {
        await axios.post('https://notify-api.line.me/api/notify', 
            `message=${encodeURIComponent(message)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Bearer ${config.accessToken}`
                },
                timeout: 10000
            }
        );
        return { success: true };
    } catch (error) {
        functions.logger.error('LINE Notify direct error', { error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Send notification (tries GAS first, then direct)
 * @param {string} message 
 * @returns {Promise<object>}
 */
const sendLineNotify = async (message) => {
    const config = getLineNotifyConfig();
    
    // Try GAS proxy first (recommended for CORS)
    if (config.gasUrl) {
        return sendLineNotifyViaGAS(message);
    }
    
    // Fallback to direct API
    if (config.accessToken) {
        return sendLineNotifyDirect(message);
    }
    
    functions.logger.warn('No LINE Notify configuration found');
    return { success: false, error: 'LINE Notify not configured' };
};

// ============================================
// Pre-formatted notification messages
// ============================================

/**
 * Notify new order
 * @param {object} order - Order data
 */
const notifyNewOrder = async (order) => {
    const message = `🔔 มีออเดอร์ใหม่เข้า!
Order ID: ${order.id}
แพ็คเกจ: ${order.tierName}
ราคา: ${order.price} บาท
ชื่อผู้ซื้อ: ${order.buyerName}
อีเมล: ${order.buyerEmail}`;

    return sendLineNotify(message);
};

/**
 * Notify extension request
 * @param {object} data - Extension request data
 */
const notifyExtensionRequest = async (data) => {
    const message = `🔄 ขอต่ออายุลิงก์
Order ID: ${data.orderId}
แพ็คเกจต่ออายุ: ${data.packageLabel}
ราคา: ${data.totalPrice} บาท`;

    return sendLineNotify(message);
};

/**
 * Notify text edit
 * @param {string} orderId 
 */
const notifyTextEdit = async (orderId) => {
    const message = `📝 มีการแก้ไขข้อความใหม่!
Order ID: ${orderId}`;

    return sendLineNotify(message);
};

/**
 * Notify image edit
 * @param {string} orderId 
 */
const notifyImageEdit = async (orderId) => {
    const message = `📸 มีการแก้ไขรูปภาพใหม่!
Order ID: ${orderId}`;

    return sendLineNotify(message);
};

/**
 * Notify edit payment
 * @param {object} data - Payment data
 */
const notifyEditPayment = async (data) => {
    const editTypeName = data.editType === 'text' ? 'ข้อความ' : 'รูปภาพ';
    const message = `💰 แจ้งชำระเงินค่าแก้ไข${editTypeName}
Order ID: ${data.orderId}
ราคา: ${data.price} บาท`;

    return sendLineNotify(message);
};

module.exports = {
    sendLineNotify,
    sendLineNotifyViaGAS,
    sendLineNotifyDirect,
    notifyNewOrder,
    notifyExtensionRequest,
    notifyTextEdit,
    notifyImageEdit,
    notifyEditPayment,
};
