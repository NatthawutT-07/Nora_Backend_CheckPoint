/**
 * Application Constants
 * ค่าคงที่สำหรับใช้ทั้งระบบ
 */

// Tier durations (days)
const TIER_DURATIONS = {
    1: 3,    // Tier 1: 3 days
    2: 7,    // Tier 2: 7 days  
    3: 15,   // Tier 3: 15 days
    '1': 3,
    '2': 7,
    '3': 15,
};

// Edit configurations per tier
const EDIT_CONFIG = {
    1: {
        freeTextEdits: 1,
        freeImageEdits: 0,
        paidTextPrice: 29,
        paidImagePrice: 0,
    },
    2: {
        freeTextEdits: 1,
        freeImageEdits: 1,
        paidTextPrice: 29,
        paidImagePrice: 49,
    },
    3: {
        freeTextEdits: 3,
        freeImageEdits: 1,
        paidTextPrice: 29,
        paidImagePrice: 79,
    },
};

// Extension packages per tier
const EXTENSION_PACKAGES = {
    1: [
        { days: 3, price: 39, label: '3 วัน' },
        { days: 7, price: 79, label: '7 วัน' }
    ],
    2: [
        { days: 7, price: 99, label: '7 วัน' },
        { days: 15, price: 169, label: '15 วัน' },
        { days: 30, price: 299, label: '30 วัน' }
    ],
    3: [
        { days: 15, price: 199, label: '15 วัน' },
        { days: 30, price: 349, label: '30 วัน' },
        { days: 60, price: 599, label: '60 วัน' }
    ]
};

// Order statuses
const ORDER_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    COMPLETED: 'completed',
    EXPIRED: 'expired',
};

// Payment statuses (slip-based, existing)
const PAYMENT_STATUS = {
    PENDING: 'pending',
    APPROVED: 'approved',
    REJECTED: 'rejected',
};

// Payment session statuses (Omise-based, new)
const PAYMENT_SESSION_STATUS = {
    PENDING: 'pending_payment',
    PAID: 'paid',
    COMPLETED: 'completed',
    EXPIRED: 'expired',
};

// Payment methods
const PAYMENT_METHOD = {
    PROMPTPAY: 'promptpay',
    CARD: 'card',
    SLIP: 'slip',
};

// Payment session duration (milliseconds)
const PAYMENT_SESSION_DURATION_MS = 10 * 60 * 1000; // 10 minutes

// Link types
const LINK_TYPES = {
    RANDOM: 'random',
    CUSTOM: 'custom',
    SPECIAL: 'special',
};

// File size limits (bytes)
const FILE_LIMITS = {
    SLIP_MAX_SIZE: 5 * 1024 * 1024,      // 5MB
    IMAGE_MAX_SIZE: 5 * 1024 * 1024,     // 5MB
    MUSIC_MAX_SIZE: 10 * 1024 * 1024,    // 10MB
};

// Story ID configuration
const STORY_ID_LENGTH = 15;
const STORY_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

module.exports = {
    TIER_DURATIONS,
    EDIT_CONFIG,
    EXTENSION_PACKAGES,
    ORDER_STATUS,
    PAYMENT_STATUS,
    PAYMENT_SESSION_STATUS,
    PAYMENT_METHOD,
    PAYMENT_SESSION_DURATION_MS,
    LINK_TYPES,
    FILE_LIMITS,
    STORY_ID_LENGTH,
    STORY_ID_CHARS,
};
