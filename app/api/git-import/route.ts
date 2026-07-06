import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getAuth, unauthorized } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

const GITHUB_REPO = process.env.GITHUB_REPO || 'Phawatcharakorn/cops-timelog'
const HOUR_MS = 60 * 60 * 1000

type GhCommit = { sha: string; commit: { author: { date: string }; message: string } }

const HALF_HOUR_MS = 30 * 60 * 1000
// Reports only ever show :00/:30 minute marks — round the session's start
// down and end up to the nearest half hour so times never land on odd
// minutes like 14:07 or 15:42.
function floorToHalfHour(ms: number): number { return Math.floor(ms / HALF_HOUR_MS) * HALF_HOUR_MS }
function ceilToHalfHour(ms: number): number { return Math.ceil(ms / HALF_HOUR_MS) * HALF_HOUR_MS }

async function fetchCommitsSince(author: string, sinceISO: string | null): Promise<GhCommit[]> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`

  const params = new URLSearchParams({ author, per_page: '100' })
  if (sinceISO) params.set('since', sinceISO)
  const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits?${params}`, { headers })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`)
  const commits = (await res.json()) as GhCommit[]
  // GitHub returns newest-first; process oldest-first so sessions group correctly.
  return commits.reverse()
}

// Each commit nominally covers 1h of work. Fold a chronological commit list
// into sessions by extending the previous commit's 1h window to cover the
// next commit if it falls inside that window, instead of stacking separate
// +1h blocks — otherwise 3 commits 10 minutes apart would wrongly total 3h.
function groupIntoSessions(commits: GhCommit[]) {
  const sessions: { checkIn: string; checkOut: string; lastSha: string; messages: string[] }[] = []
  for (const c of commits) {
    const t = new Date(c.commit.author.date).getTime()
    const last = sessions[sessions.length - 1]
    if (last && t <= new Date(last.checkOut).getTime()) {
      last.checkOut = new Date(t + HOUR_MS).toISOString()
      last.lastSha = c.sha
      last.messages.push(c.commit.message.split('\n')[0])
    } else {
      sessions.push({
        checkIn: new Date(t).toISOString(),
        checkOut: new Date(t + HOUR_MS).toISOString(),
        lastSha: c.sha,
        messages: [c.commit.message.split('\n')[0]],
      })
    }
  }
  return sessions
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

      // check_out is always (last folded commit's time + 1h) — subtract that
      // back out, then nudge forward 1s so "since" excludes that commit.
      const since = lastLog?.check_out
        ? new Date(new Date(lastLog.check_out).getTime() - HOUR_MS + 1000).toISOString()
        : null
      const commits = await fetchCommitsSince(student.github_username!, since)
      const sessions = groupIntoSessions(commits)
      if (sessions.length === 0) continue

      const rows = sessions.map(s => ({
        student_id: student.student_id,
        check_in: new Date(floorToHalfHour(new Date(s.checkIn).getTime())).toISOString(),
        check_out: new Date(ceilToHalfHour(new Date(s.checkOut).getTime())).toISOString(),
        work_summary: s.messages.join(' / '),
        status: 'pending' as const,
        is_git_derived: true,
        git_commit_sha: s.lastSha,
      }))
      const { error: insertError } = await db.from('time_logs').insert(rows)
      if (insertError) { errors.push(`${student.student_id}: ${insertError.message}`); continue }
      imported += rows.length
    } catch (e) {
      errors.push(`${student.student_id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ imported, errors })
}
