-- Run in Supabase SQL Editor

CREATE TABLE students (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  TEXT        UNIQUE NOT NULL,
  name        TEXT        NOT NULL,
  department  TEXT        NOT NULL DEFAULT 'CoPs Marketing',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE time_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   TEXT        NOT NULL REFERENCES students(student_id) ON DELETE CASCADE,
  check_in     TIMESTAMPTZ NOT NULL,
  check_out    TIMESTAMPTZ,
  work_summary TEXT,
  photo_url    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_time_logs_student_id ON time_logs(student_id);
CREATE INDEX idx_time_logs_check_in   ON time_logs(check_in);

-- Supabase Storage bucket for photos
-- ไปสร้างที่ Storage > New bucket > ชื่อ "work-photos" > Public
