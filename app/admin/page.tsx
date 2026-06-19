'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase, type Student, type TimeLog } from '@/lib/supabase'
import { format, differenceInMinutes } from 'date-fns'
import { th } from 'date-fns/locale'

const DEPARTMENTS = ['Marketing', 'Event', 'Human Resource Development', 'Catering', 'Student Assistant', 'อื่นๆ']
const FACULTIES = [
  'คณะพาณิชยนาวีนานาชาติ',
  'คณะเศรษฐศาสตร์ ศรีราชา',
  'คณะวิทยาศาสตร์ ศรีราชา',
  'คณะวิศวกรรมศาสตร์ ศรีราชา',
  'คณะวิทยาการจัดการ',
]

type LogWithDuration = TimeLog & { durationMinutes: number }
type Summary = {
  totalDays: number; totalHours: number; totalMinutes: number; taskCount: number
  logs: LogWithDuration[]; student: Student | null; month: string
}
type StudentOverview = {
  student: Student; totalDays: number; totalHours: number; totalMinutes: number; taskCount: number
}
type EditForm     = { check_in: string; check_out: string; work_summary: string }
type MonthStat    = { month: string; days: number; hours: number; minutes: number; tasks: number }
type AddStudentForm = { student_id: string; name: string; department: string; faculty: string; major: string; pin: string }
type AddLogForm   = { date: string; check_in: string; check_out: string; work_summary: string }

function fmtTime(iso: string)         { return format(new Date(iso), 'HH:mm', { locale: th }) }
function fmtDate(iso: string)         { return format(new Date(iso), 'd MMM yyyy', { locale: th }) }
function toDatetimeLocal(iso: string) { return format(new Date(iso), "yyyy-MM-dd'T'HH:mm") }
function fromDatetimeLocal(local: string) { if (!local) return null; return new Date(local).toISOString() }
function thaiToUTC(date: string, time: string) { return new Date(`${date}T${time}:00+07:00`).toISOString() }
function todayThai() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400'

export default function AdminPage() {
  const [authed, setAuthed]       = useState(false)
  const [userInput, setUserInput] = useState('')
  const [pwInput, setPwInput]     = useState('')
  const [pwError, setPwError]     = useState(false)
  const [tab, setTab]             = useState<'individual' | 'overview' | 'manage'>('individual')

  // Individual tab
  const [students, setStudents]                     = useState<Student[]>([])
  const [selectedStudentId, setSelectedStudentId]   = useState('')
  const [selectedMonth, setSelectedMonth]           = useState(format(new Date(), 'yyyy-MM'))
  const [selectedDate, setSelectedDate]             = useState('')
  const [summary, setSummary]                       = useState<Summary | null>(null)
  const [loading, setLoading]                       = useState(false)

  // Overview tab
  const [overview, setOverview]             = useState<StudentOverview[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewDept, setOverviewDept]     = useState('')   // filter

  // Multi-month stats
  const [rangeStart, setRangeStart]   = useState('')
  const [rangeEnd, setRangeEnd]       = useState('')
  const [multiStats, setMultiStats]   = useState<MonthStat[] | null>(null)
  const [multiLoading, setMultiLoading] = useState(false)

  // Edit modal
  const [editingLog, setEditingLog] = useState<TimeLog | null>(null)
  const [editForm, setEditForm]     = useState<EditForm>({ check_in: '', check_out: '', work_summary: '' })
  const [editSaving, setEditSaving] = useState(false)

  // Add Student modal
  const [addStudentOpen, setAddStudentOpen]     = useState(false)
  const [addStudentForm, setAddStudentForm]     = useState<AddStudentForm>({ student_id: '', name: '', department: 'Marketing', faculty: FACULTIES[0], major: '', pin: '' })
  const [addStudentSaving, setAddStudentSaving] = useState(false)

  // Add Log modal
  const [addLogOpen, setAddLogOpen]     = useState(false)
  const [addLogForm, setAddLogForm]     = useState<AddLogForm>({ date: todayThai(), check_in: '', check_out: '', work_summary: '' })
  const [addLogSaving, setAddLogSaving] = useState(false)

  // PIN modal
  const [pinModal, setPinModal]   = useState<{ student_id: string; name: string } | null>(null)
  const [pinInput, setPinInput]   = useState('')
  const [pinSaving, setPinSaving] = useState(false)

  // Search
  const [searchIndividual, setSearchIndividual]       = useState('')
  const [showStudentDropdown, setShowStudentDropdown] = useState(false)
  const [searchManage, setSearchManage]               = useState('')

  // PIN reveal
  const [revealedPins, setRevealedPins] = useState<Set<string>>(new Set())
  const togglePinReveal = (id: string) =>
    setRevealedPins(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  // Edit Student modal
  const [editStudentModal, setEditStudentModal]     = useState<Student | null>(null)
  const [editStudentForm, setEditStudentForm]       = useState({ name: '', department: 'Marketing', faculty: FACULTIES[0], major: '' })
  const [editStudentSaving, setEditStudentSaving]   = useState(false)

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (localStorage.getItem('admin_authed') === '1') setAuthed(true)
  }, [])

  const loadStudents = useCallback(async () => {
    const { data } = await supabase.from('students').select('*').order('name')
    if (data) setStudents(data)
  }, [])

  useEffect(() => { if (authed) loadStudents() }, [authed, loadStudents])

  // ── Data fetchers ──────────────────────────────────────────────────────────

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
        durationMinutes: log.check_out
          ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in))
          : 0,
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
          totalDays: new Set(logs.map(l =>
            new Date(new Date(l.check_in).getTime() + 7 * 3600000).toISOString().slice(0, 10)
          )).size,
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
        grouped[key].totalMin += log.check_out
          ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in))
          : 0
        grouped[key].tasks += 1
      }
      setMultiStats(Object.entries(grouped).map(([month, g]) => ({
        month, days: g.dates.size,
        hours: Math.floor(g.totalMin / 60), minutes: g.totalMin % 60, tasks: g.tasks,
      })))
    } finally { setMultiLoading(false) }
  }, [selectedStudentId, rangeStart, rangeEnd])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleExportCSV = (useRange = false) => {
    const url = useRange && rangeStart && rangeEnd
      ? `/api/export-csv?studentId=${selectedStudentId}&startMonth=${rangeStart}&endMonth=${rangeEnd}`
      : `/api/export-csv?studentId=${selectedStudentId}&month=${selectedMonth}`
    const a = document.createElement('a')
    a.href = url; a.download = `timelog_${selectedStudentId}.csv`; a.click()
  }

  const handleExportPDF = () => {
    if (!summary) return
    window.open(`/print?studentId=${selectedStudentId}&month=${selectedMonth}`, '_blank')
  }

  const handleDeleteStudent = async (student: Student) => {
    if (!confirm(`ลบ "${student.name}" (${student.student_id}) และข้อมูลลงเวลาทั้งหมด?`)) return
    await supabase.from('time_logs').delete().eq('student_id', student.student_id)
    await supabase.from('students').delete().eq('student_id', student.student_id)
    if (selectedStudentId === student.student_id) { setSelectedStudentId(''); setSummary(null) }
    await loadStudents()
  }

  const openEdit = (log: TimeLog) => {
    setEditingLog(log)
    setEditForm({
      check_in:     toDatetimeLocal(log.check_in),
      check_out:    log.check_out ? toDatetimeLocal(log.check_out) : '',
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

  // ── NEW: เพิ่มนิสิตใหม่ ────────────────────────────────────────────────────
  const handleAddStudent = async () => {
    const { student_id, name, department, faculty, major, pin } = addStudentForm
    if (!student_id.trim() || !name.trim()) return alert('กรุณากรอกรหัสนิสิตและชื่อ')
    if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) return alert('PIN ต้องเป็นตัวเลข 4 หลัก')
    setAddStudentSaving(true)
    try {
      const { error } = await supabase.from('students').insert({
        student_id: student_id.trim(),
        name:       name.trim(),
        department,
        faculty,
        major:      major.trim() || null,
        pin:        pin || null,
      })
      if (error) throw error
      setAddStudentOpen(false)
      setAddStudentForm({ student_id: '', name: '', department: 'Marketing', faculty: FACULTIES[0], major: '', pin: '' })
      await loadStudents()
    } catch (e) {
      alert('เพิ่มนิสิตไม่สำเร็จ: ' + (e as Error).message)
    } finally { setAddStudentSaving(false) }
  }

  // ── NEW: เพิ่ม Log ย้อนหลัง ───────────────────────────────────────────────
  const handleAddLog = async () => {
    const { date, check_in, check_out, work_summary } = addLogForm
    if (!date || !check_in) return alert('กรุณากรอกวันที่และเวลาเข้า')
    if (check_out && check_out <= check_in) return alert('เวลาออกต้องมากกว่าเวลาเข้า')
    setAddLogSaving(true)
    try {
      const { error } = await supabase.from('time_logs').insert({
        student_id:   selectedStudentId,
        check_in:     thaiToUTC(date, check_in),
        check_out:    check_out ? thaiToUTC(date, check_out) : null,
        work_summary: work_summary || null,
      })
      if (error) throw error
      setAddLogOpen(false)
      setAddLogForm({ date: todayThai(), check_in: '', check_out: '', work_summary: '' })
      await fetchSummary()
    } catch (e) {
      alert('เพิ่ม Log ไม่สำเร็จ: ' + (e as Error).message)
    } finally { setAddLogSaving(false) }
  }

  // ── NEW: ตั้ง PIN ──────────────────────────────────────────────────────────
  const handleSetPin = async () => {
    if (!pinModal) return
    if (pinInput && (pinInput.length !== 4 || !/^\d{4}$/.test(pinInput)))
      return alert('PIN ต้องเป็นตัวเลข 4 หลัก')
    setPinSaving(true)
    try {
      const { error } = await supabase.from('students')
        .update({ pin: pinInput || null })
        .eq('student_id', pinModal.student_id)
      if (error) throw error
      setPinModal(null); setPinInput('')
      await loadStudents()
    } catch (e) {
      alert('ตั้ง PIN ไม่สำเร็จ: ' + (e as Error).message)
    } finally { setPinSaving(false) }
  }

  // ── NEW: แก้ไขข้อมูลนิสิต ────────────────────────────────────────────────
  const handleEditStudent = async () => {
    if (!editStudentModal) return
    if (!editStudentForm.name.trim()) return alert('กรุณากรอกชื่อ')
    setEditStudentSaving(true)
    try {
      const { error } = await supabase.from('students').update({
        name:       editStudentForm.name.trim(),
        department: editStudentForm.department,
        faculty:    editStudentForm.faculty,
        major:      editStudentForm.major.trim() || null,
      }).eq('student_id', editStudentModal.student_id)
      if (error) throw error
      setEditStudentModal(null)
      await loadStudents()
    } catch (e) {
      alert('แก้ไขไม่สำเร็จ: ' + (e as Error).message)
    } finally { setEditStudentSaving(false) }
  }

  const handleLogin = async () => {
    try {
      const res = await fetch('/api/admin/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username: userInput, password: pwInput }),
      })
      if (res.ok) {
        localStorage.setItem('admin_authed', '1'); setAuthed(true)
      } else {
        setPwError(true); setTimeout(() => setPwError(false), 2000)
      }
    } catch {
      setPwError(true); setTimeout(() => setPwError(false), 2000)
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const filteredOverview = overviewDept
    ? overview.filter(o => o.student.department === overviewDept)
    : overview

  const q = (s: string) => s.toLowerCase()
  const filteredStudentsIndividual = searchIndividual
    ? students.filter(s => q(s.name).includes(q(searchIndividual)) || s.student_id.includes(searchIndividual))
    : students
  const filteredStudentsManage = searchManage
    ? students.filter(s => q(s.name).includes(q(searchManage)) || s.student_id.includes(searchManage))
    : students

  // ── Login UI ───────────────────────────────────────────────────────────────
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
            <input type="text" className={inputCls} placeholder="กรอกชื่อผู้ใช้" value={userInput}
              onChange={e => setUserInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
            <input type="password" className={inputCls} placeholder="กรอกรหัสผ่าน" value={pwInput}
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

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
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

        {/* Month selector + tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">เดือน</label>
              <input type="month" className={inputCls + ' w-auto'}
                value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); setSelectedDate('') }} />
            </div>
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

        {/* ── Tab: Individual ─────────────────────────────────────────────── */}
        {tab === 'individual' && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-700 text-sm mb-4">เลือกนิสิต</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative">
                  <label className="block text-xs text-gray-500 mb-1">นิสิต</label>
                  <div className="relative">
                    <input
                      className={inputCls}
                      placeholder="พิมพ์ชื่อหรือรหัสนิสิต..."
                      value={searchIndividual}
                      onChange={e => {
                        setSearchIndividual(e.target.value)
                        setSelectedStudentId('')
                        setShowStudentDropdown(true)
                      }}
                      onFocus={() => setShowStudentDropdown(true)}
                      onBlur={() => setTimeout(() => setShowStudentDropdown(false), 150)}
                      autoComplete="off"
                    />
                    {searchIndividual && (
                      <button
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onMouseDown={e => { e.preventDefault(); setSearchIndividual(''); setSelectedStudentId(''); }}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {showStudentDropdown && filteredStudentsIndividual.length > 0 && (
                    <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                      {filteredStudentsIndividual.map(s => (
                        <li key={s.student_id}
                          className={`px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50 hover:text-indigo-700 ${selectedStudentId === s.student_id ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-700'}`}
                          onMouseDown={() => {
                            setSelectedStudentId(s.student_id)
                            setSearchIndividual(`${s.name} (${s.student_id})`)
                            setShowStudentDropdown(false)
                          }}>
                          <span className="font-medium">{s.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{s.student_id}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {showStudentDropdown && searchIndividual && filteredStudentsIndividual.length === 0 && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-3 text-sm text-gray-400">
                      ไม่พบนิสิต
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">วันที่ (เฉพาะวัน)</label>
                  <input type="date" className={inputCls} value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)} />
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
                  {/* NEW: เพิ่ม Log */}
                  {selectedStudentId && !selectedDate && (
                    <button onClick={() => { setAddLogForm({ date: todayThai(), check_in: '', check_out: '', work_summary: '' }); setAddLogOpen(true) }}
                      className="px-3 py-2.5 border border-indigo-300 text-indigo-600 hover:bg-indigo-50 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      เพิ่ม Log
                    </button>
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
                    { label: 'Work Days',   value: `${summary.totalDays}`,                          color: 'bg-blue-50 text-blue-700 border-blue-100' },
                    { label: 'Total Hours', value: `${summary.totalHours}h ${summary.totalMinutes}m`, color: 'bg-green-50 text-green-700 border-green-100' },
                    { label: 'Tasks',       value: `${summary.taskCount}`,                          color: 'bg-purple-50 text-purple-700 border-purple-100' },
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
                  <button onClick={handleExportPDF} disabled={!!selectedDate}
                    className="bg-gray-800 hover:bg-gray-900 disabled:opacity-40 text-white font-medium px-5 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors"
                    title={selectedDate ? 'Export PDF ใช้ได้เฉพาะมุมมองรายเดือน' : ''}>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export PDF
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
                          <th className="px-3 py-3 text-center font-medium w-10">ลำดับ</th>
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
                            <td className="text-center text-xs text-gray-300" style={{ padding: '12px 8px', lineHeight: 1.8 }}>{idx + 1}</td>
                            <td className="text-gray-600 whitespace-nowrap" style={{ padding: '12px 16px', lineHeight: 1.8 }}>{fmtDate(log.check_in)}</td>
                            <td className="font-medium text-green-600" style={{ padding: '12px 16px', lineHeight: 1.8 }}>{fmtTime(log.check_in)}</td>
                            <td className="font-medium text-rose-500" style={{ padding: '12px 16px', lineHeight: 1.8 }}>
                              {log.check_out ? fmtTime(log.check_out) : <span className="text-yellow-500">ยังไม่ออก</span>}
                            </td>
                            <td className="text-gray-600" style={{ padding: '12px 16px', lineHeight: 1.8 }}>
                              {log.durationMinutes > 0 ? `${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m` : '-'}
                            </td>
                            <td className="text-gray-600 max-w-xs" style={{ padding: '12px 16px', lineHeight: 1.8 }}>
                              <div className="truncate">{log.work_summary || '-'}</div>
                            </td>
                            <td style={{ padding: '12px 16px', lineHeight: 1.8 }}>
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

            {/* Multi-month stats */}
            {selectedStudentId && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
                <h2 className="font-semibold text-gray-700 text-sm">สถิติย้อนหลังหลายเดือน</h2>
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">จากเดือน</label>
                    <input type="month" className={inputCls + ' w-auto'}
                      value={rangeStart} onChange={e => { setRangeStart(e.target.value); setMultiStats(null) }} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">ถึงเดือน</label>
                    <input type="month" className={inputCls + ' w-auto'}
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
                            {(() => { const t = multiStats.reduce((s, m) => s + m.hours * 60 + m.minutes, 0); return `${Math.floor(t / 60)}h ${t % 60}m` })()}
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

        {/* ── Tab: Overview ───────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* NEW: department filter */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">ฝ่าย</label>
                <select className={inputCls + ' w-auto'}
                  value={overviewDept} onChange={e => setOverviewDept(e.target.value)}>
                  <option value="">ทุกฝ่าย</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <button onClick={fetchOverview} disabled={overviewLoading}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg text-sm transition-colors ml-auto">
                {overviewLoading ? 'กำลังโหลด...' : `ดูภาพรวม ${selectedMonth}`}
              </button>
            </div>

            {filteredOverview.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-700 text-sm">ภาพรวมการลงเวลาทุกคน</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selectedMonth} — {filteredOverview.length} คน
                    {overviewDept && ` (ฝ่าย ${overviewDept})`}
                  </p>
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
                      {filteredOverview.map(({ student, totalDays, totalHours, totalMinutes, taskCount }) => (
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
                            <button onClick={() => { setTab('individual'); setSelectedStudentId(student.student_id) }}
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

        {/* ── Tab: Manage ─────────────────────────────────────────────────── */}
        {tab === 'manage' && (
          <div className="space-y-4">
            {/* NEW: เพิ่มนิสิต button */}
            <div className="flex justify-end">
              <button onClick={() => setAddStudentOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                เพิ่มนิสิตใหม่
              </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-700 text-sm">จัดการนิสิต</h2>
                    <p className="text-xs text-gray-400 mt-0.5">ลบนิสิตจะลบข้อมูลลงเวลาทั้งหมดของนิสิตคนนั้นด้วย</p>
                  </div>
                  <span className="text-xs text-gray-400">{filteredStudentsManage.length} / {students.length} คน</span>
                </div>
                <input
                  className={inputCls}
                  placeholder="ค้นหาชื่อหรือรหัสนิสิต..."
                  value={searchManage}
                  onChange={e => setSearchManage(e.target.value)}
                />
              </div>
              {students.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">ไม่มีข้อมูลนิสิต</div>
              ) : filteredStudentsManage.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">ไม่พบนิสิตที่ค้นหา</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">ชื่อ-นามสกุล</th>
                      <th className="px-4 py-3 text-left font-medium">รหัสนิสิต</th>
                      <th className="px-4 py-3 text-left font-medium">ฝ่าย</th>
                      <th className="px-4 py-3 text-left font-medium">คณะ / สาขา</th>
                      <th className="px-4 py-3 text-center font-medium">PIN</th>
                      <th className="px-4 py-3 text-left font-medium">จัดการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredStudentsManage.map(s => (
                      <tr key={s.student_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{s.name}</td>
                        <td className="px-4 py-3 text-gray-500">{s.student_id}</td>
                        <td className="px-4 py-3">
                          <span className="bg-indigo-50 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{s.department}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-xs">
                          <div>{s.faculty ?? <span className="text-gray-300">-</span>}</div>
                          {s.major && <div className="text-gray-400">{s.major}</div>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s.pin ? (
                            <div className="flex items-center justify-center gap-1.5">
                              <span className="text-green-600 text-xs font-mono font-medium">
                                {revealedPins.has(s.student_id) ? s.pin : '••••'}
                              </span>
                              <button onClick={() => togglePinReveal(s.student_id)}
                                className="text-gray-400 hover:text-gray-600 transition-colors">
                                {revealedPins.has(s.student_id)
                                  ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                  : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                }
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">ไม่มี</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-3">
                            <button onClick={() => { setEditStudentModal(s); setEditStudentForm({ name: s.name, department: s.department, faculty: s.faculty ?? FACULTIES[0], major: s.major ?? '' }) }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">แก้ไข</button>
                            <button onClick={() => { setPinModal({ student_id: s.student_id, name: s.name }); setPinInput(s.pin ?? '') }}
                              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                              {s.pin ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}
                            </button>
                            <button onClick={() => handleDeleteStudent(s)}
                              className="text-xs text-red-500 hover:text-red-700 font-medium">ลบ</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Modal: Edit Log ──────────────────────────────────────────────────── */}
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
              <input type="datetime-local" className={inputCls}
                value={editForm.check_in} onChange={e => setEditForm(f => ({ ...f, check_in: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เวลาออก (เวลาไทย)</label>
              <input type="datetime-local" className={inputCls}
                value={editForm.check_out} onChange={e => setEditForm(f => ({ ...f, check_out: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สรุปงาน</label>
              <textarea rows={3} className={inputCls + ' resize-none'}
                value={editForm.work_summary} onChange={e => setEditForm(f => ({ ...f, work_summary: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditingLog(null)}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleEditSave} disabled={editSaving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {editSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add Student ───────────────────────────────────────────────── */}
      {addStudentOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">เพิ่มนิสิตใหม่</h3>
              <button onClick={() => setAddStudentOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">รหัสนิสิต <span className="text-red-400">*</span></label>
              <input type="text" className={inputCls} placeholder="เช่น 6412345678"
                value={addStudentForm.student_id}
                onChange={e => setAddStudentForm(f => ({ ...f, student_id: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล <span className="text-red-400">*</span></label>
              <input type="text" className={inputCls} placeholder="ชื่อ นามสกุล"
                value={addStudentForm.name}
                onChange={e => setAddStudentForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ฝ่าย</label>
              <select className={inputCls} value={addStudentForm.department}
                onChange={e => setAddStudentForm(f => ({ ...f, department: e.target.value }))}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">คณะ</label>
              <select className={inputCls} value={addStudentForm.faculty}
                onChange={e => setAddStudentForm(f => ({ ...f, faculty: e.target.value }))}>
                {FACULTIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สาขาวิชา</label>
              <input type="text" className={inputCls} placeholder="กรอกชื่อสาขาวิชาเต็ม"
                value={addStudentForm.major}
                onChange={e => setAddStudentForm(f => ({ ...f, major: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN (4 หลัก, ไม่บังคับ)</label>
              <input type="text" inputMode="numeric" maxLength={4} className={inputCls}
                placeholder="ไม่กรอก = ไม่มี PIN"
                value={addStudentForm.pin}
                onChange={e => setAddStudentForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '').slice(0, 4) }))} />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setAddStudentOpen(false)}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleAddStudent} disabled={addStudentSaving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {addStudentSaving ? 'กำลังเพิ่ม...' : 'เพิ่มนิสิต'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add Log ───────────────────────────────────────────────────── */}
      {addLogOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800">เพิ่ม Log ย้อนหลัง</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {students.find(s => s.student_id === selectedStudentId)?.name}
                </p>
              </div>
              <button onClick={() => setAddLogOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ <span className="text-red-400">*</span></label>
              <input type="date" className={inputCls}
                value={addLogForm.date}
                onChange={e => setAddLogForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เวลาเข้า (ไทย) <span className="text-red-400">*</span></label>
                <input type="time" className={inputCls}
                  value={addLogForm.check_in}
                  onChange={e => setAddLogForm(f => ({ ...f, check_in: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">เวลาออก (ไทย)</label>
                <input type="time" className={inputCls}
                  value={addLogForm.check_out}
                  onChange={e => setAddLogForm(f => ({ ...f, check_out: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สรุปงาน</label>
              <textarea rows={2} className={inputCls + ' resize-none'} placeholder="งานที่ทำ..."
                value={addLogForm.work_summary}
                onChange={e => setAddLogForm(f => ({ ...f, work_summary: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setAddLogOpen(false)}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleAddLog} disabled={addLogSaving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {addLogSaving ? 'กำลังเพิ่ม...' : 'เพิ่ม Log'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Edit Student ─────────────────────────────────────────────── */}
      {editStudentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800">แก้ไขข้อมูลนิสิต</h3>
                <p className="text-xs text-gray-400 mt-0.5">{editStudentModal.student_id}</p>
              </div>
              <button onClick={() => setEditStudentModal(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อ-นามสกุล</label>
              <input type="text" className={inputCls} value={editStudentForm.name}
                onChange={e => setEditStudentForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ฝ่าย</label>
              <select className={inputCls} value={editStudentForm.department}
                onChange={e => setEditStudentForm(f => ({ ...f, department: e.target.value }))}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">คณะ</label>
              <select className={inputCls} value={editStudentForm.faculty}
                onChange={e => setEditStudentForm(f => ({ ...f, faculty: e.target.value }))}>
                {FACULTIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สาขาวิชา</label>
              <input type="text" className={inputCls} placeholder="กรอกชื่อสาขาวิชาเต็ม"
                value={editStudentForm.major}
                onChange={e => setEditStudentForm(f => ({ ...f, major: e.target.value }))} />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditStudentModal(null)}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleEditStudent} disabled={editStudentSaving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {editStudentSaving ? 'กำลังบันทึก...' : 'บันทึก'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Set PIN ───────────────────────────────────────────────────── */}
      {pinModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800">ตั้ง PIN</h3>
                <p className="text-xs text-gray-400 mt-0.5">{pinModal.name}</p>
              </div>
              <button onClick={() => { setPinModal(null); setPinInput('') }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN ใหม่ (4 หลัก)</label>
              <input type="text" inputMode="numeric" maxLength={4} className={inputCls + ' tracking-widest text-center text-xl'}
                placeholder="- - - -"
                value={pinInput}
                onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              <p className="text-xs text-gray-400 mt-1">เว้นว่างไว้เพื่อลบ PIN ออก</p>
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setPinModal(null); setPinInput('') }}
                className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleSetPin} disabled={pinSaving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">
                {pinSaving ? 'กำลังบันทึก...' : 'บันทึก PIN'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
