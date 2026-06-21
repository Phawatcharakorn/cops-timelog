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
