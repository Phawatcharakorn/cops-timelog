import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const dept = searchParams.get('dept') || ''
  const gen  = searchParams.get('gen')  || ''

  const db = supabaseAdmin()
  let q = db.from('students').select('*').order('gen', { ascending: true, nullsFirst: false }).order('name')
  if (dept) q = q.eq('department', dept)
  if (gen)  q = q.eq('gen', Number(gen))

  const { data: students } = await q
  if (!students) return NextResponse.json({ error: 'No data' }, { status: 500 })

  const rows = students.map(s => ({
    'รุ่น':                     s.gen ?? '-',
    'ชื่อ-นามสกุล':             s.name,
    'รหัสนิสิต':                s.student_id,
    'ฝ่าย':                     s.department,
    'คณะ':                      s.faculty ?? '',
    'สาขาวิชา':                 s.major ?? '',
    'เพศ':                      s.gender ?? '',
    'วันเกิด':                  s.birthdate ?? '',
    'ศาสนา':                    s.religion ?? '',
    'สัญชาติ':                  s.nationality ?? '',
    'เบอร์โทร':                 s.phone ?? '',
    'E-mail':                   s.email ?? '',
    'เลขบัตรประจำตัวประชาชน':   s.national_id ?? '',
  }))

  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = [
    { wch: 6  }, // รุ่น
    { wch: 22 }, // ชื่อ
    { wch: 14 }, // รหัสนิสิต
    { wch: 14 }, // ฝ่าย
    { wch: 22 }, // คณะ
    { wch: 22 }, // สาขา
    { wch: 8  }, // เพศ
    { wch: 14 }, // วันเกิด
    { wch: 12 }, // ศาสนา
    { wch: 12 }, // สัญชาติ
    { wch: 14 }, // เบอร์
    { wch: 28 }, // email
    { wch: 20 }, // เลขบัตร
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'ทำเนียบสมาชิก')
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  const label = [dept && `dept-${dept}`, gen && `gen${gen}`].filter(Boolean).join('_') || 'all'
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="members_${label}.xlsx"`,
    },
  })
}
