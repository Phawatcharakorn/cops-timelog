-- ─────────────────────────────────────────────────────────────────
-- เพิ่มคอลัมน์ position ให้ manager เพื่อให้ manager แต่ละคนถูก scope
-- ให้เห็นเฉพาะนิสิต SA ในตำแหน่งของตัวเอง (เมื่อ department = 'Student Assistant')
-- เช่นเดียวกับที่ department ใช้ scope ทั้งแผนก
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE managers ADD COLUMN IF NOT EXISTS position TEXT;
