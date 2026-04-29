# NoraStory Backend - Firebase Cloud Functions

Backend service สำหรับ NoraStory ที่ย้าย Business Logic ทั้งหมดออกจาก Frontend เพื่อความปลอดภัย

## 📁 โครงสร้างโปรเจค

```
Backend/
├── index.js                 # Main entry point - exports all functions
├── package.json             # Dependencies & scripts
├── .env.example             # Environment variables template
├── README.md                # This file
└── src/
    ├── config/
    │   ├── firebase.js      # Firebase Admin SDK initialization
    │   └── constants.js     # Application constants
    ├── controllers/
    │   ├── orderController.js   # Public order functions
    │   └── adminController.js   # Admin-only functions
    ├── middleware/
    │   └── auth.js          # Authentication & authorization
    ├── services/
    │   ├── orderService.js      # Order business logic
    │   ├── extensionService.js  # Extension & edit logic
    │   ├── adminService.js      # Admin operations
    │   ├── musicService.js      # Music management
    │   └── notificationService.js # LINE Notify
    └── utils/
        ├── idGenerator.js   # Story ID generation
        └── validators.js    # Input validation
```

## 🚀 การติดตั้ง

### 1. ติดตั้ง Dependencies

```bash
cd Backend
npm install
```

### 2. ตั้งค่า Environment Variables

```bash
# Copy template
cp .env.example .env

# แก้ไขค่าใน .env
```

### 3. ตั้งค่า Firebase Functions Config (Production)

```bash
# ตั้งค่า LINE Notify
firebase functions:config:set line.gas_url="YOUR_GAS_URL"
firebase functions:config:set line.notify_token="YOUR_LINE_TOKEN"

# ตั้งค่า Admin Emails (comma-separated)
firebase functions:config:set admin.emails="admin@norastory.com"
```

## 🧪 การทดสอบ Local

### เปิด Firebase Emulators

```bash
# จาก Frontend folder
cd ../frontend
firebase emulators:start --only functions,firestore,storage
```

### เปิดใช้งาน Emulator ใน Frontend

แก้ไข `frontend/src/firebase.js`:
```javascript
// Uncomment these lines
if (import.meta.env.DEV) {
    connectFunctionsEmulator(functions, 'localhost', 5001);
}
```

## 📦 การ Deploy

```bash
# จาก Frontend folder
cd ../frontend
firebase deploy --only functions
```

หรือ deploy พร้อมกับ rules และ hosting:
```bash
firebase deploy
```

## 🔐 การตั้งค่า Admin แรก

หลัง deploy ครั้งแรก ต้องตั้งค่า Custom Claims สำหรับ Admin:

### วิธีที่ 1: ใช้ Firebase Console

1. ไปที่ Firebase Console > Project Settings > Service Accounts
2. Generate new private key
3. รันสคริปต์ด้านล่างบน local machine:

```javascript
// set-admin.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const email = 'admin@norastory.com'; // เปลี่ยนเป็น email admin

admin.auth().getUserByEmail(email)
  .then(user => admin.auth().setCustomUserClaims(user.uid, { admin: true }))
  .then(() => console.log(`Admin claim set for ${email}`))
  .catch(err => console.error(err));
```

### วิธีที่ 2: ใช้ Admin Whitelist (ชั่วคราว)

เพิ่ม email ใน:
- `firestore.rules` > `isAdminEmail()` function
- `storage.rules` > `isAdminEmail()` function
- `Backend/src/middleware/auth.js` > `ADMIN_EMAILS` env

## 📋 รายการ Cloud Functions

### Public Functions (ไม่ต้อง Login)

| Function | Description |
|----------|-------------|
| `createOrder` | สร้าง order ใหม่ |
| `getOrder` | ดึงข้อมูล order (สำหรับแสดง story) |
| `getOrderForExtension` | ดึงข้อมูล order (สำหรับหน้า extension) |
| `checkDomain` | ตรวจสอบความว่างของ custom domain |
| `requestExtension` | ส่งคำขอต่ออายุ |
| `saveTextEdit` | บันทึกการแก้ไขข้อความ (ฟรี) |
| `saveImageEdit` | บันทึกการแก้ไขรูปภาพ (ฟรี) |
| `submitEditPayment` | ส่งสลิปชำระค่าแก้ไข |
| `getEditConfig` | ดึงการตั้งค่าสิทธิ์แก้ไข |
| `getAllMusic` | ดึงรายการเพลงทั้งหมด |

### Admin Functions (ต้อง Login + Admin Claim)

| Function | Description |
|----------|-------------|
| `adminGetAllOrders` | ดึง orders ทั้งหมด |
| `adminGetOrderDetails` | ดึงรายละเอียด order |
| `adminApproveOrder` | อนุมัติ order |
| `adminRejectOrder` | ปฏิเสธ order |
| `adminDeleteOrder` | ลบ order (รวม Storage files) |
| `adminUpdateOrderContent` | แก้ไขเนื้อหา order |
| `adminUpdateOrderLink` | แก้ไข custom link |
| `adminUpdateExpiry` | แก้ไขวันหมดอายุ |
| `adminApproveExtension` | อนุมัติการต่ออายุ |
| `adminRejectExtension` | ปฏิเสธการต่ออายุ |
| `adminApproveEditPayment` | อนุมัติการชำระค่าแก้ไข |
| `adminRejectEditPayment` | ปฏิเสธการชำระค่าแก้ไข |
| `adminAddMusic` | เพิ่มเพลง |
| `adminUpdateMusic` | แก้ไขเพลง |
| `adminDeleteMusic` | ลบเพลง |
| `adminGrantAccess` | ให้สิทธิ์ Admin |
| `adminRevokeAccess` | ถอนสิทธิ์ Admin |

## 🔒 Security Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   React App     │────▶│  Cloud Functions │────▶│    Firestore    │
│   (Frontend)    │     │  (Backend)       │     │    (Database)   │
│                 │     │                  │     │                 │
│  - UI only      │     │  - Auth check    │     │  - Admin SDK    │
│  - No secrets   │     │  - Validation    │     │  - Full access  │
│  - httpsCallable│     │  - Business logic│     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  External APIs  │
                        │  - LINE Notify  │
                        │  - (Future: Payment) │
                        └─────────────────┘
```

## 📝 Migration Notes

### สิ่งที่ย้ายจาก Frontend → Backend

1. **Business Logic**
   - การสร้าง Story ID (`generateUniqueStoryId`)
   - การคำนวณราคาและวันหมดอายุ
   - การตรวจสอบสิทธิ์แก้ไข

2. **Security Logic**
   - การตรวจสอบ Admin (Custom Claims)
   - การ validate ข้อมูล
   - การ sanitize input

3. **Data Operations**
   - การสร้าง/แก้ไข/ลบ orders
   - การอัปเดต stats
   - การจัดการ music

4. **External Integrations**
   - LINE Notify (ย้ายจาก GAS proxy)

### สิ่งที่ยังอยู่ใน Frontend

1. **UI Components** - ทั้งหมด
2. **Image Compression** - ทำก่อน upload เพื่อลด bandwidth
3. **Firebase Storage Upload** - ยังใช้ client SDK (มี rules ป้องกัน)
4. **Real-time Listeners** - Admin dashboard ยังใช้ onSnapshot

## ⚠️ สิ่งที่ต้องทำหลัง Migration

1. [ ] Deploy Cloud Functions
2. [ ] Deploy updated Firestore/Storage rules
3. [ ] ตั้งค่า Admin Custom Claims
4. [ ] Update Frontend components ให้ใช้ `httpsCallable`
5. [ ] ทดสอบ flow ทั้งหมด
6. [ ] Remove direct Firestore writes จาก Frontend

## 📞 Support

หากพบปัญหา กรุณาตรวจสอบ:
1. Firebase Functions logs: `firebase functions:log`
2. Browser console errors
3. Network tab ใน DevTools
