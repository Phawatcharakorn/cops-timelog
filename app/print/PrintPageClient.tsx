'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, type Student, type TimeLog } from '@/lib/supabase'
import { format, differenceInMinutes } from 'date-fns'
import { th } from 'date-fns/locale'

type ProcessedLog = TimeLog & {
  durationMinutes: number
  dateStr: string
  checkInStr: string
  checkOutStr: string
  durationStr: string
}

type ReportData = {
  student: Student
  logs: ProcessedLog[]
  monthLabel: string
  totalDays: number
  totalHours: number
  totalMinutes: number
  taskCount: number
}

function toThai(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
}

export default function PrintPageClient() {
  const searchParams = useSearchParams()
  const studentId = searchParams.get('studentId')
  const month     = searchParams.get('month')
  const projectParam = searchParams.get('project') ?? ''

  const [data,  setData]  = useState<ReportData | null>(null)
  const [error, setError] = useState('')
  const [projectTitle, setProjectTitle] = useState(projectParam)

  useEffect(() => {
    if (!studentId || !month) { setError('Missing params'); return }

    const [y, m] = month.split('-').map(Number)
    const TZ    = 7 * 60 * 60 * 1000
    const start = new Date(Date.UTC(y, m - 1, 1) - TZ).toISOString()
    const end   = new Date(Date.UTC(y, m, 1) - TZ - 1).toISOString()

    Promise.all([
      supabase.from('students').select('*').eq('student_id', studentId).single(),
      supabase.from('time_logs').select('*')
        .eq('student_id', studentId)
        .gte('check_in', start).lte('check_in', end)
        .order('check_in', { ascending: true }),
    ]).then(([{ data: student, error: sErr }, { data: logs, error: lErr }]) => {
      if (sErr || !student) { setError('ไม่พบข้อมูลนิสิต'); return }
      if (lErr)              { setError('โหลดข้อมูลไม่สำเร็จ'); return }

      const processed: ProcessedLog[] = (logs ?? []).map(log => {
        const dur = log.check_out
          ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in))
          : 0
        return {
          ...log,
          durationMinutes: dur,
          dateStr:     format(toThai(log.check_in), 'd MMM yy', { locale: th }),
          checkInStr:  format(toThai(log.check_in), 'HH:mm'),
          checkOutStr: log.check_out ? format(toThai(log.check_out), 'HH:mm') : '-',
          durationStr: dur > 0 ? `${Math.floor(dur / 60)}h ${dur % 60}m` : '-',
        }
      })

      const totalMin  = processed.reduce((s, l) => s + l.durationMinutes, 0)
      const totalDays = new Set(processed.map(l => toThai(l.check_in).toISOString().slice(0, 10))).size

      setData({
        student,
        logs: processed,
        monthLabel:    format(new Date(y, m - 1, 1), 'MMMM yyyy', { locale: th }),
        totalDays,
        totalHours:   Math.floor(totalMin / 60),
        totalMinutes: totalMin % 60,
        taskCount:    processed.filter(l => l.work_summary).length,
      })

      if (!projectParam) {
        setProjectTitle(`CoPs ${student.department}`)
      }
    })
  }, [studentId, month, projectParam])

  if (error) return (
    <div className="p-8 text-center text-red-500 text-sm">{error}</div>
  )
  if (!data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">กำลังโหลดข้อมูล...</p>
    </div>
  )

  const { student, logs, monthLabel, totalDays, totalHours, totalMinutes } = data
  const totalMin = totalHours * 60 + totalMinutes

  return (
    <>
      <style>{`
        @font-face { font-family:'Sarabun'; src:url('/fonts/Sarabun-Regular.ttf') format('truetype'); font-weight:400; }
        @font-face { font-family:'Sarabun'; src:url('/fonts/Sarabun-Medium.ttf')  format('truetype'); font-weight:500; }
        @font-face { font-family:'Sarabun'; src:url('/fonts/Sarabun-Bold.ttf')    format('truetype'); font-weight:700; }
        * { font-family: 'Sarabun', sans-serif; box-sizing: border-box; }
        body { margin: 0; background: #f3f4f6; }
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { margin: 0; size: A4 portrait; }
          .page-body {
            padding: 1.5cm 1.5cm 1.5cm 1.5cm !important;
            max-width: none !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
        }
        table { border-collapse: collapse; width: 100%; }
        th, td { padding: 7px 10px; font-size: 12px; line-height: 1.6; }
        .data-table th { background: #1a3a5c; color: white; font-weight: 600; text-align: left; }
        .data-table td { border-bottom: 1px solid #e5e7eb; color: #374151; }
        .data-table tr:nth-child(even) td { background: #f8fafc; }
      `}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 bg-gray-800 text-white px-6 py-3 flex items-center gap-4">
        <span className="text-sm font-medium flex-shrink-0">{student.name} — {monthLabel}</span>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs text-gray-400 flex-shrink-0">ชื่อโครงการ:</span>
          <input
            className="flex-1 bg-gray-700 text-white text-sm px-3 py-1 rounded border border-gray-600 focus:outline-none focus:border-indigo-400 min-w-0"
            value={projectTitle}
            onChange={e => setProjectTitle(e.target.value)}
            placeholder="เช่น CoPs Marketing"
          />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => window.print()}
            className="bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            พิมพ์ / บันทึก PDF
          </button>
          <button
            onClick={() => window.close()}
            className="bg-gray-600 hover:bg-gray-500 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >ปิด</button>
        </div>
      </div>

      {/* A4 body */}
      <div className="page-body max-w-3xl mx-auto my-6 bg-white shadow-lg p-10" style={{ minHeight: '29.7cm' }}>

        {/* ── Letterhead ── */}
        <div style={{ position: 'relative', textAlign: 'center', borderBottom: '2px solid #1a3a5c', paddingBottom: 14, marginBottom: 20 }}>
          {/* วันที่พิมพ์ — ขวาบน หน้าแรกเท่านั้น */}
          <p style={{ position: 'absolute', top: 0, right: 0, fontSize: 10, color: '#9ca3af', margin: 0 }}>
            {format(new Date(), 'd MMM yyyy, HH:mm', { locale: th })}
          </p>
          <img src="/kus-logo.svg" alt="KUS Logo" style={{ width: 80, height: 80, margin: '0 auto 8px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1a3a5c', margin: 0, lineHeight: 1.5 }}>
            มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตศรีราชา
          </p>
          <p style={{ fontSize: 13, color: '#374151', margin: 0, lineHeight: 1.5 }}>
            Kasetsart University Sriracha Campus
          </p>
          <p style={{ fontSize: 12, color: '#6b7280', margin: 0, marginTop: 2, lineHeight: 1.5 }}>
            {projectTitle}
          </p>
        </div>

        {/* ── Document title ── */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1a3a5c', margin: 0, lineHeight: 1.6 }}>
            รายงานการลงเวลาปฏิบัติงาน
          </p>
          <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.6 }}>
            ประจำเดือน {monthLabel}
          </p>
        </div>

        {/* ── Student info box ── */}
        <div style={{ border: '1px solid #1a3a5c', borderRadius: 6, marginBottom: 18, overflow: 'hidden' }}>
          <div style={{ background: '#1a3a5c', padding: '6px 14px' }}>
            <p style={{ color: 'white', fontSize: 12, fontWeight: 600, margin: 0 }}>ข้อมูลนิสิต</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {[
              ['ชื่อ-นามสกุล', student.name],
              ['รหัสนิสิต', student.student_id],
              ['คณะ', student.faculty ?? '-'],
              ['สาขาวิชา', student.major ?? '-'],
              ['ฝ่าย / กลุ่มงาน', student.department],
              ['ช่วงเวลา', monthLabel],
            ].map(([label, value], i) => (
              <div key={label} style={{
                padding: '7px 14px',
                borderBottom: i < 4 ? '1px solid #e5e7eb' : undefined,
                borderRight: i % 2 === 0 ? '1px solid #e5e7eb' : undefined,
              }}>
                <p style={{ fontSize: 10, color: '#6b7280', margin: 0, lineHeight: 1.4 }}>{label}</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', margin: 0, lineHeight: 1.5 }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Summary boxes ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'จำนวนวันที่ปฏิบัติงาน', value: `${totalDays} วัน`, color: '#1d4ed8' },
            { label: 'ชั่วโมงรวมทั้งหมด',     value: `${totalHours} ชม. ${totalMinutes} นาที`, color: '#15803d' },
            { label: 'เฉลี่ยต่อวัน',           value: totalDays > 0 ? `${Math.floor(totalMin / totalDays / 60)} ชม. ${totalMin / totalDays % 60 | 0} นาที` : '-', color: '#7e22ce' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ border: `1px solid ${color}22`, borderRadius: 6, padding: '10px 14px', background: `${color}08`, textAlign: 'center' }}>
              <p style={{ fontSize: 18, fontWeight: 700, color, margin: 0 }}>{value}</p>
              <p style={{ fontSize: 10, color: '#6b7280', margin: 0, marginTop: 2 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* ── Time log table ── */}
        <p style={{ fontSize: 13, fontWeight: 700, color: '#1a3a5c', marginBottom: 6, marginTop: 0 }}>รายละเอียดการลงเวลาปฏิบัติงาน</p>
        <table className="data-table" style={{ border: '1px solid #d1d5db', borderRadius: 6, overflow: 'hidden', marginBottom: 32 }}>
          <thead>
            <tr>
              <th style={{ width: 40, textAlign: 'center' }}>ลำดับ</th>
              <th>วันที่</th>
              <th>เวลาเข้า</th>
              <th>เวลาออก</th>
              <th>ชั่วโมง</th>
              <th>สรุปงานที่ปฏิบัติ</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={log.id}>
                <td style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>{i + 1}</td>
                <td>{log.dateStr}</td>
                <td style={{ color: '#15803d', fontWeight: 500 }}>{log.checkInStr}</td>
                <td style={{ color: '#dc2626', fontWeight: 500 }}>{log.checkOutStr}</td>
                <td>{log.durationStr}</td>
                <td style={{ color: '#4b5563' }}>{log.work_summary || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* รวมเวลา — ชิดขวา นอกตาราง */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28, marginTop: 6 }}>
          <div style={{ background: '#f0f4ff', border: '1px solid #c7d2fe', borderRadius: 6, padding: '8px 20px', textAlign: 'right' }}>
            <span style={{ fontSize: 12, color: '#374151' }}>รวมทั้งหมด</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#15803d', marginLeft: 12 }}>
              {totalHours} ชั่วโมง {totalMinutes} นาที
            </span>
            <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 8 }}>
              ({totalDays} วัน)
            </span>
          </div>
        </div>

        {/* ── Signatures ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          {[
            { label: 'ลายมือชื่อนิสิต',             sub: `(${student.name})` },
            { label: 'ลงชื่อพี่เลี้ยงหรือคนดูแล', sub: '(.................................)' },
            { label: 'ลายมือชื่อผู้อนุมัติ',         sub: '(.................................)' },
          ].map(({ label, sub }) => (
            <div key={label} style={{ textAlign: 'center', width: 185 }}>
              <div style={{ borderTop: '1px solid #374151', marginTop: 52, marginBottom: 5 }} />
              <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.6 }}>{label}</p>
              <p style={{ fontSize: 11, color: '#6b7280', margin: 0, marginTop: 2, lineHeight: 1.6 }}>{sub}</p>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 24, paddingTop: 10, textAlign: 'center' }}>
          <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>
            สร้างโดยระบบลงเวลา {projectTitle} — {format(new Date(), 'd MMM yyyy HH:mm', { locale: th })}
          </p>
        </div>
      </div>
    </>
  )
}
