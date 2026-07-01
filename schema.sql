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

-- ──────────────────────────────────────────────────────────────────────────────
-- Role: Manager (อาจารย์/ผู้ดูแล)
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE managers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  department    TEXT,          -- NULL = เห็นทุกแผนก
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────────────────────────
-- Feedback system
-- ──────────────────────────────────────────────────────────────────────────────
CREATE TABLE feedback_campaigns (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  message    TEXT        NOT NULL DEFAULT 'กรุณาให้ความคิดเห็นเกี่ยวกับระบบ',
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at   TIMESTAMPTZ
);

CREATE TABLE feedback_responses (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id      UUID        NOT NULL REFERENCES feedback_campaigns(id) ON DELETE CASCADE,
  respondent_type  TEXT        NOT NULL CHECK (respondent_type IN ('student', 'manager')),
  respondent_id    TEXT        NOT NULL,   -- student_id หรือ manager username
  respondent_name  TEXT,
  rating           INTEGER     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment          TEXT,
  submitted_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ป้องกัน submit ซ้ำ (คนเดิม + campaign เดิม)
CREATE UNIQUE INDEX idx_feedback_unique ON feedback_responses(campaign_id, respondent_type, respondent_id);

-- ──────────────────────────────────────────────────────────────────────────────
-- Self-reported time logs (นิสิตลงเวลาย้อนหลังเอง — รอ dev/manager ตรวจสอบ)
-- Note: status/approved_by/approved_at/paid/paid_at columns already exist in
-- production but predate this file — run only the ALTER below if missing.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS is_self_reported BOOLEAN NOT NULL DEFAULT false;

-- ──────────────────────────────────────────────────────────────────────────────
-- Attachments (photo_url column above was defined from the start but unused
-- until now — student/manager/dev "add log" forms can attach an image or PDF)
-- Reuses the "work-photos" Storage bucket. Run this if the bucket isn't public yet.
-- ──────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('work-photos', 'work-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow anon (client-side) uploads/reads to this bucket, since students/managers
-- authenticate via PIN/HMAC token, not Supabase Auth.
-- (CREATE POLICY has no IF NOT EXISTS in Postgres, so drop first to stay idempotent.)
DROP POLICY IF EXISTS "work-photos public read" ON storage.objects;
CREATE POLICY "work-photos public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'work-photos');
DROP POLICY IF EXISTS "work-photos anon upload" ON storage.objects;
CREATE POLICY "work-photos anon upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'work-photos');

-- ──────────────────────────────────────────────────────────────────────────────
-- Reject ("ตีกลับ") a log back to the student with a reason, without deleting it.
-- Status stays 'pending' so it still shows up for staff review after the
-- student edits and resubmits.
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS is_rejected BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

-- ──────────────────────────────────────────────────────────────────────────────
-- Guard against duplicate check-ins ("ปุ่มกดเอง" bug report): the app only
-- checked "is there already an open log?" client-side before inserting, which
-- is a check-then-act race — two rapid clicks (double-tap) or two tabs can
-- both pass the check before either insert lands, creating two open rows for
-- the same student. This constraint makes a 2nd concurrent check-in fail at
-- the database instead of silently succeeding. The app already has a
-- client-side re-entrancy lock as the first line of defense; this is the
-- backstop. Safe to run — verified no student currently has 2+ open logs.
-- ──────────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_log_per_student
  ON time_logs(student_id) WHERE check_out IS NULL;
