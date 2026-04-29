/**
 * NoraStory Backend - Firebase Cloud Functions v2
 * 
 * Main entry point for all Cloud Functions
 * แยก Business Logic ออกจาก Frontend เพื่อความปลอดภัย
 */

const orderController = require('./src/controllers/orderController');
const adminController = require('./src/controllers/adminController');
const cleanupController = require('./src/controllers/cleanupController');

// ============================================
// PUBLIC FUNCTIONS (No Auth Required)
// ============================================

// Order Operations
exports.createOrder = orderController.createOrder;
exports.getOrder = orderController.getOrder;
exports.getOrderForExtension = orderController.getOrderForExtension;
exports.checkDomain = orderController.checkDomain;

// Extension & Edit Operations
exports.requestExtension = orderController.requestExtension;
exports.saveTextEdit = orderController.saveTextEdit;
exports.saveImageEdit = orderController.saveImageEdit;
exports.submitEditPayment = orderController.submitEditPayment;
exports.getEditConfig = orderController.getEditConfig;

// Music (Public Read)
exports.getAllMusic = adminController.getAllMusic;

// ============================================
// ADMIN FUNCTIONS (Auth Required)
// ============================================

// Order Management
exports.adminGetAllOrders = adminController.getAllOrders;
exports.adminGetOrderDetails = adminController.getOrderDetails;
exports.adminApproveOrder = adminController.approveOrder;
exports.adminRejectOrder = adminController.rejectOrder;
exports.adminDeleteOrder = adminController.deleteOrder;
exports.adminUpdateOrderContent = adminController.updateOrderContent;
exports.adminUpdateOrderLink = adminController.updateOrderLink;
exports.adminUpdateExpiry = adminController.updateExpiry;

// Extension Management
exports.adminApproveExtension = adminController.approveExtension;
exports.adminRejectExtension = adminController.rejectExtension;

// Edit Payment Management
exports.adminApproveEditPayment = adminController.approveEditPayment;
exports.adminRejectEditPayment = adminController.rejectEditPayment;

// Music Management
exports.adminAddMusic = adminController.addMusic;
exports.adminUpdateMusic = adminController.updateMusic;
exports.adminDeleteMusic = adminController.deleteMusic;

// Admin User Management
exports.adminGrantAccess = adminController.grantAdminAccess;
exports.adminRevokeAccess = adminController.revokeAdminAccess;

// ============================================
// SCHEDULED TASKS
// ============================================

exports.scheduledStorageCleanup = cleanupController.scheduledCleanup;
