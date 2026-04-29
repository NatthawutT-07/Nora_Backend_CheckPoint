/**
 * Omise Service
 * Wrapper สำหรับ Omise Node.js SDK
 */
const crypto = require('crypto');
const { logger } = require('firebase-functions/v2');
const { defineSecret, defineString } = require('firebase-functions/params');

const omiseSecretKey = defineSecret('OMISE_SECRET_KEY');
const omiseWebhookSecret = defineSecret('OMISE_WEBHOOK_SECRET');
// Public key is safe to be a regular string parameter (can be set in .env or passed as process.env)
const omisePublicKey = process.env.OMISE_PUBLIC_KEY || 'pkey_test_6776nsfkj8ukaonuja0';

const getOmiseClient = () => {
    let secretKey = omiseSecretKey.value();
    if (!secretKey) {
        logger.error('OMISE_SECRET_KEY is empty or not set');
        throw new Error('OMISE_SECRET_KEY is not set');
    }
    
    // Clean up whitespace/newlines just in case it was pasted with them
    secretKey = secretKey.trim();

    // Debug log to ensure the secret starts with skey_test (don't log the full key)
    logger.info('Initializing Omise Client', {
        keyPrefix: secretKey.substring(0, 10),
        keyLength: secretKey.length
    });
    
    return require('omise')({ 
        publicKey: omisePublicKey,
        secretKey: secretKey,
        omiseVersion: '2019-09-29' // Good practice to pin the API version
    });
};

/**
 * สร้าง PromptPay Source จาก Omise
 * @param {number} amountSatang - ยอดเงินในหน่วย Satang (1 THB = 100 Satang)
 * @returns {Promise<object>} Omise Source object
 */
const createPromptPaySource = async (amountSatang) => {
    const omise = getOmiseClient();
    try {
        const source = await omise.sources.create({
            type: 'promptpay',
            amount: amountSatang,
            currency: 'thb',
        });
        logger.info('Omise PromptPay source created', { sourceId: source.id, amount: amountSatang });
        return source;
    } catch (error) {
        logger.error('Omise createPromptPaySource error', { error: error.message, code: error.code });
        throw new Error(`Omise source error: ${error.message}`);
    }
};

/**
 * ดึง Source object (เพื่อรับ QR หลังจากสร้าง Charge แล้ว)
 * @param {string} sourceId
 * @returns {Promise<object>} Omise Source object
 */
const retrieveSource = async (sourceId) => {
    const omise = getOmiseClient();
    try {
        const source = await omise.sources.retrieve(sourceId);
        return source;
    } catch (error) {
        logger.warn('Omise retrieveSource error (non-fatal)', { error: error.message, sourceId });
        return null;
    }
};

/**
 * สร้าง Charge จาก Source (PromptPay)
 * @param {number} amountSatang
 * @param {string} sourceId - Omise Source ID
 * @param {string} description
 * @returns {Promise<object>} Omise Charge object
 */
const createChargeFromSource = async (amountSatang, sourceId, description = 'NoraStory Payment') => {
    const omise = getOmiseClient();
    try {
        const charge = await omise.charges.create({
            amount: amountSatang,
            currency: 'thb',
            source: sourceId,
            description,
            capture: true,
            return_uri: process.env.OMISE_RETURN_URI || 'https://norastory.com',
        });
        logger.info('Omise charge created from source', { chargeId: charge.id, status: charge.status });
        return charge;
    } catch (error) {
        logger.error('Omise createChargeFromSource error', { error: error.message, sourceId });
        throw new Error(`Omise charge error: ${error.message}`);
    }
};

/**
 * สร้าง Charge จาก Card Token
 * @param {number} amountSatang
 * @param {string} tokenId - Omise Token ID จาก Omise.js
 * @param {string} description
 * @returns {Promise<object>} Omise Charge object
 */
const createChargeFromToken = async (amountSatang, tokenId, description = 'NoraStory Payment') => {
    const omise = getOmiseClient();
    try {
        const charge = await omise.charges.create({
            amount: amountSatang,
            currency: 'thb',
            card: tokenId,
            description,
            capture: true,
        });
        logger.info('Omise charge created from token', { chargeId: charge.id, status: charge.status });
        return charge;
    } catch (error) {
        logger.error('Omise createChargeFromToken error', { error: error.message });
        throw new Error(`Omise charge error: ${error.message}`);
    }
};

/**
 * ดึง Charge จาก Omise
 * @param {string} chargeId
 * @returns {Promise<object>}
 */
const retrieveCharge = async (chargeId) => {
    const omise = getOmiseClient();
    try {
        const charge = await omise.charges.retrieve(chargeId);
        return charge;
    } catch (error) {
        logger.error('Omise retrieveCharge error', { error: error.message, chargeId });
        throw new Error(`Omise retrieve error: ${error.message}`);
    }
};

/**
 * ตรวจสอบ Omise Webhook Signature
 * @param {string|Buffer} rawBody - Raw request body
 * @param {string} signatureHeader - X-Omise-Signature header value
 * @returns {boolean}
 */
const verifyWebhookSignature = (rawBody, signatureHeader) => {
    const webhookSecret = omiseWebhookSecret.value();
    if (!webhookSecret) {
        logger.warn('OMISE_WEBHOOK_SECRET not set — skipping signature verification');
        return true;
    }
    if (!signatureHeader) {
        logger.warn('Missing X-Omise-Signature header');
        return false;
    }
    try {
        const body = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
        const expected = crypto
            .createHmac('sha256', webhookSecret)
            .update(body)
            .digest('hex');
        return crypto.timingSafeEqual(
            Buffer.from(signatureHeader, 'utf8'),
            Buffer.from(expected, 'utf8')
        );
    } catch (error) {
        logger.error('Webhook signature verification error', { error: error.message });
        return false;
    }
};

/**
 * แปลงราคา THB (string) เป็น Satang (integer)
 * @param {string|number} priceTHB - ราคาในหน่วย THB เช่น "299" หรือ "1,299"
 * @returns {number} ยอดเงินในหน่วย Satang
 */
const toSatang = (priceTHB) => {
    const amount = parseFloat(String(priceTHB).replace(/,/g, ''));
    if (isNaN(amount) || amount <= 0) throw new Error('Invalid price amount');
    return Math.round(amount * 100);
};

module.exports = {
    omiseSecretKey,
    omiseWebhookSecret,
    getOmiseClient,
    createPromptPaySource,
    retrieveSource,
    createChargeFromSource,
    retrieveCharge,
    verifyWebhookSignature,
    toSatang,
};
