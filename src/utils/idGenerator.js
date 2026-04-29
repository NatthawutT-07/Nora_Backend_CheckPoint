/**
 * ID Generator Utilities
 * สำหรับสร้างรหัสต่างๆ ในระบบ
 */
const { db } = require('../config/firebase');
const { STORY_ID_LENGTH, STORY_ID_CHARS } = require('../config/constants');

/**
 * Generate random alphanumeric ID
 * @param {number} length - Length of ID (default: 15)
 * @returns {string} Random ID
 */
const generateRandomId = (length = STORY_ID_LENGTH) => {
    let result = '';
    for (let i = 0; i < length; i++) {
        result += STORY_ID_CHARS.charAt(Math.floor(Math.random() * STORY_ID_CHARS.length));
    }
    return result;
};

/**
 * Generate unique story ID (checks for duplicates in Firestore)
 * @param {number} maxAttempts - Maximum retry attempts
 * @returns {Promise<string>} Unique story ID
 */
const generateUniqueStoryId = async (maxAttempts = 5) => {
    let attempts = 0;

    while (attempts < maxAttempts) {
        const newId = generateRandomId();
        const docRef = db.collection('orders').doc(newId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return newId;
        }

        attempts++;
    }

    // Fallback: append timestamp suffix
    return generateRandomId() + Date.now().toString(36).slice(-3);
};

/**
 * Check if a custom domain/ID is available
 * @param {string} domain - Custom domain to check
 * @returns {Promise<boolean>} True if available
 */
const checkDomainAvailability = async (domain) => {
    if (!domain || domain.length < 3) {
        return false;
    }

    const docRef = db.collection('orders').doc(domain);
    const docSnap = await docRef.get();
    
    return !docSnap.exists;
};

/**
 * Validate custom domain format
 * @param {string} domain - Domain to validate
 * @returns {object} { valid: boolean, error?: string }
 */
const validateCustomDomain = (domain) => {
    if (!domain) {
        return { valid: false, error: 'กรุณาระบุชื่อลิงก์' };
    }
    
    if (domain.length < 8) {
        return { valid: false, error: 'ชื่อลิงก์ต้องมีอย่างน้อย 8 ตัวอักษร' };
    }
    
    if (!/^[a-z0-9-]+$/.test(domain)) {
        return { valid: false, error: 'เฉพาะภาษาอังกฤษตัวพิมพ์เล็ก ตัวเลข และขีด (-) เท่านั้น' };
    }
    
    return { valid: true };
};

module.exports = {
    generateRandomId,
    generateUniqueStoryId,
    checkDomainAvailability,
    validateCustomDomain,
};
