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
  created_at: string
}

export type TimeLog = {
  id: string
  student_id: string
  check_in: string
  check_out: string | null
  work_summary: string | null
  photo_url: string | null
  created_at: string
  status: 'pending' | 'approved'
  approved_by: string | null
  approved_at: string | null
  paid: boolean
  paid_at: string | null
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

export const supabase = createClient(url, anonKey)

export function supabaseAdmin() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
