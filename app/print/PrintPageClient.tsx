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
  const studentId    = searchParams.get('studentId')
  const month        = searchParams.get('month')
  const date         = searchParams.get('date')
  const from         = searchParams.get('from')   // yyyy-MM-dd (date range)
  const to           = searchParams.get('to')
  const projectParam = searchParams.get('project') ?? ''

  const [data,  setData]  = useState<ReportData | null>(null)
  const [error, setError] = useState('')
  const [projectTitle, setProjectTitle] = useState(projectParam)

  useEffect(() => {
    if (!studentId || (!month && !date && !from)) { setError('Missing params'); return }

    const TZ = 7 * 60 * 60 * 1000
    let start: string, end: string, periodLabel: string

    if (from && to) {
      start = new Date(from + 'T00:00:00+07:00').toISOString()
      end   = new Date(to   + 'T23:59:59+07:00').toISOString()
      periodLabel = from === to
        ? format(new Date(from + 'T12:00:00'), 'd MMMM yyyy', { locale: th })
        : `${format(new Date(from + 'T12:00:00'), 'd MMM yyyy', { locale: th })} – ${format(new Date(to + 'T12:00:00'), 'd MMM yyyy', { locale: th })}`
    } else if (date) {
      const d = new Date(date + 'T00:00:00+07:00')
      start = new Date(d.getTime() - TZ).toISOString()
      end   = new Date(d.getTime() - TZ + 86400000 - 1).toISOString()
      periodLabel = format(d, 'd MMMM yyyy', { locale: th })
    } else {
      const [y, m] = month!.split('-').map(Number)
      start = new Date(Date.UTC(y, m - 1, 1) - TZ).toISOString()
      end   = new Date(Date.UTC(y, m, 1) - TZ - 1).toISOString()
      periodLabel = format(new Date(y, m - 1, 1), 'MMMM yyyy', { locale: th })
    }

    Promise.all([
      supabase.from('students').select('*').eq('student_id', studentId).single(),
      supabase.from('time_logs').select('*')
        .eq('student_id', studentId)
        .gte('check_in', start).lte('check_in', end)
        .order('check_in', { ascending: true }),
    ]).then(([{ data: student, error: sErr }, { data: logs, error: lErr }]) => {
      if (sErr || !student) { setError('ไม่พบข้อมูลนิสิต'); return }
      if (lErr)              { setError('โหลดข้อมูลไม่สำเร็จ'); return }

      const approvedLogs = (logs ?? []).filter(l => l.status === 'approved')
      const processed: ProcessedLog[] = approvedLogs.map(log => {
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
        monthLabel: periodLabel,
        totalDays,
        totalHours:   Math.floor(totalMin / 60),
        totalMinutes: totalMin % 60,
        taskCount:    processed.filter(l => l.work_summary).length,
      })

      if (!projectParam) setProjectTitle('')
    })
  }, [studentId, month, date, from, to, projectParam])

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
          @page { margin: 1.5cm; size: A4 portrait; }
          .page-body {
            padding: 0 !important;
            max-width: none !important;
            box-shadow: none !important;
            margin: 0 !important;
          }
        }
        table { border-collapse: collapse; width: 100%; }
        th, td { padding: 5px 9px; font-size: 11px; line-height: 1.45; }
        .data-table { border-top: 3px solid #1a3a5c; }
        .data-table th { background: #1a3a5c; color: white; font-weight: 600; text-align: center; border: 1px solid #0f2744; }
        .data-table td { border: 1px solid #d1d5db; color: #374151; text-align: center; }
        .data-table tr:nth-child(even) td { background: #e8edf5; }
        .data-table tr { break-inside: avoid; page-break-inside: avoid; }
        .keep-with-next { break-after: avoid; page-break-after: avoid; }
        .kus-logo { display: block !important; width: 80px !important; height: 80px !important; margin: 0 auto 8px !important; object-fit: contain !important; }
      `}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 bg-gray-800 text-white px-6 py-3 flex items-center gap-4">
        <span className="text-sm font-medium flex-shrink-0">{student.name} — {date ? 'วันที่ ' : ''}{monthLabel}</span>
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs text-gray-400 flex-shrink-0">ชื่อโครงการ:</span>
          <input
            className="flex-1 bg-gray-700 text-white text-sm px-3 py-1 rounded border border-gray-600 focus:outline-none focus:border-indigo-400 min-w-0"
            value={projectTitle}
            onChange={e => setProjectTitle(e.target.value)}
            placeholder="กรอกชื่อโครงการ"
          />
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => {
              const prev = document.title
              document.title = `timelog-${student.name}-${monthLabel}`
              window.print()
              document.title = prev
            }}
            className="bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            ดาวน์โหลด PDF
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
        <div style={{ borderBottom: '2px solid #1a3a5c', paddingBottom: 10, marginBottom: 14 }}>
          {/* วันที่พิมพ์ — ขวาบน */}
          <p style={{ textAlign: 'right', fontSize: 10, color: '#9ca3af', margin: 0, lineHeight: 1.5 }}>
            {format(new Date(), 'd MMM yyyy, HH:mm', { locale: th })}
          </p>
          {/* โลโก้และชื่อมหาวิทยาลัย — กึ่งกลาง */}
          <div style={{ textAlign: 'center' }}>
            <img
              src="/kus-logo.svg"
              alt="KUS Logo"
              style={{ display: 'inline-block', width: 80, height: 80, objectFit: 'contain', verticalAlign: 'top', marginBottom: 8 }}
            />
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
        </div>

        {/* ── Document title ── */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1a3a5c', margin: 0, lineHeight: 1.6 }}>
            รายงานการลงเวลาปฏิบัติงาน
          </p>
          <p style={{ fontSize: 14, color: '#374151', margin: 0, lineHeight: 1.6 }}>
            {(date || (from && from !== to)) ? 'ช่วงวันที่' : 'ประจำเดือน'} {monthLabel}
          </p>
        </div>

        {/* ── Student info box ── */}
        <div style={{ border: '1px solid #1a3a5c', borderRadius: 6, marginBottom: 12, overflow: 'hidden' }}>
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
                padding: '5px 12px',
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
          {[
            { label: 'จำนวนวันที่ปฏิบัติงาน', value: `${totalDays} วัน`, color: '#1d4ed8' },
            { label: 'ชั่วโมงรวมทั้งหมด',     value: `${totalHours} ชม. ${totalMinutes} นาที`, color: '#15803d' },
            { label: 'เฉลี่ยต่อวัน',           value: totalDays > 0 ? `${Math.floor(totalMin / totalDays / 60)} ชม. ${totalMin / totalDays % 60 | 0} นาที` : '-', color: '#7e22ce' },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ border: `1px solid ${color}22`, borderRadius: 6, padding: '7px 10px', background: `${color}08`, textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color, margin: 0 }}>{value}</p>
              <p style={{ fontSize: 9, color: '#6b7280', margin: 0, marginTop: 1 }}>{label}</p>
            </div>
          ))}
        </div>

        {/* ── Time log table ── */}
        <p className="keep-with-next" style={{ fontSize: 12, fontWeight: 700, color: '#1a3a5c', marginBottom: 4, marginTop: 0 }}>รายละเอียดการลงเวลาปฏิบัติงาน</p>
        <table className="data-table" style={{ marginBottom: 16 }}>
          <thead>
            <tr>
              <th style={{ width: 36, textAlign: 'center' }}>ลำดับ</th>
              <th style={{ width: 88 }}>วันที่</th>
              <th style={{ width: 68, textAlign: 'center' }}>เวลาเข้า</th>
              <th style={{ width: 68, textAlign: 'center' }}>เวลาออก</th>
              <th style={{ width: 62, textAlign: 'center' }}>ชั่วโมง</th>
              <th>สรุปงานที่ปฏิบัติ</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={log.id}>
                <td style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>{i + 1}</td>
                <td style={{ textAlign: 'center' }}>{log.dateStr}</td>
                <td style={{ color: '#15803d', fontWeight: 500, textAlign: 'center' }}>{log.checkInStr}</td>
                <td style={{ color: '#dc2626', fontWeight: 500, textAlign: 'center' }}>{log.checkOutStr}</td>
                <td style={{ textAlign: 'center' }}>{log.durationStr}</td>
                <td style={{ color: '#4b5563' }}>{log.work_summary || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── รวมทั้งหมด + ลายเซ็น + Footer — อยู่ด้วยกันเสมอ ── */}
        <div style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          {/* รวมเวลา */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, marginTop: 0 }}>
            <div style={{ width: 300 }}>
              <div style={{ borderTop: '1px solid #d1d5db', paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: '#6b7280' }}>จำนวนวันปฏิบัติงาน</span>
                  <span style={{ fontSize: 12, color: '#374151' }}>{totalDays} วัน</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #d1d5db', paddingTop: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>รวมทั้งหมด</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>
                    {totalHours} ชั่วโมง {totalMinutes} นาที
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ลายเซ็น */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
            {[
              { label: 'ลายมือชื่อนิสิต',             sub: `(${student.name})` },
              { label: 'ลงชื่อพี่เลี้ยงหรือคนดูแล', sub: '(.................................)' },
              { label: 'ลายมือชื่อผู้อนุมัติ',         sub: '(.................................)' },
            ].map(({ label, sub }) => (
              <div key={label} style={{ textAlign: 'center', width: 185 }}>
                <div style={{ borderTop: '1px solid #374151', marginTop: 40, marginBottom: 5 }} />
                <p style={{ fontSize: 12, color: '#374151', margin: 0, lineHeight: 1.6 }}>{label}</p>
                <p style={{ fontSize: 11, color: '#6b7280', margin: 0, marginTop: 2, lineHeight: 1.6 }}>{sub}</p>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 24, paddingTop: 10, textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>
              สร้างโดยระบบลงเวลา {projectTitle} — {format(new Date(), 'd MMM yyyy HH:mm', { locale: th })}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
