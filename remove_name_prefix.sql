-- ลบคำนำหน้าชื่อ: นางสาว, น.ส., นาง, นาย
-- ลำดับสำคัญ — ต้องลบ "นางสาว" ก่อน "นาง" เพื่อไม่ให้เหลือ "สาว"
UPDATE students
SET name = TRIM(
  REPLACE(
    REPLACE(
      REPLACE(
        REPLACE(name, 'นางสาว', ''),
        'น.ส.', ''),
      'นาง', ''),
    'นาย', '')
)
WHERE name LIKE 'นางสาว%'
   OR name LIKE 'น.ส.%'
   OR name LIKE 'นาง%'
   OR name LIKE 'นาย%';
