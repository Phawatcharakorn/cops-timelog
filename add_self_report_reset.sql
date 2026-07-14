-- ─────────────────────────────────────────────────────────────────
-- self_report_reset_at: when a manager/admin uses the "รีเซ็ต" button on
-- the dev overview page, this is stamped with NOW() so a student's
-- self-report count for the current month starts counting fresh again
-- from that moment on — instead of deleting or altering their existing
-- (already-submitted) self-report logs.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE students ADD COLUMN IF NOT EXISTS self_report_reset_at TIMESTAMPTZ;
