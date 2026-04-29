/**
 * Admin Controller
 * Cloud Functions v2 สำหรับ Admin Operations
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const adminService = require('../services/adminService');
const musicService = require('../services/musicService');
const { verifyAdmin, setAdminClaim, removeAdminClaim, getUserByEmail } = require('../middleware/auth');

/**
 * Helper to check admin access
 */
const requireAdmin = async (request) => {
    const adminCheck = await verifyAdmin(request);
    if (!adminCheck.isAdmin) {
        throw new HttpsError('permission-denied', adminCheck.error);
    }
    return adminCheck;
};

// ============================================
// Order Management
// ============================================

/**
 * Get all orders (admin only)
 */
const getAllOrders = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.getAllOrders(request.data);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return result;
});

/**
 * Get order details (admin only)
 */
const getOrderDetails = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.getOrderDetails(request.data.orderId);
    
    if (!result.success) {
        throw new HttpsError('not-found', result.error);
    }
    
    return result;
});

/**
 * Approve order (admin only)
 */
const approveOrder = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.approveOrder(request.data);
    
    if (!result.success) {
        throw new HttpsError('invalid-argument', result.error);
    }
    
    return result;
});

/**
 * Reject order (admin only)
 */
const rejectOrder = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.rejectOrder(request.data.orderId);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return result;
});

/**
 * Delete order (admin only)
 */
const deleteOrder = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.deleteOrder(request.data.orderId);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return result;
});

/**
 * Update order content (admin only)
 */
const updateOrderContent = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.updateOrderContent(request.data);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return result;
});

/**
 * Update order link (admin only)
 */
const updateOrderLink = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.updateOrderLink(request.data);
    
    if (!result.success) {
        throw new HttpsError('invalid-argument', result.error);
    }
    
    return result;
});

/**
 * Update order expiry (admin only)
 */
const updateExpiry = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.updateExpiry(request.data);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return result;
});

// ============================================
// Extension Management
// ============================================

/**
 * Approve extension (admin only)
 */
const approveExtension = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.approveExtension(request.data);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return result;
});

/**
 * Reject extension (admin only)
 */
const rejectExtension = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.rejectExtension(request.data.orderId);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return result;
});

// ============================================
// Edit Payment Management
// ============================================

/**
 * Approve edit payment (admin only)
 */
const approveEditPayment = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.approveEditPayment(request.data);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return result;
});

/**
 * Reject edit payment (admin only)
 */
const rejectEditPayment = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await adminService.rejectEditPayment(request.data);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return result;
});

// ============================================
// Music Management
// ============================================

/**
 * Get all music (public)
 */
const getAllMusic = onCall(async (request) => {
    const result = await musicService.getAllMusic();
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return result;
});

/**
 * Add music (admin only)
 */
const addMusic = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await musicService.addMusic(request.data);
    
    if (!result.success) {
        throw new HttpsError('invalid-argument', result.error);
    }
    
    return result;
});

/**
 * Update music (admin only)
 */
const updateMusic = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await musicService.updateMusic(request.data);
    
    if (!result.success) {
        throw new HttpsError('invalid-argument', result.error);
    }
    
    return result;
});

/**
 * Delete music (admin only)
 */
const deleteMusic = onCall(async (request) => {
    await requireAdmin(request);
    
    const result = await musicService.deleteMusic(request.data);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return result;
});

// ============================================
// Admin User Management
// ============================================

/**
 * Set admin claim for user (super admin only)
 */
const grantAdminAccess = onCall(async (request) => {
    await requireAdmin(request);
    
    const { email } = request.data;
    if (!email) {
        throw new HttpsError('invalid-argument', 'กรุณาระบุอีเมล');
    }
    
    const userResult = await getUserByEmail(email);
    if (!userResult.success) {
        throw new HttpsError('not-found', 'ไม่พบผู้ใช้งาน');
    }
    
    const result = await setAdminClaim(userResult.user.uid);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return { success: true, message: `ให้สิทธิ์ Admin แก่ ${email} เรียบร้อย` };
});

/**
 * Remove admin claim from user (super admin only)
 */
const revokeAdminAccess = onCall(async (request) => {
    await requireAdmin(request);
    
    const { email } = request.data;
    if (!email) {
        throw new HttpsError('invalid-argument', 'กรุณาระบุอีเมล');
    }
    
    const userResult = await getUserByEmail(email);
    if (!userResult.success) {
        throw new HttpsError('not-found', 'ไม่พบผู้ใช้งาน');
    }
    
    const result = await removeAdminClaim(userResult.user.uid);
    
    if (!result.success) {
        throw new HttpsError('internal', result.error);
    }
    
    return { success: true, message: `ถอนสิทธิ์ Admin จาก ${email} เรียบร้อย` };
});

module.exports = {
    // Orders
    getAllOrders,
    getOrderDetails,
    approveOrder,
    rejectOrder,
    deleteOrder,
    updateOrderContent,
    updateOrderLink,
    updateExpiry,
    
    // Extensions
    approveExtension,
    rejectExtension,
    
    // Edit Payments
    approveEditPayment,
    rejectEditPayment,
    
    // Music
    getAllMusic,
    addMusic,
    updateMusic,
    deleteMusic,
    
    // Admin Users
    grantAdminAccess,
    revokeAdminAccess,
};
