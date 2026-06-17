'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, type Student, type TimeLog } from '@/lib/supabase'
import { format, differenceInMinutes } from 'date-fns'
import { th } from 'date-fns/locale'

type LogWithDuration = TimeLog & { durationMinutes: number }

type Summary = {
  totalDays: number
  totalHours: number
  totalMinutes: number
  taskCount: number
  logs: LogWithDuration[]
  student: Student | null
  month: string
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(false)
  const [userInput, setUserInput] = useState('')
  const [pwInput, setPwInput] = useState('')
  const [pwError, setPwError] = useState(false)
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (localStorage.getItem('admin_authed') === '1') setAuthed(true)
  }, [])

  useEffect(() => {
    if (!authed) return
    supabase.from('students').select('*').order('name').then(({ data }) => {
      if (data) setStudents(data)
    })
  }, [authed])

  // Must be before any conditional return
  const fetchSummary = useCallback(async () => {
    if (!selectedStudentId || !selectedMonth) return
    setLoading(true)
    try {
      const [y, m] = selectedMonth.split('-').map(Number)
      const start = new Date(y, m - 1, 1).toISOString()
      const end   = new Date(y, m, 1, 0, 0, 0, -1).toISOString()

      const { data: logs } = await supabase
        .from('time_logs')
        .select('*')
        .eq('student_id', selectedStudentId)
        .gte('check_in', start)
        .lte('check_in', end)
        .order('check_in', { ascending: true })

      const { data: student } = await supabase
        .from('students')
        .select('*')
        .eq('student_id', selectedStudentId)
        .single()

      const processed: LogWithDuration[] = (logs ?? []).map(log => ({
        ...log,
        durationMinutes: log.check_out
          ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in))
          : 0,
      }))

      const uniqueDays = new Set(processed.map(l => l.check_in.slice(0, 10))).size
      const totalMin   = processed.reduce((sum, l) => sum + l.durationMinutes, 0)

      setSummary({
        totalDays: uniqueDays,
        totalHours: Math.floor(totalMin / 60),
        totalMinutes: totalMin % 60,
        taskCount: processed.filter(l => l.work_summary).length,
        logs: processed,
        student,
        month: selectedMonth,
      })
    } finally {
      setLoading(false)
    }
  }, [selectedStudentId, selectedMonth])

  const handleLogin = () => {
    const validUser = process.env.NEXT_PUBLIC_ADMIN_USERNAME || 'admin'
    if (userInput === validUser && pwInput === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      localStorage.setItem('admin_authed', '1')
      setAuthed(true)
    } else {
      setPwError(true)
      setTimeout(() => setPwError(false), 2000)
    }
  }

  const handleExportPDF = async () => {
    if (!summary) return
    setExporting(true)
    try {
      const res = await fetch(
        `/api/export-pdf?studentId=${selectedStudentId}&month=${selectedMonth}`
      )
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `report_${selectedStudentId}_${selectedMonth}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Export PDF ไม่สำเร็จ: ' + (e as Error).message)
    } finally {
      setExporting(false)
    }
  }

  const fmtTime = (iso: string) =>
    format(new Date(iso), 'HH:mm', { locale: th })

  const fmtDate = (iso: string) =>
    format(new Date(iso), 'd MMMM yyyy', { locale: th })

  if (!authed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm space-y-5">
          <div className="text-center">
            <div className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800">Admin Dashboard</h1>
            <p className="text-sm text-indigo-500 mt-1">CoPs Marketing</p>
          </div>
          {pwError && (
            <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-4 py-2 text-sm text-center">
              ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ใช้</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="กรอกชื่อผู้ใช้"
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
            <input
              type="password"
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="กรอกรหัสผ่าน"
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
            />
          </div>
          <button
            onClick={handleLogin}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            เข้าสู่ระบบ
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Topbar */}
      <header className="bg-indigo-700 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Dashboard ผู้ดูแลระบบ</h1>
          <p className="text-indigo-200 text-xs">CoPs Marketing — ระบบลงเวลา</p>
        </div>
        <button
          onClick={() => { localStorage.removeItem('admin_authed'); setAuthed(false) }}
          className="text-indigo-200 hover:text-white text-sm transition-colors"
        >
          ออกจากระบบ
        </button>
      </header>

      <main className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-700 mb-4">เลือกข้อมูล</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">นิสิต</label>
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={selectedStudentId}
                onChange={e => setSelectedStudentId(e.target.value)}
              >
                <option value="">-- เลือกนิสิต --</option>
                {students.map(s => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.name} ({s.student_id})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">เดือน</label>
              <input
                type="month"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={fetchSummary}
                disabled={!selectedStudentId || loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
              >
                {loading ? 'กำลังโหลด...' : 'ดึงข้อมูล'}
              </button>
            </div>
          </div>
        </div>

        {summary && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'วันทำงาน', value: `${summary.totalDays} วัน`, color: 'bg-blue-50 text-blue-700' },
                { label: 'ชั่วโมงรวม', value: `${summary.totalHours} ชม. ${summary.totalMinutes} นาที`, color: 'bg-green-50 text-green-700' },
                { label: 'จำนวนงาน', value: `${summary.taskCount} งาน`, color: 'bg-purple-50 text-purple-700' },
              ].map(c => (
                <div key={c.label} className={`${c.color} rounded-xl p-4 text-center`}>
                  <p className="text-2xl font-bold">{c.value}</p>
                  <p className="text-sm mt-1 opacity-75">{c.label}</p>
                </div>
              ))}
            </div>

            {/* Export button */}
            <div className="flex justify-end">
              <button
                onClick={handleExportPDF}
                disabled={exporting}
                className="bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {exporting ? 'กำลัง Export...' : 'Export PDF'}
              </button>
            </div>

            {/* Logs table */}
            <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
              <div className="px-5 py-4 border-b">
                <h2 className="font-semibold text-gray-700">รายการลงเวลา</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {summary.student?.name} — {selectedMonth}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 text-left">วันที่</th>
                      <th className="px-4 py-3 text-left">เวลาเข้า</th>
                      <th className="px-4 py-3 text-left">เวลาออก</th>
                      <th className="px-4 py-3 text-left">ชม.</th>
                      <th className="px-4 py-3 text-left">สรุปงาน</th>
                      <th className="px-4 py-3 text-left">รูป</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {summary.logs.map(log => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDate(log.check_in)}</td>
                        <td className="px-4 py-3 font-medium text-green-600">{fmtTime(log.check_in)}</td>
                        <td className="px-4 py-3 font-medium text-rose-500">
                          {log.check_out ? fmtTime(log.check_out) : <span className="text-yellow-500">ยังไม่ออก</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {log.durationMinutes > 0 ? `${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m` : '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{log.work_summary || '-'}</td>
                        <td className="px-4 py-3">
                          {log.photo_url
                            ? <img src={log.photo_url} alt="work" className="w-10 h-10 object-cover rounded-md" />
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {summary.logs.length === 0 && (
                  <div className="text-center py-12 text-gray-400 text-sm">ไม่มีข้อมูลในเดือนนี้</div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
