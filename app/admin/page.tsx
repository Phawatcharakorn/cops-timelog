'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, type Student, type TimeLog } from '@/lib/supabase'
import { format, differenceInMinutes } from 'date-fns'
import { th } from 'date-fns/locale'

type LogWithDuration = TimeLog & { durationMinutes: number }
type Summary = {
  totalDays: number; totalHours: number; totalMinutes: number; taskCount: number
  logs: LogWithDuration[]; student: Student | null; month: string
}
type StudentOverview = {
  student: Student; totalDays: number; totalHours: number; totalMinutes: number; taskCount: number
}
type EditForm   = { check_in: string; check_out: string; work_summary: string }
type MonthStat  = { month: string; days: number; hours: number; minutes: number; tasks: number }

function fmtTime(iso: string) {
  return format(new Date(iso), 'HH:mm', { locale: th })
}
function fmtDate(iso: string) {
  return format(new Date(iso), 'd MMM yyyy', { locale: th })
}
function toDatetimeLocal(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd'T'HH:mm")
}
function fromDatetimeLocal(local: string) {
  if (!local) return null
  return new Date(local).toISOString()
}

export default function AdminPage() {
  const [authed, setAuthed]           = useState(false)
  const [userInput, setUserInput]     = useState('')
  const [pwInput, setPwInput]         = useState('')
  const [pwError, setPwError]         = useState(false)
  const [tab, setTab]                 = useState<'individual' | 'overview' | 'manage'>('individual')

  // Individual tab
  const [students, setStudents]               = useState<Student[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [selectedMonth, setSelectedMonth]     = useState(format(new Date(), 'yyyy-MM'))
  const [selectedDate, setSelectedDate]       = useState('')
  const [summary, setSummary]                 = useState<Summary | null>(null)
  const [loading, setLoading]                 = useState(false)
  const [exporting, setExporting]             = useState(false)

  // Overview tab
  const [overview, setOverview]               = useState<StudentOverview[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)

  // Multi-month stats
  const [rangeStart, setRangeStart]           = useState('')
  const [rangeEnd, setRangeEnd]               = useState('')
  const [multiStats, setMultiStats]           = useState<MonthStat[] | null>(null)
  const [multiLoading, setMultiLoading]       = useState(false)

  // Edit modal
  const [editingLog, setEditingLog]           = useState<TimeLog | null>(null)
  const [editForm, setEditForm]               = useState<EditForm>({ check_in: '', check_out: '', work_summary: '' })
  const [editSaving, setEditSaving]           = useState(false)

  useEffect(() => {
    if (localStorage.getItem('admin_authed') === '1') setAuthed(true)
  }, [])

  useEffect(() => {
    if (!authed) return
    supabase.from('students').select('*').order('name').then(({ data }) => {
      if (data) setStudents(data)
    })
  }, [authed])

  const fetchSummary = useCallback(async () => {
    if (!selectedStudentId) return
    setLoading(true)
    try {
      let start: string, end: string
      if (selectedDate) {
        const d = new Date(selectedDate)
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString()
        end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()
      } else {
        const [y, m] = selectedMonth.split('-').map(Number)
        start = new Date(y, m - 1, 1).toISOString()
        end   = new Date(y, m, 1, 0, 0, 0, -1).toISOString()
      }
      const [{ data: logs }, { data: student }] = await Promise.all([
        supabase.from('time_logs').select('*').eq('student_id', selectedStudentId)
          .gte('check_in', start).lte('check_in', end).order('check_in', { ascending: true }),
        supabase.from('students').select('*').eq('student_id', selectedStudentId).single(),
      ])
      const processed: LogWithDuration[] = (logs ?? []).map(log => ({
        ...log,
        durationMinutes: log.check_out ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in)) : 0,
      }))
      const toThaiDate = (iso: string) =>
        new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const totalMin = processed.reduce((s, l) => s + l.durationMinutes, 0)
      setSummary({
        totalDays: new Set(processed.map(l => toThaiDate(l.check_in))).size,
        totalHours: Math.floor(totalMin / 60), totalMinutes: totalMin % 60,
        taskCount: processed.length,
        logs: processed, student, month: selectedMonth,
      })
    } finally { setLoading(false) }
  }, [selectedStudentId, selectedMonth, selectedDate])

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true)
    try {
      const [y, m] = selectedMonth.split('-').map(Number)
      const start = new Date(y, m - 1, 1).toISOString()
      const end   = new Date(y, m, 1, 0, 0, 0, -1).toISOString()
      const [{ data: allStudents }, { data: allLogs }] = await Promise.all([
        supabase.from('students').select('*').order('name'),
        supabase.from('time_logs').select('*').gte('check_in', start).lte('check_in', end),
      ])
      const result: StudentOverview[] = (allStudents ?? []).map(s => {
        const logs = (allLogs ?? []).filter(l => l.student_id === s.student_id)
        const totalMin = logs.reduce((sum, l) =>
          sum + (l.check_out ? differenceInMinutes(new Date(l.check_out), new Date(l.check_in)) : 0), 0)
        return {
          student: s,
          totalDays: new Set(logs.map(l => new Date(new Date(l.check_in).getTime() + 7*3600*1000).toISOString().slice(0,10))).size,
          totalHours: Math.floor(totalMin / 60),
          totalMinutes: totalMin % 60,
          taskCount: logs.length,
        }
      })
      setOverview(result)
    } finally { setOverviewLoading(false) }
  }, [selectedMonth])

  const fetchMultiStats = useCallback(async () => {
    if (!selectedStudentId || !rangeStart || !rangeEnd) return
    setMultiLoading(true)
    try {
      const TZ = 7 * 60 * 60 * 1000
      const [sy, sm] = rangeStart.split('-').map(Number)
      const [ey, em] = rangeEnd.split('-').map(Number)
      const start = new Date(Date.UTC(sy, sm - 1, 1) - TZ).toISOString()
      const end   = new Date(Date.UTC(ey, em, 1) - TZ - 1).toISOString()
      const { data: logs } = await supabase.from('time_logs').select('*')
        .eq('student_id', selectedStudentId)
        .gte('check_in', start).lte('check_in', end)
        .order('check_in', { ascending: true })
      const grouped: Record<string, { dates: Set<string>; totalMin: number; tasks: number }> = {}
      for (const log of logs ?? []) {
        const thai = new Date(new Date(log.check_in).getTime() + TZ)
        const key  = thai.toISOString().slice(0, 7)
        const day  = thai.toISOString().slice(0, 10)
        if (!grouped[key]) grouped[key] = { dates: new Set(), totalMin: 0, tasks: 0 }
        grouped[key].dates.add(day)
        grouped[key].totalMin += log.check_out ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in)) : 0
        grouped[key].tasks += 1
      }
      setMultiStats(Object.entries(grouped).map(([month, g]) => ({
        month,
        days: g.dates.size,
        hours: Math.floor(g.totalMin / 60),
        minutes: g.totalMin % 60,
        tasks: g.tasks,
      })))
    } finally { setMultiLoading(false) }
  }, [selectedStudentId, rangeStart, rangeEnd])

  const handleExportCSV = (useRange = false) => {
    const url = useRange && rangeStart && rangeEnd
      ? `/api/export-csv?studentId=${selectedStudentId}&startMonth=${rangeStart}&endMonth=${rangeEnd}`
      : `/api/export-csv?studentId=${selectedStudentId}&month=${selectedMonth}`
    const a = document.createElement('a'); a.href = url
    a.download = `timelog_${selectedStudentId}.csv`; a.click()
  }

  const handleDeleteStudent = async (student: Student) => {
    if (!confirm(`ลบ "${student.name}" (${student.student_id}) และข้อมูลลงเวลาทั้งหมด?`)) return
    // ลบ time_logs ก่อน แล้วค่อยลบ student
    await supabase.from('time_logs').delete().eq('student_id', student.student_id)
    await supabase.from('students').delete().eq('student_id', student.student_id)
    setStudents(prev => prev.filter(s => s.student_id !== student.student_id))
    if (selectedStudentId === student.student_id) { setSelectedStudentId(''); setSummary(null) }
  }

  const openEdit = (log: TimeLog) => {
    setEditingLog(log)
    setEditForm({
      check_in: toDatetimeLocal(log.check_in),
      check_out: log.check_out ? toDatetimeLocal(log.check_out) : '',
      work_summary: log.work_summary ?? '',
    })
  }

  const handleEditSave = async () => {
    if (!editingLog) return
    setEditSaving(true)
    try {
      const { error } = await supabase.from('time_logs').update({
        check_in:     fromDatetimeLocal(editForm.check_in) ?? editingLog.check_in,
        check_out:    editForm.check_out ? fromDatetimeLocal(editForm.check_out) : null,
        work_summary: editForm.work_summary || null,
      }).eq('id', editingLog.id)
      if (error) throw error
      setEditingLog(null)
      await fetchSummary()
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: ' + (e as Error).message)
    } finally { setEditSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ลบรายการนี้?')) return
    await supabase.from('time_logs').delete().eq('id', id)
    await fetchSummary()
  }

  const handleExportPDF = async () => {
    if (!summary) return
    setExporting(true)
    try {
      const res = await fetch(`/api/export-pdf?studentId=${selectedStudentId}&month=${selectedMonth}`)
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = `report_${selectedStudentId}_${selectedMonth}.pdf`; a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      alert('Export PDF ไม่สำเร็จ: ' + (e as Error).message)
    } finally { setExporting(false) }
  }

  const handleLogin = () => {
    const validUser = process.env.NEXT_PUBLIC_ADMIN_USERNAME || 'admin'
    if (userInput === validUser && pwInput === process.env.NEXT_PUBLIC_ADMIN_PASSWORD) {
      localStorage.setItem('admin_authed', '1'); setAuthed(true)
    } else {
      setPwError(true); setTimeout(() => setPwError(false), 2000)
    }
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 w-full max-w-sm space-y-5">
          <div className="text-center">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800">Admin Dashboard</h1>
            <p className="text-sm text-gray-400 mt-1">CoPs</p>
          </div>
          {pwError && (
            <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-4 py-2 text-sm text-center">
              ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ใช้</label>
            <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="กรอกชื่อผู้ใช้" value={userInput}
              onChange={e => setUserInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
            <input type="password" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="กรอกรหัสผ่าน" value={pwInput}
              onChange={e => setPwInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <button onClick={handleLogin} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl transition-colors">
            เข้าสู่ระบบ
          </button>
          <div className="text-center">
            <a href="/student" className="text-xs text-gray-400 hover:text-indigo-500 transition-colors">กลับหน้าบันทึกเวลา</a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-gray-800">Dashboard ผู้ดูแลระบบ</h1>
          <p className="text-xs text-gray-400 mt-0.5">CoPs — ระบบลงเวลา</p>
        </div>
        <div className="flex items-center gap-4">
          <a href="/student" className="text-sm text-indigo-600 hover:text-indigo-700 font-medium transition-colors">หน้าบันทึกเวลา</a>
          <button onClick={() => { localStorage.removeItem('admin_authed'); setAuthed(false) }}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors">ออกจากระบบ</button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 space-y-6">

        {/* Month selector (shared) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">เดือน</label>
              <input type="month" className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); setSelectedDate('') }} />
            </div>
            {/* Tabs */}
            <div className="flex gap-1 ml-auto">
              {(['individual', 'overview', 'manage'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {t === 'individual' ? 'รายบุคคล' : t === 'overview' ? 'ภาพรวมทุกคน' : 'จัดการนิสิต'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Tab: Individual ── */}
        {tab === 'individual' && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-700 text-sm mb-4">เลือกนิสิต</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">นิสิต</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}>
                    <option value="">-- เลือกนิสิต --</option>
                    {students.map(s => (
                      <option key={s.student_id} value={s.student_id}>{s.name} ({s.student_id})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">วันที่ (เฉพาะวัน)</label>
                  <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
                </div>
                <div className="flex items-end gap-2 md:col-span-2">
                  <button onClick={fetchSummary} disabled={!selectedStudentId || loading}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                    {loading ? 'กำลังโหลด...' : 'ดึงข้อมูล'}
                  </button>
                  {selectedDate && (
                    <button onClick={() => setSelectedDate('')}
                      className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-500 hover:bg-gray-50">ล้าง</button>
                  )}
                </div>
              </div>
              {selectedDate && (
                <p className="text-xs text-indigo-500 mt-2">
                  กรองเฉพาะวันที่ {format(new Date(selectedDate), 'd MMMM yyyy', { locale: th })}
                </p>
              )}
            </div>

            {summary && (
              <>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Work Days',    value: `${summary.totalDays}`,                                              color: 'bg-blue-50 text-blue-700 border-blue-100' },
                    { label: 'Total Hours',  value: `${summary.totalHours}h ${summary.totalMinutes}m`,              color: 'bg-green-50 text-green-700 border-green-100' },
                    { label: 'Tasks',        value: `${summary.taskCount}`,                                          color: 'bg-purple-50 text-purple-700 border-purple-100' },
                  ].map(c => (
                    <div key={c.label} className={`${c.color} border rounded-xl p-5 text-center`}>
                      <p className="text-sm font-medium opacity-60 mb-3">{c.label}</p>
                      <p className="text-3xl font-bold leading-none">{c.value}</p>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2">
                  <button onClick={() => handleExportCSV(false)} disabled={!selectedStudentId}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-medium px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export CSV
                  </button>
                  <button onClick={handleExportPDF} disabled={exporting || !!selectedDate}
                    className="bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white font-medium px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors"
                    title={selectedDate ? 'Export PDF ใช้ได้เฉพาะมุมมองรายเดือน' : ''}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {exporting ? 'กำลัง Export...' : 'Export PDF'}
                  </button>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-700 text-sm">รายการลงเวลา</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {summary.student?.name}
                      {selectedDate ? ` — ${format(new Date(selectedDate), 'd MMMM yyyy', { locale: th })}` : ` — ${selectedMonth}`}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                          <th className="px-3 py-3 text-center font-medium w-10">#</th>
                          <th className="px-4 py-3 text-left font-medium">วันที่</th>
                          <th className="px-4 py-3 text-left font-medium">เวลาเข้า</th>
                          <th className="px-4 py-3 text-left font-medium">เวลาออก</th>
                          <th className="px-4 py-3 text-left font-medium">ชม.</th>
                          <th className="px-4 py-3 text-left font-medium">สรุปงาน</th>
                          <th className="px-4 py-3 text-left font-medium">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {summary.logs.map((log, idx) => (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="px-3 py-3.5 text-center text-xs text-gray-300 leading-relaxed">{idx + 1}</td>
                            <td className="px-4 py-3.5 text-gray-600 whitespace-nowrap leading-relaxed">{fmtDate(log.check_in)}</td>
                            <td className="px-4 py-3.5 font-medium text-green-600 leading-relaxed">{fmtTime(log.check_in)}</td>
                            <td className="px-4 py-3.5 font-medium text-rose-500 leading-relaxed">
                              {log.check_out ? fmtTime(log.check_out) : <span className="text-yellow-500">ยังไม่ออก</span>}
                            </td>
                            <td className="px-4 py-3.5 text-gray-600 leading-relaxed">
                              {log.durationMinutes > 0 ? `${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m` : '-'}
                            </td>
                            <td className="px-4 py-3.5 text-gray-600 max-w-xs truncate leading-relaxed">{log.work_summary || '-'}</td>
                            <td className="px-4 py-3.5">
                              <div className="flex gap-2">
                                <button onClick={() => openEdit(log)}
                                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">แก้ไข</button>
                                <button onClick={() => handleDelete(log.id)}
                                  className="text-xs text-red-500 hover:text-red-700 font-medium">ลบ</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {summary.logs.length === 0 && (
                      <div className="text-center py-12 text-gray-400 text-sm">ไม่มีข้อมูล</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── Multi-month stats ── */}
            {selectedStudentId && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
                <h2 className="font-semibold text-gray-700 text-sm">สถิติย้อนหลังหลายเดือน</h2>
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">จากเดือน</label>
                    <input type="month" className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      value={rangeStart} onChange={e => { setRangeStart(e.target.value); setMultiStats(null) }} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ถึงเดือน</label>
                    <input type="month" className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      value={rangeEnd} onChange={e => { setRangeEnd(e.target.value); setMultiStats(null) }} />
                  </div>
                  <button onClick={fetchMultiStats} disabled={!rangeStart || !rangeEnd || multiLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors">
                    {multiLoading ? 'กำลังโหลด...' : 'ดูสถิติ'}
                  </button>
                  {multiStats && (
                    <button onClick={() => handleExportCSV(true)}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export CSV ช่วงนี้
                    </button>
                  )}
                </div>

                {multiStats && (
                  <div className="overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                          <th className="px-4 py-3 text-left font-medium">เดือน</th>
                          <th className="px-4 py-3 text-center font-medium">Work Days</th>
                          <th className="px-4 py-3 text-center font-medium">Total Hours</th>
                          <th className="px-4 py-3 text-center font-medium">Tasks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {multiStats.map(s => (
                          <tr key={s.month} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-700">
                              {format(new Date(s.month + '-01'), 'MMMM yyyy', { locale: th })}
                            </td>
                            <td className="px-4 py-3 text-center text-blue-600 font-semibold">{s.days}</td>
                            <td className="px-4 py-3 text-center text-green-600 font-semibold">{s.hours}h {s.minutes}m</td>
                            <td className="px-4 py-3 text-center text-purple-600 font-semibold">{s.tasks}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold text-gray-700 border-t-2 border-gray-200">
                          <td className="px-4 py-3">รวม {multiStats.length} เดือน</td>
                          <td className="px-4 py-3 text-center text-blue-700">
                            {multiStats.reduce((s, m) => s + m.days, 0)} วัน
                          </td>
                          <td className="px-4 py-3 text-center text-green-700">
                            {(() => { const t = multiStats.reduce((s, m) => s + m.hours * 60 + m.minutes, 0); return `${Math.floor(t/60)}h ${t%60}m` })()}
                          </td>
                          <td className="px-4 py-3 text-center text-purple-700">
                            {multiStats.reduce((s, m) => s + m.tasks, 0)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Tab: Overview ── */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={fetchOverview} disabled={overviewLoading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors">
                {overviewLoading ? 'กำลังโหลด...' : `ดูภาพรวม ${selectedMonth}`}
              </button>
            </div>

            {overview.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-700 text-sm">ภาพรวมการลงเวลาทุกคน</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedMonth} — {overview.length} คน</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">ชื่อ-นามสกุล</th>
                        <th className="px-4 py-3 text-left font-medium">รหัส</th>
                        <th className="px-4 py-3 text-left font-medium">ฝ่าย</th>
                        <th className="px-4 py-3 text-center font-medium">วันทำงาน</th>
                        <th className="px-4 py-3 text-center font-medium">ชั่วโมงรวม</th>
                        <th className="px-4 py-3 text-center font-medium">งาน</th>
                        <th className="px-4 py-3 text-left font-medium"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {overview.map(({ student, totalDays, totalHours, totalMinutes, taskCount }) => (
                        <tr key={student.student_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">{student.name}</td>
                          <td className="px-4 py-3 text-gray-500">{student.student_id}</td>
                          <td className="px-4 py-3">
                            <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{student.department}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-semibold ${totalDays === 0 ? 'text-gray-300' : 'text-blue-600'}`}>{totalDays}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-semibold ${totalHours === 0 && totalMinutes === 0 ? 'text-gray-300' : 'text-green-600'}`}>
                              {totalHours}h {totalMinutes}m
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-purple-600 font-semibold">{taskCount}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => { setTab('individual'); setSelectedStudentId(student.student_id) }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap">
                              ดูรายละเอียด
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Manage Students ── */}
        {tab === 'manage' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-700 text-sm">จัดการนิสิต</h2>
              <p className="text-xs text-gray-400 mt-0.5">ลบนิสิตจะลบข้อมูลลงเวลาทั้งหมดของนิสิตคนนั้นด้วย</p>
            </div>
            {students.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">ไม่มีข้อมูลนิสิต</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">ชื่อ-นามสกุล</th>
                    <th className="px-4 py-3 text-left font-medium">รหัสนิสิต</th>
                    <th className="px-4 py-3 text-left font-medium">ฝ่าย</th>
                    <th className="px-4 py-3 text-left font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {students.map(s => (
                    <tr key={s.student_id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                      <td className="px-4 py-3 text-gray-500">{s.student_id}</td>
                      <td className="px-4 py-3">
                        <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{s.department}</span>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => handleDeleteStudent(s)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium">
                          ลบ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>

      {/* Edit Modal */}
      {editingLog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">แก้ไขรายการ</h3>
              <button onClick={() => setEditingLog(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เวลาเข้า (เวลาไทย)</label>
              <input type="datetime-local"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={editForm.check_in} onChange={e => setEditForm(f => ({ ...f, check_in: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เวลาออก (เวลาไทย)</label>
              <input type="datetime-local"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                value={editForm.check_out} onChange={e => setEditForm(f => ({ ...f, check_out: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สรุปงาน</label>
              <textarea rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                value={editForm.work_summary} onChange={e => setEditForm(f => ({ ...f, work_summary: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditingLog(null)}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                ยกเลิก
              </button>
              <button onClick={handleEditSave} disabled={editSaving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {editSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
