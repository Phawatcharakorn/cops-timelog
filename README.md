# ระบบลงเวลาทำงาน CoPs Marketing

## Tech Stack
- **Next.js 14** (App Router) — frontend + API routes
- **Supabase** — PostgreSQL + Storage (รูปภาพ) + Auth (optional)
- **Tailwind CSS** — styling
- **@react-pdf/renderer** — PDF generation พร้อม Thai font
- **date-fns** — date formatting

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Supabase
1. สร้าง project ที่ [supabase.com](https://supabase.com)
2. รัน SQL ใน `schema.sql` ที่ SQL Editor
3. ไปที่ Storage > New bucket > ชื่อ **work-photos** > เปิด Public

### 3. Thai Fonts
ดาวน์โหลด Sarabun จาก Google Fonts และวางไว้ที่ `public/fonts/`:
- `Sarabun-Regular.ttf`
- `Sarabun-Medium.ttf`
- `Sarabun-Bold.ttf`

หรือใช้ script:
```bash
npx google-fonts-downloader Sarabun
```

### 4. Environment
```bash
cp .env.local.example .env.local
# แก้ค่าใน .env.local
```

### 5. Run
```bash
npm run dev
```

## Routes
| Path | ผู้ใช้ | คำอธิบาย |
|------|--------|---------|
| `/student` | นิสิต | ฟอร์มลงเวลาเข้า/ออก |
| `/admin` | แอดมิน | Dashboard + Export PDF |

## Deploy
```bash
npm run build
# Deploy to Vercel: vercel deploy
```
