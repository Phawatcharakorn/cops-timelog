import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import * as XLSX from 'xlsx'
import { checkAuth, getAuth, unauthorized } from '@/lib/apiAuth'
import { SA_DEPARTMENT } from '@/lib/studentGroup'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return unauthorized()

  const { searchParams } = new URL(req.url)
  const auth = getAuth(req)
  // A department-locked manager only ever sees their own department's data.
  const dept      = auth?.role === 'manager' && auth.department ? auth.department : (searchParams.get('dept') || '')
  const gen       = searchParams.get('gen')       || ''
  const group     = searchParams.get('group')     || ''
  const studentId = searchParams.get('studentId') || ''

  const db = supabaseAdmin()
  let q = db.from('students').select('*').order('gen', { ascending: true, nullsFirst: false }).order('name')
  if (studentId) q = q.eq('student_id', studentId)
  else {
    if (dept) q = q.eq('department', dept)
    if (gen)  q = q.eq('gen', Number(gen))
    if (group === 'sa') q = q.eq('department', SA_DEPARTMENT)
    else if (group === 'cops') q = q.neq('department', SA_DEPARTMENT)
  }

  const { data: students } = await q
  if (!students) return NextResponse.json({ error: 'No data' }, { status: 500 })

  const rows = students.map(s => ({
    'รุ่น':                     s.gen ?? '-',
    'ชื่อ-นามสกุล':             s.name,
    'ชื่อเล่น':                 s.nickname ?? '',
    'รหัสนิสิต':                s.student_id,
    'ฝ่าย':                     s.department,
    'ตำแหน่ง':                  s.position ?? '',
    'คณะ':                      s.faculty ?? '',
    'สาขาวิชา':                 s.major ?? '',
    'เพศ':                      s.gender ?? '',
    'วันเกิด':                  s.birthdate ?? '',
    'ศาสนา':                    s.religion ?? '',
    'สัญชาติ':                  s.nationality ?? '',
    'เบอร์โทร':                 s.phone ?? '',
    'E-mail':                   s.email ?? '',
    'เลขบัตรประจำตัวประชาชน':   s.national_id ?? '',
    'หมายเหตุ':                 s.note ?? '',
    'สถานะ':                    s.status ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 6  }, // รุ่น
    { wch: 22 }, // ชื่อ
    { wch: 14 }, // ชื่อเล่น
    { wch: 14 }, // รหัสนิสิต
    { wch: 14 }, // ฝ่าย
    { wch: 16 }, // ตำแหน่ง
    { wch: 22 }, // คณะ
    { wch: 22 }, // สาขา
    { wch: 8  }, // เพศ
    { wch: 14 }, // วันเกิด
    { wch: 12 }, // ศาสนา
    { wch: 12 }, // สัญชาติ
    { wch: 14 }, // เบอร์
    { wch: 28 }, // email
    { wch: 20 }, // เลขบัตร
    { wch: 24 }, // หมายเหตุ
    { wch: 14 }, // สถานะ
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ทำเนียบสมาชิก')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  const label = [dept && `dept-${dept}`, gen && `gen${gen}`, group && `group-${group}`].filter(Boolean).join('_') || 'all'
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="members_${label}.xlsx"`,
    },
  })
}
