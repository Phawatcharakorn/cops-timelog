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
  const [data,  setData]  = useState<ReportData | null>(null)
  const [error, setError] = useState('')

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
    })
  }, [studentId, month])

  if (error) return (
    <div className="p-8 text-center text-red-500 text-sm">{error}</div>
  )
  if (!data) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">กำลังโหลดข้อมูล...</p>
    </div>
  )

  const { student, logs, monthLabel, totalDays, totalHours, totalMinutes, taskCount } = data

  return (
    <>
      <style>{`
        @font-face { font-family:'Sarabun'; src:url('/fonts/Sarabun-Regular.ttf') format('truetype'); font-weight:400; }
        @font-face { font-family:'Sarabun'; src:url('/fonts/Sarabun-Medium.ttf')  format('truetype'); font-weight:500; }
        @font-face { font-family:'Sarabun'; src:url('/fonts/Sarabun-Bold.ttf')    format('truetype'); font-weight:700; }
        * { font-family: 'Sarabun', sans-serif; }
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          @page { margin: 1.5cm; size: A4 portrait; }
        }
      `}</style>

      {/* Toolbar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 bg-gray-800 text-white px-6 py-3 flex items-center justify-between">
        <span className="text-sm font-medium">{student.name} — {monthLabel}</span>
        <div className="flex gap-2">
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
          >
            ปิด
          </button>
        </div>
      </div>

      {/* Report body */}
      <div className="max-w-3xl mx-auto p-8 bg-white min-h-screen">

        {/* Header */}
        <div className="rounded-lg px-5 py-4 mb-5" style={{ backgroundColor: '#3730a3' }}>
          <p className="text-white font-bold text-sm leading-relaxed">
            รายงานการลงเวลาทำงาน ประจำเดือน {monthLabel}
          </p>
          <p className="text-indigo-200 text-xs mt-1 leading-relaxed">
            CoPs {student.department} — {student.name}
          </p>
        </div>

        {/* Student info */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {([
            { label: 'ชื่อ-นามสกุล', value: student.name },
            { label: 'รหัสนิสิต',    value: student.student_id },
            { label: 'ฝ่าย',          value: student.department },
          ] as const).map(({ label, value }) => (
            <div key={label} className="border border-gray-200 rounded-lg p-3">
              <p className="text-gray-400 text-xs mb-1 leading-relaxed">{label}</p>
              <p className="font-bold text-gray-800 text-sm leading-relaxed">{value}</p>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Work Days',    value: String(totalDays),    color: '#1d4ed8' },
            { label: 'Total Hours',  value: String(totalHours),   color: '#15803d' },
            { label: 'Minutes',      value: String(totalMinutes), color: '#15803d' },
            { label: 'Tasks',        value: String(taskCount),    color: '#7e22ce' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg p-3 text-center" style={{ backgroundColor: '#eff6ff' }}>
              <p className="text-2xl font-bold" style={{ color }}>{value}</p>
              <p className="text-xs mt-1" style={{ color: '#3b82f6' }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <p className="font-bold text-gray-700 text-sm mb-2 leading-relaxed">รายละเอียดการลงเวลา</p>
        <table className="w-full text-xs" style={{ borderCollapse: 'collapse', border: '1px solid #e5e7eb', borderRadius: 4 }}>
          <thead>
            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['วันที่', 'เข้า', 'ออก', 'ชั่วโมง', 'สรุปงาน'].map(h => (
                <th key={h} className="text-left font-semibold text-gray-500 leading-relaxed"
                  style={{ padding: '6px 10px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr key={log.id} style={{ backgroundColor: i % 2 === 1 ? '#fafafa' : '#fff', borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 10px', lineHeight: 1.8, color: '#374151' }}>{log.dateStr}</td>
                <td style={{ padding: '8px 10px', lineHeight: 1.8, color: '#16a34a', fontWeight: 500 }}>{log.checkInStr}</td>
                <td style={{ padding: '8px 10px', lineHeight: 1.8, color: '#dc2626', fontWeight: 500 }}>{log.checkOutStr}</td>
                <td style={{ padding: '8px 10px', lineHeight: 1.8, color: '#374151' }}>{log.durationStr}</td>
                <td style={{ padding: '8px 10px', lineHeight: 1.8, color: '#374151' }}>{log.work_summary || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Signatures */}
        <div className="flex justify-between mt-10">
          {[
            { label: 'ลายมือชื่อนิสิต',   sub: `(${student.name})` },
            { label: 'ลายมือชื่อผู้ดูแล',  sub: '(.................................)' },
            { label: 'ลายมือชื่อผู้อนุมัติ', sub: '(.................................)' },
          ].map(({ label, sub }) => (
            <div key={label} className="text-center" style={{ width: 190 }}>
              <div style={{ borderTop: '1px solid #374151', marginTop: 48, marginBottom: 4 }} />
              <p className="text-xs text-gray-500 leading-relaxed">{label}</p>
              <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{sub}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
          สร้างโดยระบบลงเวลา CoPs {student.department} —{' '}
          {format(new Date(), 'd MMM yyyy HH:mm', { locale: th })}
        </p>
      </div>
    </>
  )
}
