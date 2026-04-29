/**
 * Authentication Middleware
 * ตรวจสอบสิทธิ์การเข้าถึง
 */
const { auth } = require('../config/firebase');

/**
 * Verify if the request comes from an authenticated user
 * @param {object} request - Firebase v2 callable request
 * @returns {object} { authenticated: boolean, uid?: string, error?: string }
 */
const verifyAuth = (request) => {
    if (!request.auth) {
        return {
            authenticated: false,
            error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน'
        };
    }

    return {
        authenticated: true,
        uid: request.auth.uid,
        email: request.auth.token?.email,
        token: request.auth.token
    };
};

/**
 * Verify if the user has admin privileges
 * Uses Firebase Custom Claims
 * @param {object} request - Firebase v2 callable request
 * @returns {Promise<object>} { isAdmin: boolean, error?: string }
 */
const verifyAdmin = async (request) => {
    const authResult = verifyAuth(request);
    
    if (!authResult.authenticated) {
        return {
            isAdmin: false,
            error: authResult.error
        };
    }

    // Check custom claims for admin role
    const token = request.auth.token;
    
    if (token.admin === true) {
        return {
            isAdmin: true,
            uid: authResult.uid,
            email: authResult.email
        };
    }

    // Fallback: Check against whitelist (for initial setup)
    const adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
    if (adminEmails.includes(authResult.email)) {
        return {
            isAdmin: true,
            uid: authResult.uid,
            email: authResult.email
        };
    }

    return {
        isAdmin: false,
        error: 'คุณไม่มีสิทธิ์เข้าถึงส่วนนี้'
    };
};

/**
 * Set admin custom claim for a user
 * Should only be called by existing admins or via Firebase Console
 * @param {string} uid - User ID to grant admin access
 * @returns {Promise<object>}
 */
const setAdminClaim = async (uid) => {
    try {
        await auth.setCustomUserClaims(uid, { admin: true });
        return { success: true };
    } catch (error) {
        console.error('Error setting admin claim:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Remove admin custom claim from a user
 * @param {string} uid - User ID to revoke admin access
 * @returns {Promise<object>}
 */
const removeAdminClaim = async (uid) => {
    try {
        await auth.setCustomUserClaims(uid, { admin: false });
        return { success: true };
    } catch (error) {
        console.error('Error removing admin claim:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get user by email
 * @param {string} email 
 * @returns {Promise<object>}
 */
const getUserByEmail = async (email) => {
    try {
        const user = await auth.getUserByEmail(email);
        return { success: true, user };
    } catch (error) {
        return { success: false, error: error.message };
    }
};

module.exports = {
    verifyAuth,
    verifyAdmin,
    setAdminClaim,
    removeAdminClaim,
    getUserByEmail,
};
