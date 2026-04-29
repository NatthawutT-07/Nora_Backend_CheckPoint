/**
 * Music Service
 * จัดการ Business Logic สำหรับ Music
 */
const { db, storage, FieldValue } = require('../config/firebase');

/**
 * Get all music tracks
 * @returns {Promise<object>}
 */
const getAllMusic = async () => {
    try {
        const musicRef = db.collection('music');
        const snapshot = await musicRef.orderBy('number', 'asc').get();
        
        const musicList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return { success: true, musicList };

    } catch (error) {
        console.error('Get all music error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Add new music track (admin only)
 * @param {object} data - { name, number, url, fileName }
 * @returns {Promise<object>}
 */
const addMusic = async (data) => {
    try {
        const { name, number, url, fileName } = data;

        if (!name || !url) {
            return { success: false, error: 'กรุณาระบุชื่อเพลงและไฟล์เสียง' };
        }

        const docRef = await db.collection('music').add({
            name,
            number: parseInt(number, 10) || 1,
            url,
            fileName: fileName || null,
            created_at: FieldValue.serverTimestamp()
        });

        return { success: true, id: docRef.id };

    } catch (error) {
        console.error('Add music error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Update music track (admin only)
 * @param {object} data - { id, name, number }
 * @returns {Promise<object>}
 */
const updateMusic = async (data) => {
    try {
        const { id, name, number } = data;

        if (!name?.trim()) {
            return { success: false, error: 'กรุณาระบุชื่อเพลง' };
        }

        const musicRef = db.collection('music').doc(id);
        await musicRef.update({
            name,
            number: parseInt(number, 10) || 1
        });

        return { success: true };

    } catch (error) {
        console.error('Update music error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Delete music track (admin only)
 * @param {object} data - { id, fileName }
 * @returns {Promise<object>}
 */
const deleteMusic = async (data) => {
    try {
        const { id, fileName } = data;

        // Delete from Firestore
        await db.collection('music').doc(id).delete();

        // Delete from Storage if applicable
        if (fileName) {
            try {
                const bucket = storage.bucket();
                await bucket.file(`music/${fileName}`).delete();
            } catch (storageErr) {
                console.error('Storage delete error (might be external URL):', storageErr);
            }
        }

        return { success: true };

    } catch (error) {
        console.error('Delete music error:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Get random demo music
 * @param {number} count - Number of tracks to return
 * @returns {Promise<object>}
 */
const getRandomDemoMusic = async (count = 5) => {
    try {
        const musicRef = db.collection('music');
        const snapshot = await musicRef.limit(count).get();
        
        const musicList = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return { success: true, musicList };

    } catch (error) {
        console.error('Get random demo music error:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    getAllMusic,
    addMusic,
    updateMusic,
    deleteMusic,
    getRandomDemoMusic,
};
