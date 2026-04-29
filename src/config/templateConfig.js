/**
 * Template Configuration — Backend Single Source of Truth
 * 
 * สอดคล้องกับ frontend templateRegistry.js
 * ใช้สำหรับ: validation, order data mapping
 */

const TEMPLATE_CONFIG = {
    // ═══ TIER 1 ═══
    't1-1': {
        id: 't1-1',
        tierId: 1,
        name: 'Love Card',
        maxImages: 0,
        fields: ['pin', 'targetName', 'message', 'signOff'],
    },
    't1-2': {
        id: 't1-2',
        tierId: 1,
        name: 'Chat View',
        maxImages: 0,
        fields: ['targetName', 'shortMessage', 'customMessage'],
    },

    // ═══ TIER 2 ═══
    't2-1': {
        id: 't2-1',
        tierId: 2,
        name: 'Standard Love',
        maxImages: 5,
        fields: ['pin', 'targetName', 'message', 'signOff'],
    },

    // ═══ TIER 3 ═══
    't3-1': {
        id: 't3-1',
        tierId: 3,
        name: 'Premium Story',
        maxImages: 10,
        fields: ['timelines', 'finaleMessage', 'finaleSignOff'],
    },
};

/**
 * Get template config by ID
 * @param {string} templateId
 * @returns {object|null}
 */
const getTemplateConfig = (templateId) => {
    return TEMPLATE_CONFIG[templateId] || null;
};

/**
 * Get required fields for a template
 * @param {string} templateId
 * @returns {string[]}
 */
const getRequiredFields = (templateId) => {
    return TEMPLATE_CONFIG[templateId]?.fields || [];
};

/**
 * Check if a template requires a specific field
 * @param {string} templateId
 * @param {string} fieldName
 * @returns {boolean}
 */
const templateRequiresField = (templateId, fieldName) => {
    const fields = getRequiredFields(templateId);
    return fields.includes(fieldName);
};

module.exports = {
    TEMPLATE_CONFIG,
    getTemplateConfig,
    getRequiredFields,
    templateRequiresField,
};
