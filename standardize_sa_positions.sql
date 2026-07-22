-- ─────────────────────────────────────────────────────────────────
-- SA ตำแหน่งเดิมเป็นข้อความอิสระ ทำให้ค่าที่กรอกไปแล้วไม่ตรงกับ
-- 4 ตำแหน่งมาตรฐานที่ระบบใช้ตอนนี้ (กีฬา, SDEC, กิจกรรมนิสิต,
-- ห้องพยาบาล) รันสคริปต์นี้เพื่อ map ค่าเก่าเข้า 4 ตำแหน่งนี้
-- ─────────────────────────────────────────────────────────────────
UPDATE students SET position = 'กีฬา'
WHERE department = 'Student Assistant' AND position IN ('ห้องฟิตเนส', 'เคาน์เตอร์สระว่ายน้ำ', 'เทรนเนอร์');

UPDATE students SET position = 'กิจกรรมนิสิต'
WHERE department = 'Student Assistant' AND position IN ('บันทึกชั่วโมงกิจกรรม');

UPDATE students SET position = 'SDEC'
WHERE department = 'Student Assistant' AND position IN ('SA SDEC');

-- ตำแหน่งที่ตรงอยู่แล้ว ('SDEC', 'กิจกรรมนิสิต', 'ห้องพยาบาล') ไม่ต้องแก้
