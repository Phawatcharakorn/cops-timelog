-- ─────────────────────────────────────────────────────────────────
-- เพิ่ม Manager สำหรับพี่เลี้ยง SA แต่ละตำแหน่ง (role = Manager, department = 'Student Assistant')
-- รันหลังจาก add_manager_position.sql เท่านั้น (ต้องมีคอลัมน์ position ก่อน)
-- รหัสผ่านที่ตั้งให้แต่ละคน ดูได้จากข้อความแชท (ไม่เก็บ plaintext ไว้ในไฟล์นี้)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO managers (username, password_hash, name, role, department, position) VALUES
  ('pnr_activity', 'db7a5df6d819d1dcb2e5185b53824a89:3c13c47b36e2ebe14aaa325f5eae02e550315d16a6d6d48ba7626913632170237753782832eaff643477b53027d75b10b705c871c0c5dac4b74717717b35d0c9', 'นางพัชรินทร์ สิทธิเวชเมธี', 'Manager', 'Student Assistant', 'กิจกรรมนิสิต'),
  ('ncj_sickroom', 'ba0b33c9917622e898b54a0d8ce1db76:a1e85b10a32da40de5699938d1378aac2e2d0bb1dd71e4635c8f969838791c677b1cfae060b9419453d84015eeb65fe971e6ff10a3397504053a507a2c59ba29', 'นางสาวนุชจรินทร์ รักจรรยาบรรณ', 'Manager', 'Student Assistant', 'ห้องพยาบาล'),
  ('cyw_sports', '146b45b410cd334b4feabdd46f31f89e:a1fed545eadc56b9c05d3271fd39cae9c357680d4e1ee54d0beb7567de5124d3c7c57034697ba28001beb86b520cc5433f562b13e82b7480d01862cb55acebba', 'นายชยวัฒก์ ทิมจันทร์', 'Manager', 'Student Assistant', 'กีฬา'),
  ('jrs_fitness', '9977a1a6cafc35b937a475941af6ce58:ab05bb6ce12c9bbb2f2d21b7a3de46f32759d026ffa3e3f764b354e802e729ad9564492eb1859ab44cb2a6f45ee3a03862a892349e7c335bd82edbf61d0ccc3b', 'นางสาวจงรักษ์ จงบริบูรณ์', 'Manager', 'Student Assistant', 'ห้องออกกำลังกาย'),
  ('ypd_happyplace', '246c638b14a1144bdb3c3ec449a38b59:f2aaa0d783b1923b95ef876adbd4da55ab0d29457b25ee7d15fdb56f6819cbb6b32667a281e8bed36b323f453f2af02304e5e11cde468e0761412c8cb00312ce', 'นางยุพดี ทรัพย์เจริญ', 'Manager', 'Student Assistant', 'Happy Place'),
  ('rdw_sdec', 'dbe7c2f8407cd92adaba0b351abf902d:d51a10ae9d40696593e6de366bd7e0d4e7c1269b86e725233a6d34a30e89ff81ed4179453bcb21764a893829b62bf8747225c0d84f561fc81b96b68fceff0a74', 'นางสาวฤดีวรรณ อาจหาญ', 'Manager', 'Student Assistant', 'SDEC')
ON CONFLICT (username) DO NOTHING;
