/**
 * Cleanup Service
 * จัดการลบไฟล์ขยะใน Storage และข้อมูลที่หมดอายุ
 */
const { db, storage } = require('../config/firebase');
const logger = require('../utils/logger');

/**
 * ลบไฟล์ชั่วคราวใน Storage ที่ค้างเกินเวลาที่กำหนด
 * @param {number} maxAgeMinutes - อายุสูงสุดของไฟล์ (นาที) - ปรับเป็น 120 นาทีเพื่อความปลอดภัย
 */
const cleanupTemporaryUploads = async (maxAgeMinutes = 120) => {
    try {
        const bucket = storage.bucket();
        const [files] = await bucket.getFiles({ prefix: 'temp_uploads/' });
        
        const now = Date.now();
        const maxAgeMs = maxAgeMinutes * 60 * 1000;
        let deletedCount = 0;

        const deletePromises = files.map(async (file) => {
            const [metadata] = await file.getMetadata();
            const createdTime = new Date(metadata.timeCreated).getTime();
            
            if (now - createdTime > maxAgeMs) {
                await file.delete();
                deletedCount++;
            }
        });

        await Promise.all(deletePromises);
        
        if (deletedCount > 0) {
            logger.info('Cleanup temporary uploads completed', { deletedCount, maxAgeMinutes });
        }
        
        return { success: true, deletedCount };
    } catch (error) {
        logger.error('Cleanup temporary uploads failed', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    cleanupTemporaryUploads
};
