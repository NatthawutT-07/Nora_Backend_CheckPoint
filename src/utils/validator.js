/**
 * Data Validator Utility
 * ใช้ Joi ในการตรวจสอบความถูกต้องของข้อมูลก่อนประมวลผล
 */
const Joi = require('joi');
const { HttpsError } = require('firebase-functions/v2/https');

/**
 * Common Schemas
 */
const schemas = {
    // Schema สำหรับสร้าง Order
    createOrder: Joi.object({
        tierId: Joi.string().valid('1', '2', '3').required(),
        buyerName: Joi.string().min(1).max(100).required(),
        targetName: Joi.string().min(1).max(100).allow('', null),
        message: Joi.string().max(2000).allow('', null),
        buyerEmail: Joi.string().email().required(),
        buyerPhone: Joi.string().pattern(/^[0-9+-\s]{9,15}$/).required(),
        orderId: Joi.string().max(100).optional(),
    }).unknown(true), // อนุญาตให้มีฟิลด์อื่นได้ แต่ต้องมีฟิลด์หลักครบ

    // Schema สำหรับเรียกดู Order
    getOrder: Joi.object({
        orderId: Joi.string().min(10).max(50).required(),
    }),

    // Schema สำหรับ Admin ในการจัดการ Order
    adminOrderAction: Joi.object({
        orderId: Joi.string().required(),
        status: Joi.string().valid('APPROVED', 'REJECTED', 'PENDING'),
        templateId: Joi.string().when('status', {
            is: 'APPROVED',
            then: Joi.required()
        })
    })
};

/**
 * Validate data against a schema
 * @param {string} schemaName - ชื่อ schema ใน schemas object
 * @param {object} data - ข้อมูลที่ต้องการตรวจสอบ
 * @throws {HttpsError} ถ้าข้อมูลไม่ถูกต้อง
 */
const validate = (schemaName, data) => {
    const schema = schemas[schemaName];
    if (!schema) {
        throw new Error(`Schema '${schemaName}' not found`);
    }

    const { error, value } = schema.validate(data, {
        abortEarly: false, // ตรวจสอบทุกฟิลด์ก่อนส่ง Error กลับ
        stripUnknown: false // ไม่ลบฟิลด์ที่ไม่ได้ระบุใน schema
    });

    if (error) {
        const details = error.details.map(d => d.message).join(', ');
        throw new HttpsError('invalid-argument', `ข้อมูลไม่ถูกต้อง: ${details}`);
    }

    return value;
};

module.exports = {
    validate,
    schemas
};
