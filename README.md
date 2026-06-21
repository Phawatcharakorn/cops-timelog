# ระบบลงเวลา CoPs — คู่มือการใช้งาน

ระบบลงเวลาทำงานนิสิต สำหรับ Community of Practice (CoPs) มหาวิทยาลัยเกษตรศาสตร์ศรีราชา

---

## สารบัญ
1. [สำหรับนิสิต](#สำหรับนิสิต)
2. [สำหรับ Manager](#สำหรับ-manager)
3. [สำหรับ Dev](#สำหรับ-dev)
4. [การติดตั้ง (Developer)](#การติดตั้ง-developer)

---

## สำหรับนิสิต

**URL:** `/student`

### การลงเวลาเข้า
1. กรอก **รหัสนิสิต** → รอให้ระบบค้นหา
2. ตรวจสอบชื่อที่แสดง
3. **ครั้งแรก:** ตั้ง PIN 4 หลัก (กรอก 2 ช่อง: PIN + ยืนยัน PIN)
4. **ครั้งต่อไป:** กรอก PIN ที่ตั้งไว้
5. กด **บันทึกเวลาเข้า**

### การลงเวลาออก
1. กรอกรหัสนิสิต + PIN เหมือนเดิม
2. กรอก **สรุปงานที่ทำ**
3. กด **บันทึกเวลาออก**

### ดูประวัติ
- กด **ดูประวัติเดือนนี้** ใต้ปุ่มบันทึก
- เปลี่ยนเดือนดูย้อนหลังได้

### Feedback
- หากมี Feedback campaign เปิดอยู่ จะมี popup ให้ให้คะแนน (1–5 ดาว) หลังจากบันทึกเวลาเสร็จ
- แต่ละ campaign กรอกได้ **ครั้งเดียว** เท่านั้น

---

## สำหรับ Manager

**URL:** `/manager`

### การเข้าสู่ระบบ
- กรอก **Username** และ **Password** ที่ได้รับจาก Dev

### แท็บ รายบุคคล
- ดูข้อมูลนิสิตแต่ละคน เลือกจากรายชื่อ
- ดูประวัติการลงเวลา พร้อมสถานะ pending/approved
- **อนุมัติ** หรือ **แก้ไข** log แต่ละรายการ
- เพิ่ม log ย้อนหลังได้
- Export Excel รายบุคคล

### แท็บ ภาพรวม
- สรุปชั่วโมงรวมของนิสิตทุกคนในเดือนที่เลือก
- กด Export PDF เพื่อออกรายงานรวม

### แท็บ จัดการนิสิต
- เพิ่ม / แก้ไข / ลบนิสิต
- รีเซ็ต PIN นิสิต (กรณีลืม)

> **หมายเหตุ:** Manager จะเห็นเฉพาะนิสิตในฝ่าย (department) ของตัวเอง หากมีการตั้งค่า department ไว้

---

## สำหรับ Dev

**URL:** `/dev`  
ใช้ **Username/Password** จาก environment variable (`ADMIN_USERNAME` / `ADMIN_PASSWORD`)

### แท็บเพิ่มเติมที่ Dev เห็น

#### Feedback
- **เปิด Campaign ใหม่:** ตั้งหัวข้อ, ข้อความ, และระยะเวลา (วัน) → กด เริ่ม Feedback
- Campaign จะหมดอายุอัตโนมัติเมื่อครบกำหนด หรือกด หยุด ได้ทันที
- ดูผลคะแนนเฉลี่ยและความคิดเห็นของทุกคน

#### Managers
- เพิ่ม Manager ใหม่ (username, password, ชื่อ, ฝ่าย)
- แก้ไข / ลบ Manager ที่มีอยู่
- หากตั้ง department → Manager คนนั้นจะเห็นเฉพาะนิสิตฝ่ายนั้น
- หากไม่ตั้ง department → เห็นนิสิตทั้งหมด

---

## การติดตั้ง (Developer)

### Tech Stack
- **Next.js 14** (App Router, TypeScript)
- **Supabase** (PostgreSQL)
- **Tailwind CSS**
- **@react-pdf/renderer** — PDF ภาษาไทย
- **xlsx** — Export Excel

### 1. Clone & Install
```bash
git clone <repo-url>
cd <project>
npm install
```

### 2. Supabase
1. สร้าง project ที่ [supabase.com](https://supabase.com)
2. ไปที่ **SQL Editor** → รัน `schema.sql`
3. ไปที่ **Storage** → New bucket → ชื่อ `work-photos` → เปิด Public

### 3. Environment Variables
สร้างไฟล์ `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_strong_password
```

> `ADMIN_PASSWORD` ใช้ทั้งตรวจสอบ login และ generate API token — ตั้งให้ยากเดา

### 4. Thai Fonts (สำหรับ PDF)
วางไฟล์ `.ttf` ใน `public/fonts/`:
- `Sarabun-Regular.ttf`
- `Sarabun-Medium.ttf`
- `Sarabun-Bold.ttf`

### 5. Run
```bash
npm run dev
```

### 6. Deploy (Vercel)
1. Push ขึ้น GitHub
2. Import project ใน [vercel.com](https://vercel.com)
3. เพิ่ม Environment Variables ทั้ง 5 ตัวใน Vercel Settings
4. Deploy

---

## Routes

| Path | ผู้ใช้ | หมายเหตุ |
|------|--------|---------|
| `/student` | นิสิต | เปิดสาธารณะ |
| `/manager` | Manager | ล็อกอินด้วย username/password |
| `/dev` | Dev | ล็อกอินด้วย env credentials |

## ความปลอดภัย

- API routes ที่ทำลาย (สร้าง/แก้/ลบ manager, เปิด/ปิด campaign) ต้องการ HMAC token ที่ได้จากการ login เท่านั้น
- Password เปรียบเทียบแบบ timing-safe ป้องกัน timing attack
- Security headers ทุก response (X-Frame-Options, X-Content-Type-Options, ฯลฯ)
- PIN นิสิตเก็บใน database — แนะนำ upgrade Supabase plan หากต้องการ RLS เต็มรูปแบบ
