const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const makeAdmin = async (email) => {
  try {
    let user;
    try {
      // 1. ลองหา User ก่อนว่ามีในระบบหรือยัง
      user = await admin.auth().getUserByEmail(email);
      console.log(`Found existing user: ${email}`);
    } catch (e) {
      // 2. ถ้ายังไม่มี ให้สร้าง Account ให้เลย
      if (e.code === 'auth/user-not-found') {
        console.log(`User not found. Creating new user: ${email}`);
        user = await admin.auth().createUser({
          email: email,
          password: 'AdminPassword123!', // รหัสผ่านเริ่มต้น
          emailVerified: true
        });
        console.log(`Created new user! Your temporary password is: AdminPassword123!`);
      } else {
        throw e;
      }
    }

    // 3. ให้สิทธิ์ Admin
    await admin.auth().setCustomUserClaims(user.uid, { admin: true });
    console.log(`Success! ${email} is now an admin.`);
    console.log('Please log out and log back in on the frontend to apply the new permissions.');
    process.exit(0);
  } catch (error) {
    console.error('Error setting admin privileges:', error);
    process.exit(1);
  }
};

const targetEmail = process.argv[2] || 'mymymy0526@gmail.com';
makeAdmin(targetEmail);
