import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuth, unauthorized } from '@/lib/apiAuth'
import { thaiDayIndex, thaiDayStartMs, thaiMinuteOfDay, workWindowError, WORK_START_MIN } from '@/lib/attendance'

export const dynamic = 'force-dynamic'

// One person's work can span several of their own repos (not just this
// timelog app's own repo) — GITHUB_REPOS is a comma-separated list, all
// scanned for every student's github_username. Falls back to the old
// singular GITHUB_REPO for anyone who already has that env var set.
const GITHUB_REPOS = (process.env.GITHUB_REPOS || process.env.GITHUB_REPO || 'Phawatcharakorn/cops-timelog')
  .split(',').map(r => r.trim()).filter(Boolean)
const HOUR_MS = 60 * 60 * 1000

type GhCommit = { sha: string; repo: string; commit: { author: { date: string }; message: string } }

const HALF_HOUR_MS = 30 * 60 * 1000
// Reports only ever show :00/:30 minute marks — round the session's start
// down and end up to the nearest half hour so times never land on odd
// minutes like 14:07 or 15:42.
function floorToHalfHour(ms: number): number { return Math.floor(ms / HALF_HOUR_MS) * HALF_HOUR_MS }
function ceilToHalfHour(ms: number): number { return Math.ceil(ms / HALF_HOUR_MS) * HALF_HOUR_MS }

async function fetchCommitsSinceInRepo(repo: string, author: string, sinceISO: string | null): Promise<GhCommit[]> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  const params = new URLSearchParams({ author, per_page: '100' })
  if (sinceISO) params.set('since', sinceISO)
  const res = await fetch(`https://api.github.com/repos/${repo}/commits?${params}`, { headers })
  if (!res.ok) throw new Error(`GitHub API ${repo} ${res.status}: ${await res.text()}`)
  const commits = (await res.json()) as Omit<GhCommit, 'repo'>[]
  return commits.map(c => ({ ...c, repo }))
}

// Merges commits from every configured repo into one oldest-first list —
// groupIntoSessions needs a single chronological stream across all of a
// person's repos so sessions group correctly regardless of which repo
// each commit landed in.
async function fetchCommitsSince(author: string, sinceISO: string | null): Promise<GhCommit[]> {
  const perRepo = await Promise.all(GITHUB_REPOS.map(repo => fetchCommitsSinceInRepo(repo, author, sinceISO)))
  return perRepo.flat().sort((a, b) => a.commit.author.date.localeCompare(b.commit.author.date))
}

// Assumed work time before a session's first commit (we don't know when
// they actually sat down, so guess a modest head start instead of a full hour).
const PREP_MS = 30 * 60 * 1000
// Commits more than this far apart start a new session (long gap = took a break).
const SESSION_GAP_MS = 2 * HOUR_MS

// Fold a chronological commit list into work sessions: within a session, the
// end time tracks the real gap between commits (not a flat +1h per commit),
// so 3 commits 10 minutes apart total ~10 minutes of measured time, not 3h.
// Only the session's start is a guess (PREP_MS before the first commit).
function groupIntoSessions(commits: GhCommit[]) {
  const sessions: { checkIn: string; checkOut: string; lastCommitMs: number; lastSha: string; messages: string[]; repos: Set<string> }[] = []
  for (const c of commits) {
    const t = new Date(c.commit.author.date).getTime()
    const last = sessions[sessions.length - 1]
    if (last && t - last.lastCommitMs <= SESSION_GAP_MS) {
      last.checkOut = new Date(t).toISOString()
      last.lastCommitMs = t
      last.lastSha = c.sha
      last.messages.push(c.commit.message.split('\n')[0])
      last.repos.add(c.repo)
    } else {
      sessions.push({
        checkIn: new Date(t - PREP_MS).toISOString(),
        checkOut: new Date(t).toISOString(),
        lastCommitMs: t,
        lastSha: c.sha,
        messages: [c.commit.message.split('\n')[0]],
        repos: new Set([c.repo]),
      })
    }
  }
  return sessions
}

// นิสิตทำงานได้เฉพาะ 08:30-24:00 — commit ตอนดึกจึงต้อง "ยก" ทั้ง session ไป
// เริ่มเช้าถัดไปแทน โดยคงระยะเวลาทำงานเดิม (ดู lib/attendance.ts)
//   - ถ้า check_in ก่อน 08:30 (เช่นตี 1) นับว่ายังเป็นงานดึกของ "วันเดียวกัน"
//     ตามปฏิทิน จึงยกไปแค่ 08:30 ของวันนั้นเอง ไม่ใช่วันถัดไป
//   - ถ้า check_in ผ่าน 08:30 แล้วแต่ check_out ล้นเที่ยงคืน (เช่น ทำถึงตี 2)
//     ต้องยกทั้ง session ไปเริ่มเช้าของวันถัดไป
function targetDayForShift(checkInISO: string): number {
  const inDay = thaiDayIndex(checkInISO)
  return thaiMinuteOfDay(checkInISO) < WORK_START_MIN ? inDay : inDay + 1
}

// เวลาเริ่ม 08:30 ของ dayIndex + ระยะเวลาเดิม แต่ไม่ล้นเกิน 24:00 ของวันนั้น
// (session ที่ยาวเกิน 15.5 ชม. ซึ่งแทบเป็นไปไม่ได้จาก commit gap 2 ชม. จะถูกตัดพอดีเที่ยงคืน)
function buildCandidate(dayIndex: number, durationMs: number): { checkInMs: number; checkOutMs: number } {
  const dayStart  = thaiDayStartMs(dayIndex)
  const checkInMs = dayStart + WORK_START_MIN * 60_000
  const dayEndMs  = dayStart + 24 * 60 * 60_000
  const checkOutMs = Math.min(checkInMs + durationMs, dayEndMs)
  return { checkInMs, checkOutMs }
}

function msOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

// จัดสรร session ทีละอันให้ตกอยู่ในช่วง 08:30-24:00 และไม่ทับกับ log ที่มีอยู่
// (ทั้งของเดิมใน DB และ session อื่นที่เพิ่งจัดไปแล้วใน batch นี้) — ถ้าทับ ก็
// เลื่อนไปเริ่มเช้าวันถัดไปเรื่อยๆ จนกว่าจะว่าง (จำกัดไว้กันวนไม่รู้จบ)
function placeSession(
  session: { checkIn: string; checkOut: string },
  reserved: { start: number; end: number }[],
): { checkInMs: number; checkOutMs: number } {
  const rawCheckInMs  = new Date(session.checkIn).getTime()
  const rawCheckOutMs = new Date(session.checkOut).getTime()
  const durationMs = rawCheckOutMs - rawCheckInMs
  const withinWindow = workWindowError(session.checkIn, session.checkOut) === null

  // Reports only ever show :00/:30 marks — round after placing, not before,
  // so the overlap check below always compares the times that actually get stored.
  const round = (c: { checkInMs: number; checkOutMs: number }) => ({
    checkInMs: floorToHalfHour(c.checkInMs),
    checkOutMs: ceilToHalfHour(c.checkOutMs),
  })

  let dayIndex = withinWindow ? thaiDayIndex(session.checkIn) : targetDayForShift(session.checkIn)
  let candidate = round(withinWindow
    ? { checkInMs: rawCheckInMs, checkOutMs: rawCheckOutMs }
    : buildCandidate(dayIndex, durationMs))

  const MAX_ATTEMPTS = 60 // ~2 เดือนเป็นเพดานกันวนไม่รู้จบ ในทางปฏิบัติไม่มีทางถึง
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const hasClash = reserved.some(r => msOverlap(candidate.checkInMs, candidate.checkOutMs, r.start, r.end))
    if (!hasClash) return candidate
    dayIndex += 1
    candidate = round(buildCandidate(dayIndex, durationMs))
  }
  return candidate // เต็มทุกวันจริงๆ (แทบเป็นไปไม่ได้) — ใส่ไปตามที่จัดได้ล่าสุด
}

// Dev-only: pull new commits (per student, matched by github_username) since
// the last git-derived import, fold them into 1h-per-commit work sessions,
// and insert them as pending time_logs for a manager/dev to review like any
// other log — see is_git_derived in schema.sql.
export async function POST(req: NextRequest) {
  const auth = getAuth(req)
  if (!auth || auth.role !== 'dev') return unauthorized()

  const db = supabaseAdmin()
  const { data: students, error: studentsError } = await db
    .from('students').select('student_id, github_username').not('github_username', 'is', null)
  if (studentsError) return NextResponse.json({ error: studentsError.message }, { status: 500 })

  let imported = 0
  const errors: string[] = []

  for (const student of students ?? []) {
    try {
      const { data: lastLog } = await db
        .from('time_logs').select('check_out')
        .eq('student_id', student.student_id).eq('is_git_derived', true)
        .order('check_out', { ascending: false }).limit(1).maybeSingle()

      // Stored check_out is always >= the last imported commit's real time
      // (it's that commit's time, ceil-rounded up) — nudge 1s past it so
      // "since" excludes that commit without risking skipping the next one.
      const since = lastLog?.check_out
        ? new Date(new Date(lastLog.check_out).getTime() + 1000).toISOString()
        : null
      const commits = await fetchCommitsSince(student.github_username!, since)
      const sessions = groupIntoSessions(commits)
      if (sessions.length === 0) continue

      // Existing logs this student already has (any source) — sessions that
      // get shifted into 08:30-24:00 must not land on top of these.
      const { data: existingLogs } = await db
        .from('time_logs').select('check_in, check_out')
        .eq('student_id', student.student_id).limit(50_000)
      const reserved = (existingLogs ?? []).map(l => ({
        start: new Date(l.check_in).getTime(),
        end: l.check_out ? new Date(l.check_out).getTime() : new Date(l.check_in).getTime() + 24 * 60 * 60_000,
      }))

      const rows = sessions.map(s => {
        const placed = placeSession({ checkIn: s.checkIn, checkOut: s.checkOut }, reserved)
        reserved.push({ start: placed.checkInMs, end: placed.checkOutMs }) // ไม่ให้ session ถัดไปใน batch เดียวกันทับตัวนี้
        return {
          student_id: student.student_id,
          check_in: new Date(placed.checkInMs).toISOString(),
          check_out: new Date(placed.checkOutMs).toISOString(),
          work_summary: s.messages.join(' / '),
          status: 'pending' as const,
          is_git_derived: true,
          git_commit_sha: s.lastSha,
          git_repos: Array.from(s.repos).join(','),
        }
      })
      const { error: insertError } = await db.from('time_logs').insert(rows)
      if (insertError) { errors.push(`${student.student_id}: ${insertError.message}`); continue }
      imported += rows.length
    } catch (e) {
      errors.push(`${student.student_id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ imported, errors })
}
