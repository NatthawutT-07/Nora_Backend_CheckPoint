/**
 * Firebase Admin SDK Configuration
 * ใช้สำหรับเข้าถึง Firestore, Storage, Auth จากฝั่ง Server
 */
const admin = require('firebase-admin');

// Initialize Firebase Admin (uses default credentials in Cloud Functions)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const storage = admin.storage();
const auth = admin.auth();

// Firestore settings
db.settings({ ignoreUndefinedProperties: true });

module.exports = {
    admin,
    db,
    storage,
    auth,
    FieldValue: admin.firestore.FieldValue,
    Timestamp: admin.firestore.Timestamp
};
