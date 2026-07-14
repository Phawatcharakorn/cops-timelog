-- ─────────────────────────────────────────────────────────────────
-- git_repos: which repo(s) (owner/name, comma-separated) a git-derived
-- session's commits came from — lets the "จาก Git" badge show which
-- project the session was, now that GITHUB_REPOS can scan several.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE time_logs ADD COLUMN IF NOT EXISTS git_repos TEXT;
