/**
 * Cleanup Controller
 * จัดการ Task อัตโนมัติสำหรับการล้างข้อมูลขยะ
 */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const cleanupService = require('../services/cleanupService');

/**
 * Scheduled task to clean up temporary uploads every hour
 * ลบไฟล์ใน temp_uploads/ ที่มีอายุเกิน 1 ชั่วโมง
 */
const scheduledCleanup = onSchedule({
    schedule: 'every 1 hours',
    timeZone: 'Asia/Bangkok',
    memory: '256MiB',
}, async (event) => {
    console.log('Running scheduled storage cleanup...');
    const result = await cleanupService.cleanupTemporaryUploads(120); // 120 minutes (2 hours) for safety
    console.log(`Cleanup result: ${result.deletedCount} files deleted.`);
});

module.exports = {
    scheduledCleanup
};
