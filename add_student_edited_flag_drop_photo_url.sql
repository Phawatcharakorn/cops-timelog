-- Run this once in Supabase SQL Editor (also appended to schema.sql for
-- future fresh installs — this file is the copy-paste version for the
-- existing production database).

-- นิสิตแก้ไขเวลาของตัวเอง — flag ให้ dev/manager เห็นว่ารายการนี้ถูกแก้เวลา
-- โดยนิสิต (ไม่ใช่ log ใหม่) ดู StudentClient.tsx handleSelfReport
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS is_student_edited BOOLEAN NOT NULL DEFAULT false;

-- ปิดฟีเจอร์แนบไฟล์หลักฐานงาน (time_logs.photo_url) เพื่อประหยัดพื้นที่เก็บข้อมูล
-- — ไม่กระทบ students.bank_book_url ซึ่งใช้ bucket "work-photos" เดียวกันแต่คนละคอลัมน์
ALTER TABLE time_logs DROP COLUMN IF EXISTS photo_url;
