import { createClient } from '@supabase/supabase-js'

export type Student = {
  id: string
  student_id: string
  name: string
  department: string
  faculty: string | null
  major: string | null
  pin: string | null
  gen: number | null
  phone: string | null
  email: string | null
  religion: string | null
  nationality: string | null
  birthdate: string | null
  gender: string | null
  national_id: string | null
  nickname: string | null
  note: string | null
  status: string | null
  bank_account_number: string | null
  bank_account_name: string | null
  bank_book_url: string | null
  created_at: string
}

export type TimeLog = {
  id: string
  student_id: string
  check_in: string
  check_out: string | null
  work_summary: string | null
  project_name: string | null
  photo_url: string | null
  created_at: string
  status: 'pending' | 'approved'
  approved_by: string | null
  approved_at: string | null
  paid: boolean
  paid_at: string | null
  is_self_reported: boolean
  is_rejected: boolean
  rejected_reason: string | null
  rejected_at: string | null
  is_auto_closed: boolean
}

export type Manager = {
  id: string
  username: string
  name: string
  role: string | null
  department: string | null
  created_at: string
}

export type FeedbackCampaign = {
  id: string
  title: string
  message: string
  active: boolean
  duration_days: number | null
  end_date: string | null
  created_at: string
  ended_at: string | null
}

export type Announcement = {
  id: string
  title: string
  body: string
  author: string
  active: boolean
  created_at: string
  expires_at: string | null
}

export type FeedbackResponse = {
  id: string
  campaign_id: string
  respondent_type: 'student' | 'manager'
  respondent_id: string
  respondent_name: string | null
  rating: number
  comment: string | null
  submitted_at: string
}

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Same studentId/month query builds the same REST URL every time — without
// forcing no-store, the browser's HTTP cache can silently serve a stale
// response from an earlier visit instead of hitting PostgREST again, which
// showed up as print-worklog/payroll (server-side, force-dynamic) staying
// fresh while this client's own reads (StudentClient history, print-worklog)
// lagged behind by however long the browser felt like caching that GET.
export const supabase = createClient(url, anonKey, {
  global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
})

export function supabaseAdmin() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
