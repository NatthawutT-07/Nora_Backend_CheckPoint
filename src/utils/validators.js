/**
 * Input Validators
 * ตรวจสอบความถูกต้องของข้อมูล — ใช้ Template Config แทน boolean flags
 */
const { getRequiredFields, templateRequiresField } = require('../config/templateConfig');

/**
 * Validate email format
 * @param {string} email 
 * @returns {boolean}
 */
const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
};

/**
 * Validate Thai phone number
 * @param {string} phone 
 * @returns {boolean}
 */
const isValidPhone = (phone) => {
    if (!phone || typeof phone !== 'string') return false;
    const cleaned = phone.replace(/[\s-]/g, '');
    return cleaned.length >= 9 && cleaned.length <= 10 && /^\d+$/.test(cleaned);
};

/**
 * Validate PIN code (4 digits)
 * @param {string} pin 
 * @returns {boolean}
 */
const isValidPin = (pin) => {
    if (!pin || typeof pin !== 'string') return false;
    return /^\d{4}$/.test(pin);
};

/**
 * Validate order creation data — uses template registry for field requirements
 * @param {object} data 
 * @returns {object} { valid: boolean, errors: string[] }
 */
const validateOrderData = (data) => {
    const errors = [];

    // Required fields (common to all orders)
    if (!data.tierId) errors.push('กรุณาเลือกแพ็คเกจ');
    if (!data.buyerName?.trim()) errors.push('กรุณากรอกชื่อผู้สั่งซื้อ');
    if (!isValidEmail(data.buyerEmail)) errors.push('กรุณากรอก Email ที่ถูกต้อง');
    if (!isValidPhone(data.buyerPhone)) errors.push('กรุณากรอกเบอร์โทรศัพท์ที่ถูกต้อง');
    if (!data.selectedTemplate) errors.push('กรุณาเลือกธีม');

    // Template-specific validation — driven by template config, no if/else chains
    const templateId = data.selectedTemplate;
    const requiredFields = getRequiredFields(templateId);

    if (requiredFields.includes('pin')) {
        if (!isValidPin(data.pin)) errors.push('กรุณาใส่ PIN 4 หลัก');
    }
    if (requiredFields.includes('targetName')) {
        if (!data.targetName?.trim()) errors.push('กรุณากรอกชื่อคนรับ');
    }
    if (requiredFields.includes('message')) {
        if (!data.message?.trim()) errors.push('กรุณากรอกข้อความ');
        if (data.message && data.message.length > 100) {
            errors.push('ข้อความต้องไม่เกิน 100 ตัวอักษร');
        }
    }
    if (requiredFields.includes('shortMessage')) {
        if (!data.shortMessage?.trim()) errors.push('กรุณากรอกข้อความแรกที่ทักทาย');
    }
    if (requiredFields.includes('customMessage')) {
        if (!data.customMessage?.trim()) errors.push('กรุณากรอกข้อความบอกรักส่วนที่ 2');
    }
    if (requiredFields.includes('finaleMessage')) {
        if (!data.finaleMessage?.trim()) errors.push('กรุณากรอกข้อความสุดท้าย');
    }

    // Custom link validation
    if (data.wantSpecialLink || data.wantCustomLink) {
        if (!data.customDomain?.trim()) {
            errors.push('กรุณาระบุชื่อลิงก์ที่ต้องการ');
        } else if (data.customDomain.length < 8) {
            errors.push('ชื่อลิงก์ต้องมีอย่างน้อย 8 ตัวอักษร');
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Validate extension request data
 * @param {object} data 
 * @returns {object} { valid: boolean, errors: string[] }
 */
const validateExtensionData = (data) => {
    const errors = [];

    if (!data.orderId) errors.push('ไม่พบรหัสคำสั่งซื้อ');
    if (!data.packageDays || data.packageDays <= 0) errors.push('กรุณาเลือกแพ็คเกจต่ออายุ');
    if (!data.slipUrl) errors.push('กรุณาแนบสลิปโอนเงิน');

    return {
        valid: errors.length === 0,
        errors
    };
};

/**
 * Sanitize string input (basic XSS prevention)
 * @param {string} input 
 * @returns {string}
 */
const sanitizeString = (input) => {
    if (!input || typeof input !== 'string') return '';
    return input
        .trim()
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
};

module.exports = {
    isValidEmail,
    isValidPhone,
    isValidPin,
    validateOrderData,
    validateExtensionData,
    sanitizeString,
};
