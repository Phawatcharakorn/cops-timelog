import { createClient } from '@supabase/supabase-js'

export type Student = {
  id: string
  student_id: string
  name: string
  department: string
  faculty: string | null
  major: string | null
  pin: string | null
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
}

const url  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(url, anonKey)

export function supabaseAdmin() {
  return createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
