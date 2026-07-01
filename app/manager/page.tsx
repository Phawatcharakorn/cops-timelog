'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, type Student, type TimeLog, type Announcement } from '@/lib/supabase'
import { format, differenceInMinutes } from 'date-fns'
import { th } from 'date-fns/locale'
import TimeWheelPicker from '@/app/components/TimeWheelPicker'
import RosterTab from '@/app/components/RosterTab'
import SdecHeader from '@/app/components/SdecHeader'
import { showToast } from '@/app/components/Toast'
import AttachmentInput from '@/app/components/AttachmentInput'

const DEPARTMENTS = ['Marketing', 'Event Organizer', 'Human Resource Development', 'Catering', 'Student Assistant', 'อื่นๆ']
function deptOrder(dept: string) { const i = DEPARTMENTS.indexOf(dept); return i === -1 ? 99 : i }
function sortByDept<T extends { department: string; name: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => deptOrder(a.department) - deptOrder(b.department) || a.name.localeCompare(b.name, 'th'))
}
const DEPT_CHIP: Record<string, string> = {
  'Marketing':                  'bg-rose-100 text-rose-700 border-rose-300',
  'Event Organizer':            'bg-violet-100 text-violet-700 border-violet-300',
  'Human Resource Development': 'bg-sky-100 text-sky-700 border-sky-300',
  'Catering':                   'bg-amber-100 text-amber-700 border-amber-300',
  'Student Assistant':          'bg-emerald-100 text-emerald-700 border-emerald-300',
}
const FACULTIES = [
  'คณะพาณิชยนาวีนานาชาติ',
  'คณะเศรษฐศาสตร์ ศรีราชา',
  'คณะวิทยาศาสตร์ ศรีราชา',
  'คณะวิศวกรรมศาสตร์ ศรีราชา',
  'คณะวิทยาการจัดการ',
]

type LogWithDuration = TimeLog & { durationMinutes: number }
type UndoAction = { type: 'delete'; log: TimeLog } | { type: 'edit'; log: TimeLog } | { type: 'add'; id: string }
type Summary = { totalDays: number; totalHours: number; totalMinutes: number; taskCount: number; logs: LogWithDuration[]; student: Student | null; dateFrom: string; dateTo: string }
type StudentOverview = { student: Student; totalDays: number; totalHours: number; totalMinutes: number; taskCount: number }
type EditForm = { check_in: string; check_out: string; work_summary: string }
type MonthStat = { month: string; days: number; hours: number; minutes: number; tasks: number }
type AddStudentForm = { student_id: string; name: string; nickname: string; department: string; faculty: string; major: string; pin: string }
type AddLogForm = { date: string; check_in: string; check_out: string; check_out_date: string; work_summary: string; photo_url: string | null }

function fmtTime(iso: string) { return format(new Date(iso), 'HH:mm', { locale: th }) }
function fmtDate(iso: string) { return format(new Date(iso), 'd MMM yyyy', { locale: th }) }
function toDatetimeLocal(iso: string) { return format(new Date(iso), "yyyy-MM-dd'T'HH:mm") }
function fromDatetimeLocal(local: string) { if (!local) return null; return new Date(local).toISOString() }
function thaiToUTC(date: string, time: string) { return new Date(`${date}T${time}:00+07:00`).toISOString() }
function todayThai() { return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10) }

const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400'

export default function ManagerPage() {
  const [authed, setAuthed]     = useState(false)
  const [mgrName, setMgrName]   = useState('')
  const [mgrDept, setMgrDept]   = useState<string | null>(null)
  const [userInput, setUserInput] = useState('')
  const [pwInput, setPwInput]     = useState('')
  const [pwError, setPwError]     = useState(false)
  const [tab, setTab] = useState<'individual' | 'overview' | 'manage' | 'announce' | 'roster'>('individual')

  const [announcements, setAnnouncements]   = useState<Announcement[]>([])
  const [annLoading, setAnnLoading]         = useState(false)
  const [annTitle, setAnnTitle]             = useState('')
  const [annBody, setAnnBody]               = useState('')
  const [annExpires, setAnnExpires]         = useState('')
  const [annSaving, setAnnSaving]           = useState(false)
  const [annError, setAnnError]             = useState('')

  // ── Roster ────────────────────────────────────────────────────────────────
  const [rosterStudents, setRosterStudents]   = useState<Student[]>([])
  const [rosterLoading, setRosterLoading]     = useState(false)

  const [students, setStudents]                   = useState<Student[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [summary, setSummary]   = useState<Summary | null>(null)
  const [loading, setLoading]   = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const [overview, setOverview]               = useState<StudentOverview[]>([])
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [overviewDept, setOverviewDept]       = useState('')

  const [rangeStart, setRangeStart]   = useState('')
  const [rangeEnd, setRangeEnd]       = useState('')
  const [multiStats, setMultiStats]   = useState<MonthStat[] | null>(null)
  const [multiLoading, setMultiLoading] = useState(false)

  const [editingLog, setEditingLog] = useState<TimeLog | null>(null)
  const [editForm, setEditForm]     = useState<EditForm>({ check_in: '', check_out: '', work_summary: '' })
  const [editSaving, setEditSaving] = useState(false)

  const [addStudentOpen, setAddStudentOpen]   = useState(false)
  const [addStudentForm, setAddStudentForm]   = useState<AddStudentForm>({ student_id: '', name: '', nickname: '', department: 'Marketing', faculty: FACULTIES[0], major: '', pin: '' })
  const [addStudentSaving, setAddStudentSaving] = useState(false)
  const [addStudentCustomDept, setAddStudentCustomDept] = useState('')

  const [addLogOpen, setAddLogOpen]   = useState(false)
  const [addLogForm, setAddLogForm]   = useState<AddLogForm>({ date: todayThai(), check_in: '09:00', check_out: '', check_out_date: '', work_summary: '', photo_url: null })
  const [addLogSaving, setAddLogSaving] = useState(false)

  const [pinModal, setPinModal] = useState<{ student_id: string; name: string } | null>(null)
  const [pinInput, setPinInput] = useState('')
  const [pinSaving, setPinSaving] = useState(false)

  const [rejectModal, setRejectModal]   = useState<{ id: string } | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectSaving, setRejectSaving] = useState(false)

  // Guards the per-row action buttons (อนุมัติ/ตีกลับ/จ่าย/ฯลฯ) against a 2nd
  // click while the 1st is still in flight. Uses a ref for the actual check
  // (synchronous, immune to React batching two rapid clicks against the same
  // stale state snapshot) and state only to drive the disabled/opacity UI.
  const busyLogIdRef = useRef<string | null>(null)
  const [busyLogId, setBusyLogId] = useState<string | null>(null)

  const [undoAction, setUndoAction] = useState<UndoAction | null>(null)

  const [searchIndividual, setSearchIndividual]   = useState('')
  const [showStudentDropdown, setShowStudentDropdown] = useState(false)
  const [searchManage, setSearchManage]           = useState('')

  const [revealedPins, setRevealedPins] = useState<Set<string>>(new Set())
  const togglePinReveal = (id: string) =>
    setRevealedPins(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const [editStudentModal, setEditStudentModal]   = useState<Student | null>(null)
  const [editStudentForm, setEditStudentForm]     = useState({ student_id: '', name: '', department: 'Marketing', faculty: FACULTIES[0], major: '' })
  const [editStudentSaving, setEditStudentSaving] = useState(false)
  const [editStudentCustomDept, setEditStudentCustomDept] = useState('')

  const [feedbackModal, setFeedbackModal]     = useState<{ campaignId: string; message: string } | null>(null)
  const [feedbackRating, setFeedbackRating]   = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSaving, setFeedbackSaving]   = useState(false)

  const [settingsOpen, setSettingsOpen]       = useState(false)
  const [settingsTab, setSettingsTab]         = useState<'info' | 'password'>('info')
  const [pwCurrent, setPwCurrent]             = useState('')
  const [pwNew, setPwNew]                     = useState('')
  const [pwConfirm, setPwConfirm]             = useState('')
  const [pwSavingSettings, setPwSavingSettings] = useState(false)
  const [pwSettingsError, setPwSettingsError] = useState('')
  const [pwSettingsSuccess, setPwSettingsSuccess] = useState(false)
  const [editingName, setEditingName]   = useState(false)
  const [nameInput, setNameInput]       = useState('')
  const [nameSaving, setNameSaving]     = useState(false)
  const [nameError, setNameError]       = useState('')

  useEffect(() => {
    if (localStorage.getItem('mgr_authed') === '1') {
      setAuthed(true)
      setMgrName(localStorage.getItem('mgr_name') || '')
      setMgrDept(localStorage.getItem('mgr_dept') || null)
    }
  }, [])

  const checkFeedback = useCallback(async () => {
    try {
      const res = await fetch('/api/feedback/campaign')
      const campaign = await res.json()
      if (!campaign?.id) return
      const username = localStorage.getItem('mgr_username') || ''
      const r = await fetch(`/api/feedback/response?campaign_id=${campaign.id}&respondent_type=manager&respondent_id=${username}`)
      const existing = await r.json()
      if (existing.length === 0) {
        setFeedbackRating(0); setFeedbackComment('')
        setFeedbackModal({ campaignId: campaign.id, message: campaign.message })
      }
    } catch { /* ignore */ }
  }, [])

  const loadStudents = useCallback(async () => {
    let q = supabase.from('students').select('*').order('name')
    if (mgrDept) q = q.eq('department', mgrDept)
    const { data } = await q
    if (data) setStudents(data)
  }, [mgrDept])

  useEffect(() => { if (authed) { loadStudents(); checkFeedback() } }, [authed, loadStudents, checkFeedback])

  const fetchSummary = useCallback(async (overrideId?: string) => {
    const sid = overrideId ?? selectedStudentId
    if (!sid) return
    setLoading(true)
    try {
      const start = dateFrom ? new Date(dateFrom + 'T00:00:00+07:00').toISOString() : null
      const end   = new Date(dateTo + 'T23:59:59+07:00').toISOString()
      let logsQ = supabase.from('time_logs').select('*').eq('student_id', sid)
      if (start) logsQ = logsQ.gte('check_in', start)
      logsQ = logsQ.lte('check_in', end).order('check_in', { ascending: true })
      const [{ data: logs }, { data: student }] = await Promise.all([
        logsQ,
        supabase.from('students').select('*').eq('student_id', sid).single(),
      ])
      const processed: LogWithDuration[] = (logs ?? []).map(log => ({ ...log, durationMinutes: log.check_out ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in)) : 0 }))
      const toThaiDate = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10)
      const totalMin = processed.reduce((s, l) => s + Math.max(0, l.durationMinutes), 0)
      setSummary({ totalDays: new Set(processed.map(l => toThaiDate(l.check_in))).size, totalHours: Math.floor(totalMin / 60), totalMinutes: totalMin % 60, taskCount: processed.length, logs: processed, student, dateFrom, dateTo })
      setCurrentPage(1)
    } finally { setLoading(false) }
  }, [selectedStudentId, dateFrom, dateTo])

  const fetchOverview = useCallback(async () => {
    setOverviewLoading(true)
    try {
      const start = dateFrom ? new Date(dateFrom + 'T00:00:00+07:00').toISOString() : null
      const end   = new Date(dateTo + 'T23:59:59+07:00').toISOString()
      let q = supabase.from('students').select('*').order('name')
      if (mgrDept) q = q.eq('department', mgrDept)
      let logsQ = supabase.from('time_logs').select('*')
      if (start) logsQ = logsQ.gte('check_in', start)
      logsQ = logsQ.lte('check_in', end)
      const [{ data: allStudents }, { data: allLogs }] = await Promise.all([q, logsQ])
      const result: StudentOverview[] = (allStudents ?? []).map(s => {
        const logs = (allLogs ?? []).filter(l => l.student_id === s.student_id)
        const totalMin = logs.reduce((sum, l) => sum + (l.check_out ? differenceInMinutes(new Date(l.check_out), new Date(l.check_in)) : 0), 0)
        return { student: s, totalDays: new Set(logs.map(l => new Date(new Date(l.check_in).getTime() + 7 * 3600000).toISOString().slice(0, 10))).size, totalHours: Math.floor(totalMin / 60), totalMinutes: totalMin % 60, taskCount: logs.length }
      })
      setOverview(result)
    } finally { setOverviewLoading(false) }
  }, [dateFrom, dateTo, mgrDept])

  // Live refresh: auto-refetch when time_logs changes anywhere (self-report
  // submitted, another manager/dev approves, edits, etc.) instead of needing
  // a manual "รีเฟรช" click. Refetches through the same functions the manual
  // actions already use — no separate state-patching logic to keep in sync.
  const overviewRef = useRef(overview)
  useEffect(() => { overviewRef.current = overview }, [overview])

  useEffect(() => {
    if (!authed) return
    const channel = supabase
      .channel('manager-time-logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_logs' }, payload => {
        const changedId = (payload.new as { student_id?: string } | null)?.student_id
          ?? (payload.old as { student_id?: string } | null)?.student_id
        if (changedId && changedId === selectedStudentId) void fetchSummary()
        if (overviewRef.current.length > 0) void fetchOverview()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [authed, selectedStudentId, fetchSummary, fetchOverview])

  const fetchMultiStats = useCallback(async () => {
    if (!selectedStudentId || !rangeStart || !rangeEnd) return
    setMultiLoading(true)
    try {
      const TZ = 7 * 3600000
      const [sy, sm] = rangeStart.split('-').map(Number)
      const [ey, em] = rangeEnd.split('-').map(Number)
      const { data: logs } = await supabase.from('time_logs').select('*').eq('student_id', selectedStudentId).gte('check_in', new Date(Date.UTC(sy, sm - 1, 1) - TZ).toISOString()).lte('check_in', new Date(Date.UTC(ey, em, 1) - TZ - 1).toISOString()).order('check_in', { ascending: true })
      const grouped: Record<string, { dates: Set<string>; totalMin: number; tasks: number }> = {}
      for (const log of logs ?? []) {
        const thai = new Date(new Date(log.check_in).getTime() + TZ)
        const key = thai.toISOString().slice(0, 7); const day = thai.toISOString().slice(0, 10)
        if (!grouped[key]) grouped[key] = { dates: new Set(), totalMin: 0, tasks: 0 }
        grouped[key].dates.add(day)
        grouped[key].totalMin += log.check_out ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in)) : 0
        grouped[key].tasks += 1
      }
      setMultiStats(Object.entries(grouped).map(([month, g]) => ({ month, days: g.dates.size, hours: Math.floor(g.totalMin / 60), minutes: g.totalMin % 60, tasks: g.tasks })))
    } finally { setMultiLoading(false) }
  }, [selectedStudentId, rangeStart, rangeEnd])

  const mgrUsername = () => (typeof window !== 'undefined' ? localStorage.getItem('mgr_username') || '' : '')

  const fetchAnnouncements = async () => {
    setAnnLoading(true)
    try {
      const res = await fetch('/api/announcements')
      setAnnouncements(await res.json())
    } finally { setAnnLoading(false) }
  }

  const handlePostAnnouncement = async () => {
    if (!annTitle.trim() || !annBody.trim()) return setAnnError('กรุณากรอกหัวข้อและเนื้อหา')
    setAnnSaving(true); setAnnError('')
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mgr-username': mgrUsername() },
        body: JSON.stringify({ title: annTitle, body: annBody, author: mgrName || mgrUsername(), expires_at: annExpires || null }),
      })
      if (!res.ok) { const d = await res.json(); setAnnError(d.error || 'เกิดข้อผิดพลาด'); return }
      setAnnTitle(''); setAnnBody(''); setAnnExpires('')
      await fetchAnnouncements()
    } catch { setAnnError('เกิดข้อผิดพลาด') } finally { setAnnSaving(false) }
  }

  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm('ลบประกาศนี้?')) return
    await fetch(`/api/announcements/${id}`, { method: 'DELETE', headers: { 'x-mgr-username': mgrUsername() } })
    setAnnouncements(prev => prev.filter(a => a.id !== id))
  }

  const fetchRoster = useCallback(async () => {
    setRosterLoading(true)
    try {
      let q = supabase.from('students').select('*').order('gen', { ascending: true, nullsFirst: false }).order('name')
      if (mgrDept) q = q.eq('department', mgrDept)
      const { data } = await q
      setRosterStudents(data ?? [])
    } finally { setRosterLoading(false) }
  }, [mgrDept])

  const handleExportCSV = (useRange = false) => {
    const token = localStorage.getItem('mgr_token') || ''
    const base  = useRange && rangeStart && rangeEnd
      ? `/api/export-csv?studentId=${selectedStudentId}&startMonth=${rangeStart}&endMonth=${rangeEnd}`
      : `/api/export-csv?studentId=${selectedStudentId}&from=${dateFrom}&to=${dateTo}`
    const url = `${base}&token=${encodeURIComponent(token)}`
    const a = document.createElement('a'); a.href = url; a.download = `timelog_${selectedStudentId}.xlsx`; a.click()
  }
  const handleExportPDF = () => {
    if (!summary) return
    const params = new URLSearchParams({ studentId: selectedStudentId, to: dateTo })
    if (dateFrom) params.set('from', dateFrom)
    window.open(`/print?${params}`, '_blank')
  }

  const handleDeleteStudent = async (student: Student) => {
    if (!confirm(`ลบ "${student.name}" (${student.student_id}) และข้อมูลลงเวลาทั้งหมด?`)) return
    await supabase.from('time_logs').delete().eq('student_id', student.student_id)
    await supabase.from('students').delete().eq('student_id', student.student_id)
    if (selectedStudentId === student.student_id) { setSelectedStudentId(''); setSummary(null) }
    await loadStudents()
  }

  const openEdit = (log: TimeLog) => { setEditingLog(log); setEditForm({ check_in: toDatetimeLocal(log.check_in), check_out: log.check_out ? toDatetimeLocal(log.check_out) : '', work_summary: log.work_summary ?? '' }) }

  const handleEditSave = async () => {
    if (!editingLog) return
    if (editForm.check_out) { if (new Date(editForm.check_out) <= new Date(editForm.check_in)) { showToast('เวลาออกต้องมากกว่าเวลาเข้า', 'warning'); return } }
    const prevLog = editingLog; setEditSaving(true)
    try {
      const { error } = await supabase.from('time_logs').update({ check_in: fromDatetimeLocal(editForm.check_in) ?? editingLog.check_in, check_out: editForm.check_out ? fromDatetimeLocal(editForm.check_out) : null, work_summary: editForm.work_summary || null }).eq('id', editingLog.id)
      if (error) throw error
      showToast('บันทึกเรียบร้อยแล้ว', 'success')
      setUndoAction({ type: 'edit', log: prevLog }); setEditingLog(null); await fetchSummary(); if (overview.length > 0) void fetchOverview()
    } catch (e) { showToast('บันทึกไม่สำเร็จ: ' + (e as Error).message, 'error') } finally { setEditSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('ลบรายการนี้?')) return
    const logToDelete = summary?.logs.find(l => l.id === id)
    await supabase.from('time_logs').delete().eq('id', id)
    if (logToDelete) setUndoAction({ type: 'delete', log: logToDelete })
    await fetchSummary(); if (overview.length > 0) void fetchOverview()
  }

  const handleAddStudent = async () => {
    const { student_id, name, nickname, department, faculty, major, pin } = addStudentForm
    if (!student_id.trim() || !name.trim()) { showToast('กรุณากรอกรหัสนิสิตและชื่อ', 'warning'); return }
    if (pin && (pin.length !== 4 || !/^\d{4}$/.test(pin))) { showToast('PIN ต้องเป็นตัวเลข 4 หลัก', 'warning'); return }
    const deptToSave = department === 'อื่นๆ' ? (addStudentCustomDept.trim() || 'อื่นๆ') : department
    setAddStudentSaving(true)
    try {
      const { error } = await supabase.from('students').insert({ student_id: student_id.trim(), name: name.trim(), nickname: nickname.trim() || null, department: deptToSave, faculty, major: major.trim() || null, pin: pin || null })
      if (error) throw error
      showToast('เพิ่มนิสิตเรียบร้อยแล้ว', 'success')
      setAddStudentOpen(false); setAddStudentForm({ student_id: '', name: '', nickname: '', department: 'Marketing', faculty: FACULTIES[0], major: '', pin: '' }); setAddStudentCustomDept('')
      await loadStudents()
    } catch (e) { showToast('เพิ่มนิสิตไม่สำเร็จ: ' + (e as Error).message, 'error') } finally { setAddStudentSaving(false) }
  }

  const handleAddLog = async () => {
    const { date, check_in, check_out, check_out_date, work_summary, photo_url } = addLogForm
    if (!date || !check_in) { showToast('กรุณากรอกวันที่และเวลาเข้า', 'warning'); return }
    const outDate = check_out_date || date
    if (check_out) {
      const inISO  = thaiToUTC(date, check_in)
      const outISO = thaiToUTC(outDate, check_out)
      if (outISO <= inISO) { showToast('เวลาออกต้องมากกว่าเวลาเข้า', 'warning'); return }
    }
    setAddLogSaving(true)
    try {
      const { data: newLog, error } = await supabase.from('time_logs').insert({
        student_id:   selectedStudentId,
        check_in:     thaiToUTC(date, check_in),
        check_out:    check_out ? thaiToUTC(outDate, check_out) : null,
        work_summary: work_summary || null,
        photo_url,
      }).select('id').single()
      if (error) throw error
      if (newLog) setUndoAction({ type: 'add', id: newLog.id })
      showToast('เพิ่ม Log เรียบร้อยแล้ว', 'success')
      setAddLogOpen(false); setAddLogForm({ date: todayThai(), check_in: '09:00', check_out: '', check_out_date: '', work_summary: '', photo_url: null }); await fetchSummary(); if (overview.length > 0) void fetchOverview()
    } catch (e) { showToast('เพิ่ม Log ไม่สำเร็จ: ' + (e as Error).message, 'error') } finally { setAddLogSaving(false) }
  }

  const handleSetPin = async () => {
    if (!pinModal) return
    if (pinInput && (pinInput.length !== 4 || !/^\d{4}$/.test(pinInput))) { showToast('PIN ต้องเป็นตัวเลข 4 หลัก', 'warning'); return }
    setPinSaving(true)
    try {
      const { error } = await supabase.from('students').update({ pin: pinInput || null }).eq('student_id', pinModal.student_id)
      if (error) throw error
      showToast('ตั้ง PIN เรียบร้อยแล้ว', 'success')
      setPinModal(null); setPinInput(''); await loadStudents()
    } catch (e) { showToast('ตั้ง PIN ไม่สำเร็จ: ' + (e as Error).message, 'error') } finally { setPinSaving(false) }
  }

  const handleUndo = async () => {
    if (!undoAction) return
    try {
      if (undoAction.type === 'delete') { const { log } = undoAction; await supabase.from('time_logs').insert({ id: log.id, student_id: log.student_id, check_in: log.check_in, check_out: log.check_out, work_summary: log.work_summary }) }
      else if (undoAction.type === 'edit') { await supabase.from('time_logs').update({ check_in: undoAction.log.check_in, check_out: undoAction.log.check_out, work_summary: undoAction.log.work_summary }).eq('id', undoAction.log.id) }
      else if (undoAction.type === 'add') { await supabase.from('time_logs').delete().eq('id', undoAction.id) }
      setUndoAction(null); await fetchSummary(); if (overview.length > 0) void fetchOverview()
    } catch (e) { showToast('ย้อนกลับไม่สำเร็จ: ' + (e as Error).message, 'error') }
  }

  const handleEditStudent = async () => {
    if (!editStudentModal) return
    if (!editStudentForm.name.trim()) { showToast('กรุณากรอกชื่อ', 'warning'); return }
    const deptToSave = editStudentForm.department === 'อื่นๆ' ? (editStudentCustomDept.trim() || 'อื่นๆ') : editStudentForm.department
    setEditStudentSaving(true)
    try {
      const newId = editStudentForm.student_id.trim()
      const { error } = await supabase.from('students').update({ student_id: newId || editStudentModal.student_id, name: editStudentForm.name.trim(), department: deptToSave, faculty: editStudentForm.faculty, major: editStudentForm.major.trim() || null }).eq('student_id', editStudentModal.student_id)
      if (error) throw error
      showToast('แก้ไขข้อมูลเรียบร้อยแล้ว', 'success')
      setEditStudentModal(null); await loadStudents()
    } catch (e) { showToast('แก้ไขไม่สำเร็จ: ' + (e as Error).message, 'error') } finally { setEditStudentSaving(false) }
  }

  const patchLog = (logId: string, patch: Partial<LogWithDuration>) =>
    setSummary(prev => prev ? { ...prev, logs: prev.logs.map(l => l.id === logId ? { ...l, ...patch } : l) } : prev)

  const handleApprove = async (logId: string) => {
    if (busyLogIdRef.current) return
    busyLogIdRef.current = logId
    setBusyLogId(logId)
    try {
      const now = new Date().toISOString()
      patchLog(logId, { status: 'approved', approved_by: mgrName, approved_at: now })
      const { error } = await supabase.from('time_logs').update({ status: 'approved', approved_by: mgrName, approved_at: now }).eq('id', logId)
      if (error) { showToast('อนุมัติไม่สำเร็จ: ' + error.message, 'error'); await fetchSummary(); return }
      showToast('อนุมัติเรียบร้อยแล้ว', 'success')
    } finally { busyLogIdRef.current = null; setBusyLogId(null) }
  }

  const handleUnapprove = async (logId: string) => {
    if (busyLogIdRef.current) return
    busyLogIdRef.current = logId
    setBusyLogId(logId)
    try {
      patchLog(logId, { status: 'pending', approved_by: null, approved_at: null, paid: false, paid_at: null })
      const { error } = await supabase.from('time_logs').update({ status: 'pending', approved_by: null, approved_at: null, paid: false, paid_at: null }).eq('id', logId)
      if (error) { showToast('ยกเลิกอนุมัติไม่สำเร็จ: ' + error.message, 'error'); await fetchSummary(); return }
      showToast('ยกเลิกอนุมัติแล้ว', 'info')
    } finally { busyLogIdRef.current = null; setBusyLogId(null) }
  }

  const handleReject = async () => {
    if (!rejectModal) return
    if (!rejectReason.trim()) { showToast('กรุณาระบุเหตุผลที่ตีกลับ', 'warning'); return }
    setRejectSaving(true)
    try {
      const patch = {
        status: 'pending' as const, approved_by: null, approved_at: null, paid: false, paid_at: null,
        is_rejected: true, rejected_reason: rejectReason.trim(), rejected_at: new Date().toISOString(),
      }
      patchLog(rejectModal.id, patch)
      const { error } = await supabase.from('time_logs').update(patch).eq('id', rejectModal.id)
      if (error) throw error
      showToast('ตีกลับรายการเรียบร้อยแล้ว', 'success')
      setRejectModal(null); setRejectReason('')
      await fetchSummary(); if (overview.length > 0) void fetchOverview()
    } catch (e) { showToast('ตีกลับไม่สำเร็จ: ' + (e as Error).message, 'error') } finally { setRejectSaving(false) }
  }

  const handleUndoReject = async (logId: string) => {
    if (busyLogIdRef.current) return
    busyLogIdRef.current = logId
    setBusyLogId(logId)
    try {
      const patch = { is_rejected: false, rejected_reason: null, rejected_at: null }
      patchLog(logId, patch)
      const { error } = await supabase.from('time_logs').update(patch).eq('id', logId)
      if (error) { showToast('ยกเลิกการตีกลับไม่สำเร็จ: ' + error.message, 'error'); await fetchSummary(); return }
      showToast('ยกเลิกการตีกลับแล้ว', 'info')
    } finally { busyLogIdRef.current = null; setBusyLogId(null) }
  }

  const handlePay = async (logId: string) => {
    if (busyLogIdRef.current) return
    busyLogIdRef.current = logId
    setBusyLogId(logId)
    try {
      const now = new Date().toISOString()
      patchLog(logId, { paid: true, paid_at: now })
      const { error } = await supabase.from('time_logs').update({ paid: true, paid_at: now }).eq('id', logId)
      if (error) { showToast('บันทึกไม่สำเร็จ: ' + error.message, 'error'); await fetchSummary(); return }
      showToast('บันทึกการจ่ายเรียบร้อยแล้ว', 'success')
    } finally { busyLogIdRef.current = null; setBusyLogId(null) }
  }

  const handleUnpay = async (logId: string) => {
    if (busyLogIdRef.current) return
    busyLogIdRef.current = logId
    setBusyLogId(logId)
    try {
      patchLog(logId, { paid: false, paid_at: null })
      const { error } = await supabase.from('time_logs').update({ paid: false, paid_at: null }).eq('id', logId)
      if (error) { showToast('ยกเลิกไม่สำเร็จ: ' + error.message, 'error'); await fetchSummary(); return }
      showToast('ยกเลิกการจ่ายแล้ว', 'info')
    } finally { busyLogIdRef.current = null; setBusyLogId(null) }
  }

  const handleLogin = async () => {
    setPwError(false)
    const res = await fetch('/api/manager/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: userInput, password: pwInput }) })
    if (res.ok) {
      const { name, department, mgrToken } = await res.json()
      localStorage.setItem('mgr_authed', '1'); localStorage.setItem('mgr_name', name)
      localStorage.setItem('mgr_username', userInput); localStorage.setItem('mgr_dept', department || '')
      if (mgrToken) localStorage.setItem('mgr_token', mgrToken)
      setMgrName(name); setMgrDept(department || null); setAuthed(true)
    } else { setPwError(true) }
  }

  const q = (s: string) => s.toLowerCase()
  const filteredIndividual = sortByDept(searchIndividual ? students.filter(s => q(s.name).includes(q(searchIndividual)) || s.student_id.includes(searchIndividual) || (s.nickname && q(s.nickname).includes(q(searchIndividual)))) : students)
  const filteredManage     = sortByDept(searchManage ? students.filter(s => q(s.name).includes(q(searchManage)) || s.student_id.includes(searchManage) || (s.nickname && q(s.nickname).includes(q(searchManage)))) : students)

  // ── Login ─────────────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm p-8 space-y-5">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-700 rounded-xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800">Manager Dashboard</h1>
            <p className="text-sm text-gray-400 mt-1">CoPs — ระบบลงเวลา</p>
          </div>
          {pwError && <div className="bg-red-50 text-red-600 border border-red-200 rounded-lg px-4 py-2 text-sm text-center">ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง</div>}
          <div><label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ใช้</label><input className={inputCls} placeholder="username" value={userInput} onChange={e => setUserInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label><input type="password" className={inputCls} placeholder="password" value={pwInput} onChange={e => setPwInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} /></div>
          <button onClick={handleLogin} className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-xl transition-colors">เข้าสู่ระบบ</button>
          <div className="text-center"><a href="/student" className="text-xs text-gray-400 hover:text-blue-600 transition-colors">กลับหน้าบันทึกเวลา</a></div>
        </div>
      </div>
    )
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  const LOGS_PER_PAGE = 15
  const totalPages = summary ? Math.ceil(summary.logs.length / LOGS_PER_PAGE) : 0
  const paginatedLogs = summary ? summary.logs.slice((currentPage - 1) * LOGS_PER_PAGE, currentPage * LOGS_PER_PAGE) : []

  // ── Main ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <SdecHeader
        subtitle={`${mgrName}${mgrDept ? ` · ${mgrDept}` : ' · ทุกแผนก'}`}
        right={<>
          <button onClick={() => { setSettingsTab('info'); setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwSettingsError(''); setPwSettingsSuccess(false); setSettingsOpen(true) }}
            className="w-8 h-8 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors" title="ตั้งค่า">
            <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
          <a href="/student" className="text-xs text-white/80 hover:text-white font-medium whitespace-nowrap transition-colors">หน้าบันทึก</a>
          <button onClick={() => { ['mgr_authed','mgr_name','mgr_username','mgr_dept','mgr_token'].forEach(k => localStorage.removeItem(k)); setAuthed(false) }}
            className="text-xs text-white/50 hover:text-white/80 whitespace-nowrap transition-colors">ออกจากระบบ</button>
        </>}
      />

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 flex gap-1 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {/* 'roster' tab (รายละเอียด) ซ่อนชั่วคราว — ฟีเจอร์ยังไม่พร้อม */}
          {(['individual', 'overview', 'manage', 'announce'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); if (t === 'announce') fetchAnnouncements() }}
              className={`flex-shrink-0 flex-1 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap min-w-[64px] ${tab === t ? 'bg-blue-700 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}>
              {t === 'individual' ? 'รายบุคคล' : t === 'overview' ? 'ภาพรวม' : t === 'manage' ? 'จัดการนิสิต' : t === 'announce' ? 'ประกาศ' : 'รายละเอียด'}
            </button>
          ))}
        </div>

        {/* Tab panels — key causes remount on switch, triggering tabFadeSlide */}
        <div key={tab} className="tab-content space-y-4 sm:space-y-6">

        {/* ── Individual ──────────────────────────────────────────────────── */}
        {tab === 'individual' && (
          <>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
              <div className="relative">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">นิสิต</label>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                  <input className={inputCls + ' pl-9'} placeholder="พิมพ์ชื่อหรือรหัสนิสิต..." value={searchIndividual}
                    onChange={e => { setSearchIndividual(e.target.value); setSelectedStudentId(''); setShowStudentDropdown(true) }}
                    onFocus={() => setShowStudentDropdown(true)} onBlur={() => setTimeout(() => setShowStudentDropdown(false), 150)} autoComplete="off" />
                  {searchIndividual && (
                    <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      onMouseDown={e => { e.preventDefault(); setSearchIndividual(''); setSelectedStudentId('') }}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
                {showStudentDropdown && filteredIndividual.length > 0 && (
                  <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {filteredIndividual.map(s => (
                      <li key={s.student_id}
                        className={`px-3 py-2.5 text-sm cursor-pointer hover:bg-blue-50 ${selectedStudentId === s.student_id ? 'bg-blue-50' : ''}`}
                        onMouseDown={() => { setSelectedStudentId(s.student_id); setSearchIndividual(`${s.name} (${s.student_id})`); setShowStudentDropdown(false); setUndoAction(null) }}>
                        <div className="flex items-center gap-2">
                          {s.nickname && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border flex-shrink-0 ${DEPT_CHIP[s.department] ?? 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                              {s.nickname}
                            </span>
                          )}
                          <span className="font-medium text-gray-800 truncate">{s.name}</span>
                          <span className="text-xs text-gray-400 ml-auto flex-shrink-0">{s.student_id}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {showStudentDropdown && searchIndividual && filteredIndividual.length === 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-3 text-sm text-gray-400">ไม่พบนิสิต</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-500 mb-1.5">จากวันที่</label><input type="date" className={inputCls} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
                <div><label className="block text-xs font-medium text-gray-500 mb-1.5">ถึงวันที่</label><input type="date" className={inputCls} value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => fetchSummary()} disabled={!selectedStudentId || loading}
                  className="bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2">
                  {loading ? <><svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>กำลังโหลด...</> : 'ดึงข้อมูล'}
                </button>
                <button onClick={() => { setAddLogForm({ date: todayThai(), check_in: '09:00', check_out: '', check_out_date: '', work_summary: '', photo_url: null }); setAddLogOpen(true) }}
                  disabled={!selectedStudentId}
                  className="py-2.5 border-2 border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40 rounded-lg text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  เพิ่ม Log
                </button>
              </div>
            </div>

            {summary && (
              <>
                <div className="grid grid-cols-3 gap-2 sm:gap-4">
                  {[
                    { label: 'Work Days',   value: `${summary.totalDays}`,                            color: 'bg-blue-50 text-blue-700 border-blue-100' },
                    { label: 'Total Hours', value: `${summary.totalHours}h ${summary.totalMinutes}m`, color: 'bg-green-50 text-green-700 border-green-100' },
                    { label: 'Tasks',       value: `${summary.taskCount}`,                            color: 'bg-blue-50 text-blue-700 border-blue-100' },
                  ].map(c => (
                    <div key={c.label} className={`${c.color} border rounded-xl p-3 sm:p-5 text-center`}>
                      <p className="text-xs sm:text-sm font-medium opacity-60 mb-1 sm:mb-3">{c.label}</p>
                      <p className="text-xl sm:text-3xl font-bold leading-none break-all">{c.value}</p>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button onClick={() => handleExportCSV(false)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg text-xs sm:text-sm flex items-center gap-1.5 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Export CSV
                  </button>
                  <button onClick={handleExportPDF} className="bg-gray-800 hover:bg-gray-900 text-white font-medium px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg text-xs sm:text-sm flex items-center gap-1.5 transition-colors">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Export PDF
                  </button>
                </div>
                {undoAction && (
                  <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    <span className="text-sm text-amber-700">{undoAction.type === 'delete' ? '🗑 ลบรายการแล้ว' : undoAction.type === 'edit' ? '✏️ แก้ไขรายการแล้ว' : '➕ เพิ่มรายการแล้ว'}</span>
                    <button onClick={handleUndo} className="text-sm font-semibold text-amber-800 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-3 py-1 rounded-lg transition-colors">↩ ย้อนกลับ</button>
                  </div>
                )}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-700 text-sm">รายการลงเวลา</h2>
                    <p className="text-xs text-gray-400 mt-0.5">{summary.student?.name} — {summary.dateFrom ? (summary.dateFrom === summary.dateTo ? format(new Date(summary.dateFrom), 'd MMMM yyyy', { locale: th }) : `${format(new Date(summary.dateFrom), 'd MMM yyyy', { locale: th })} ถึง ${format(new Date(summary.dateTo), 'd MMM yyyy', { locale: th })}`) : `ทั้งหมด ถึง ${format(new Date(summary.dateTo), 'd MMM yyyy', { locale: th })}`}</p>
                  </div>

                  {/* Mobile card view */}
                  <div className="sm:hidden divide-y divide-gray-100">
                    {summary.logs.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">ไม่มีข้อมูล</div>}
                    {paginatedLogs.map((log, idx) => {
                      const globalIdx = (currentPage - 1) * LOGS_PER_PAGE + idx
                      return (
                      <div key={log.id} className="px-4 py-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs text-gray-400">
                              #{globalIdx + 1} · {fmtDate(log.check_in)}
                              {log.is_self_reported && <span className="ml-1.5 text-blue-500 font-medium">· นิสิตลงเอง</span>}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <span className="text-sm font-semibold text-green-600">{fmtTime(log.check_in)}</span>
                              <span className="text-gray-300 text-xs">→</span>
                              {log.check_out
                                ? <span className="text-sm font-semibold text-rose-500">{fmtTime(log.check_out)}</span>
                                : <span className="text-sm text-yellow-500">ยังไม่ออก</span>}
                              <span className="text-xs text-gray-400">
                                {log.durationMinutes < 0
                                  ? <span className="text-red-500">⚠ ข้อมูลผิด</span>
                                  : log.durationMinutes > 0
                                    ? `(${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m)`
                                    : ''}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-3 flex-shrink-0">
                            <button onClick={() => openEdit(log)} className="text-xs text-blue-700 hover:text-blue-800 font-semibold">แก้ไข</button>
                            <button onClick={() => handleDelete(log.id)} className="text-xs text-red-500 hover:text-red-700 font-semibold">ลบ</button>
                          </div>
                        </div>
                        {log.work_summary && (
                          <div className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2 line-clamp-2">{log.work_summary}</div>
                        )}
                        {log.photo_url && (
                          <a href={log.photo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline">📎 ดูไฟล์แนบ</a>
                        )}
                        <div>
                          {log.status === 'approved' ? (
                            <div className="space-y-2">
                              <div className="flex flex-wrap gap-1.5">
                                <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full border border-green-200 font-medium">
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                  อนุมัติแล้ว
                                </span>
                                {log.paid && (
                                  <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-xs px-2.5 py-1 rounded-full border border-teal-200 font-medium">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a4 4 0 00-8 0v2M5 9h14l1 11H4L5 9z"/></svg>
                                    จ่ายแล้ว
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400">{log.approved_by} · {log.approved_at ? fmtDate(log.approved_at) : ''}</p>
                              <div className="flex flex-wrap gap-2 items-center">
                                {!log.paid && (
                                  <button onClick={() => handlePay(log.id)} disabled={busyLogId === log.id}
                                    className="text-xs bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap">
                                    บันทึกการจ่าย
                                  </button>
                                )}
                                {log.paid ? (
                                  <button onClick={() => handleUnpay(log.id)} disabled={busyLogId === log.id} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors whitespace-nowrap">ยกเลิกการจ่าย</button>
                                ) : (
                                  <button onClick={() => handleUnapprove(log.id)} disabled={busyLogId === log.id} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors whitespace-nowrap">ยกเลิกอนุมัติ</button>
                                )}
                              </div>
                            </div>
                          ) : log.is_rejected ? (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 text-xs px-2.5 py-1 rounded-full border border-red-200 font-medium whitespace-nowrap">
                                  ตีกลับแล้ว
                                </span>
                                <button onClick={() => handleUndoReject(log.id)} disabled={busyLogId === log.id} className="text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-600 px-3 py-1.5 rounded-lg font-semibold transition-colors">ยกเลิกการตีกลับ</button>
                              </div>
                              {log.rejected_reason && (
                                <p className="text-xs text-red-500 bg-red-50 rounded-lg px-2.5 py-1.5">เหตุผล: {log.rejected_reason}</p>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 text-xs px-2.5 py-1 rounded-full border border-amber-200 font-medium whitespace-nowrap">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                รออนุมัติ
                              </span>
                              <button onClick={() => handleApprove(log.id)} disabled={busyLogId === log.id} className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors">อนุมัติ</button>
                              <button onClick={() => { setRejectModal({ id: log.id }); setRejectReason('') }} disabled={busyLogId === log.id} className="text-xs bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-600 px-3 py-1.5 rounded-lg font-semibold transition-colors">ตีกลับ</button>
                            </div>
                          )}
                        </div>
                      </div>
                      )
                    })}
                  </div>

                  {/* Desktop table view */}
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-500 text-xs">
                        <tr>
                          <th className="px-3 py-3 text-center font-medium w-10">ลำดับ</th>
                          <th className="px-4 py-3 text-left font-medium">วันที่</th>
                          <th className="px-4 py-3 text-left font-medium">เวลาเข้า</th>
                          <th className="px-4 py-3 text-left font-medium">เวลาออก</th>
                          <th className="px-4 py-3 text-left font-medium">ชม.</th>
                          <th className="px-4 py-3 text-left font-medium">สรุปงาน</th>
                          <th className="px-4 py-3 text-left font-medium">สถานะ</th>
                          <th className="px-4 py-3 text-left font-medium">จัดการ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {paginatedLogs.map((log, idx) => {
                          const globalIdx = (currentPage - 1) * LOGS_PER_PAGE + idx
                          return (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="text-center text-xs text-gray-300" style={{ padding: '12px 8px', lineHeight: 1.8 }}>{globalIdx + 1}</td>
                            <td className="text-gray-600 whitespace-nowrap" style={{ padding: '12px 16px', lineHeight: 1.8 }}>
                              {fmtDate(log.check_in)}
                              {log.is_self_reported && <span className="block text-[10px] text-blue-500 font-medium">นิสิตลงเอง</span>}
                            </td>
                            <td className="font-medium text-green-600" style={{ padding: '12px 16px', lineHeight: 1.8 }}>{fmtTime(log.check_in)}</td>
                            <td className="font-medium text-rose-500" style={{ padding: '12px 16px', lineHeight: 1.8 }}>{log.check_out ? fmtTime(log.check_out) : <span className="text-yellow-500">ยังไม่ออก</span>}</td>
                            <td className="text-gray-600" style={{ padding: '12px 16px', lineHeight: 1.8 }}>
                              {log.durationMinutes < 0 ? <span className="text-red-500 text-xs font-medium">⚠ ข้อมูลผิด</span> : log.durationMinutes > 0 ? `${Math.floor(log.durationMinutes / 60)}h ${log.durationMinutes % 60}m` : '-'}
                            </td>
                            <td className="text-gray-600 max-w-xs" style={{ padding: '12px 16px', lineHeight: 1.8 }}>
                              <div className="truncate">{log.work_summary || '-'}</div>
                              {log.photo_url && (
                                <a href={log.photo_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline whitespace-nowrap">📎 ไฟล์แนบ</a>
                              )}
                            </td>
                            <td style={{ padding: '10px 16px', minWidth: '180px' }}>
                              {log.status === 'approved' ? (
                                <div className="space-y-2">
                                  <div className="flex flex-wrap gap-1.5">
                                    <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-xs px-2.5 py-1 rounded-full border border-green-200 font-medium">
                                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
                                      อนุมัติแล้ว
                                    </span>
                                    {log.paid && (
                                      <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-xs px-2.5 py-1 rounded-full border border-teal-200 font-medium">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a4 4 0 00-8 0v2M5 9h14l1 11H4L5 9z"/></svg>
                                        จ่ายแล้ว
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-400">{log.approved_by} · {log.approved_at ? fmtDate(log.approved_at) : ''}</p>
                                  <div className="flex flex-wrap gap-2 items-center">
                                    {!log.paid && (
                                      <button onClick={() => handlePay(log.id)} disabled={busyLogId === log.id}
                                        className="text-xs bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap">
                                        บันทึกการจ่าย
                                      </button>
                                    )}
                                    {log.paid ? (
                                      <button onClick={() => handleUnpay(log.id)} disabled={busyLogId === log.id} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors whitespace-nowrap">ยกเลิกการจ่าย</button>
                                    ) : (
                                      <button onClick={() => handleUnapprove(log.id)} disabled={busyLogId === log.id} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors whitespace-nowrap">ยกเลิกอนุมัติ</button>
                                    )}
                                  </div>
                                </div>
                              ) : log.is_rejected ? (
                                <div className="space-y-1.5">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 text-xs px-2.5 py-1 rounded-full border border-red-200 font-medium whitespace-nowrap">
                                      ตีกลับแล้ว
                                    </span>
                                    <button onClick={() => handleUndoReject(log.id)} disabled={busyLogId === log.id} className="text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-600 px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">ยกเลิกการตีกลับ</button>
                                  </div>
                                  {log.rejected_reason && (
                                    <p className="text-xs text-red-500 bg-red-50 rounded-lg px-2.5 py-1.5 max-w-xs">เหตุผล: {log.rejected_reason}</p>
                                  )}
                                </div>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-600 text-xs px-2.5 py-1 rounded-full border border-amber-200 font-medium whitespace-nowrap">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                    รออนุมัติ
                                  </span>
                                  <button onClick={() => handleApprove(log.id)} disabled={busyLogId === log.id} className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">อนุมัติ</button>
                                  <button onClick={() => { setRejectModal({ id: log.id }); setRejectReason('') }} disabled={busyLogId === log.id} className="text-xs bg-red-50 hover:bg-red-100 disabled:opacity-40 text-red-600 px-3 py-1.5 rounded-lg font-semibold transition-colors whitespace-nowrap">ตีกลับ</button>
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px 16px', lineHeight: 1.8 }}>
                              <div className="flex gap-2">
                                <button onClick={() => openEdit(log)} className="text-xs text-blue-700 hover:text-blue-800 font-medium">แก้ไข</button>
                                <button onClick={() => handleDelete(log.id)} className="text-xs text-red-500 hover:text-red-700 font-medium">ลบ</button>
                              </div>
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {summary.logs.length === 0 && <div className="text-center py-12 text-gray-400 text-sm">ไม่มีข้อมูล</div>}
                  </div>
                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-1 px-4 py-3 border-t border-gray-100">
                      <span className="text-xs text-gray-400 mr-2">{summary.logs.length} รายการ</span>
                      <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50">‹</button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button key={p} onClick={() => setCurrentPage(p)} className={`w-7 h-7 text-xs rounded-lg border ${currentPage === p ? 'bg-blue-700 text-white border-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{p}</button>
                      ))}
                      <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1 text-xs rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50">›</button>
                    </div>
                  )}
                </div>
              </>
            )}

            {selectedStudentId && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
                <h2 className="font-semibold text-gray-700 text-sm">สถิติย้อนหลังหลายเดือน</h2>
                <div className="flex flex-wrap items-end gap-4">
                  <div><label className="block text-xs text-gray-500 mb-1">จากเดือน</label><input type="month" className={inputCls + ' w-auto'} value={rangeStart} onChange={e => { setRangeStart(e.target.value); setMultiStats(null) }} /></div>
                  <div><label className="block text-xs text-gray-500 mb-1">ถึงเดือน</label><input type="month" className={inputCls + ' w-auto'} value={rangeEnd} onChange={e => { setRangeEnd(e.target.value); setMultiStats(null) }} /></div>
                  <button onClick={fetchMultiStats} disabled={!rangeStart || !rangeEnd || multiLoading} className="bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors">{multiLoading ? 'กำลังโหลด...' : 'ดูสถิติ'}</button>
                  {multiStats && <button onClick={() => handleExportCSV(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2.5 rounded-lg text-sm flex items-center gap-1.5 transition-colors"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Export CSV ช่วงนี้</button>}
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
                            <td className="px-4 py-3 font-medium text-gray-700">{format(new Date(s.month + '-01'), 'MMMM yyyy', { locale: th })}</td>
                            <td className="px-4 py-3 text-center text-blue-600 font-semibold">{s.days}</td>
                            <td className="px-4 py-3 text-center text-green-600 font-semibold">{s.hours}h {s.minutes}m</td>
                            <td className="px-4 py-3 text-center text-blue-700 font-semibold">{s.tasks}</td>
                          </tr>
                        ))}
                        <tr className="bg-gray-50 font-semibold text-gray-700 border-t-2 border-gray-200">
                          <td className="px-4 py-3">รวม {multiStats.length} เดือน</td>
                          <td className="px-4 py-3 text-center text-blue-700">{multiStats.reduce((s, m) => s + m.days, 0)} วัน</td>
                          <td className="px-4 py-3 text-center text-green-700">{(() => { const t = multiStats.reduce((s, m) => s + m.hours * 60 + m.minutes, 0); return `${Math.floor(t / 60)}h ${t % 60}m` })()}</td>
                          <td className="px-4 py-3 text-center text-blue-700">{multiStats.reduce((s, m) => s + m.tasks, 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Overview ────────────────────────────────────────────────────── */}
        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 flex flex-wrap items-end gap-3">
              <div><label className="block text-xs font-medium text-gray-500 mb-1.5">จากวันที่</label><input type="date" className={inputCls + ' w-auto'} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1.5">ถึงวันที่</label><input type="date" className={inputCls + ' w-auto'} value={dateTo} min={dateFrom} onChange={e => setDateTo(e.target.value)} /></div>
              <div><label className="block text-xs font-medium text-gray-500 mb-1.5">ฝ่าย</label>
                <select className={inputCls + ' w-auto'} value={overviewDept} onChange={e => setOverviewDept(e.target.value)}>
                  <option value="">ทุกฝ่าย</option>
                  {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <button onClick={fetchOverview} disabled={overviewLoading} className="bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors ml-auto">{overviewLoading ? 'กำลังโหลด...' : 'ดูภาพรวม'}</button>
            </div>
            {overview.length > 0 && (() => {
              const filteredOverview = (overviewDept ? overview.filter(o => o.student.department === overviewDept) : overview).sort((a, b) => deptOrder(a.student.department) - deptOrder(b.student.department) || a.student.name.localeCompare(b.student.name, 'th'))
              return (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-700 text-sm">ภาพรวมการลงเวลา</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{dateFrom && dateTo && (dateFrom === dateTo ? format(new Date(dateFrom), 'd MMM yyyy', { locale: th }) : `${format(new Date(dateFrom), 'd MMM yyyy', { locale: th })} – ${format(new Date(dateTo), 'd MMM yyyy', { locale: th })}`)} — {filteredOverview.length} คน{overviewDept ? ` (ฝ่าย ${overviewDept})` : mgrDept ? ` (ฝ่าย ${mgrDept})` : ''}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-sm">
                    <thead className="bg-gray-50 text-gray-500 text-xs">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium min-w-[120px]">ชื่อ-นามสกุล</th>
                        <th className="px-4 py-3 text-left font-medium whitespace-nowrap">รหัส</th>
                        <th className="px-4 py-3 text-left font-medium whitespace-nowrap">ฝ่าย</th>
                        <th className="px-4 py-3 text-center font-medium whitespace-nowrap">วันทำงาน</th>
                        <th className="px-4 py-3 text-center font-medium whitespace-nowrap">ชั่วโมงรวม</th>
                        <th className="px-4 py-3 text-center font-medium whitespace-nowrap">งาน</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredOverview.map(({ student, totalDays, totalHours, totalMinutes, taskCount }) => (
                        <tr key={student.student_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {student.nickname && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border flex-shrink-0 ${DEPT_CHIP[student.department] ?? 'bg-gray-100 text-gray-600 border-gray-300'}`}>{student.nickname}</span>}
                              <span>{student.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-500">{student.student_id}</td>
                          <td className="px-4 py-3"><span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{student.department}</span></td>
                          <td className="px-4 py-3 text-center"><span className={`font-semibold ${totalDays === 0 ? 'text-gray-300' : 'text-blue-600'}`}>{totalDays}</span></td>
                          <td className="px-4 py-3 text-center"><span className={`font-semibold ${totalHours === 0 && totalMinutes === 0 ? 'text-gray-300' : 'text-green-600'}`}>{totalHours}h {totalMinutes}m</span></td>
                          <td className="px-4 py-3 text-center text-blue-700 font-semibold">{taskCount}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => { setTab('individual'); setSelectedStudentId(student.student_id); setSearchIndividual(`${student.name} (${student.student_id})`); setSummary(null); fetchSummary(student.student_id) }} className="text-xs text-blue-700 hover:text-blue-800 font-medium whitespace-nowrap">ดูรายละเอียด</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )})()}
          </div>
        )}

        {/* ── Manage ──────────────────────────────────────────────────────── */}
        {tab === 'manage' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button onClick={() => setAddStudentOpen(true)} className="bg-blue-700 hover:bg-blue-800 text-white font-medium px-4 py-2.5 rounded-lg text-sm flex items-center gap-2 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                เพิ่มนิสิตใหม่
              </button>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div><h2 className="font-semibold text-gray-700 text-sm">จัดการนิสิต</h2><p className="text-xs text-gray-400 mt-0.5">ลบนิสิตจะลบข้อมูลลงเวลาทั้งหมดของนิสิตคนนั้นด้วย</p></div>
                  <span className="text-xs text-gray-400">{filteredManage.length} / {students.length} คน</span>
                </div>
                <input className={inputCls} placeholder="ค้นหาชื่อหรือรหัสนิสิต..." value={searchManage} onChange={e => setSearchManage(e.target.value)} />
              </div>
              {students.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">ไม่มีข้อมูลนิสิต</div>
              ) : filteredManage.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">ไม่พบนิสิตที่ค้นหา</div>
              ) : (
                <div className="overflow-x-auto">
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
                      {filteredManage.map(s => (
                        <tr key={s.student_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {s.nickname && <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border flex-shrink-0 ${DEPT_CHIP[s.department] ?? 'bg-gray-100 text-gray-600 border-gray-300'}`}>{s.nickname}</span>}
                              {s.name}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{s.student_id}</td>
                          <td className="px-4 py-3 whitespace-nowrap"><span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{s.department}</span></td>
                          <td className="px-4 py-3 text-gray-600 text-xs max-w-[160px]">
                            <div className="truncate">{s.faculty ?? <span className="text-gray-300">-</span>}</div>
                            {s.major && <div className="text-gray-400 truncate">{s.major}</div>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {s.pin ? (
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="text-green-600 text-xs font-mono font-medium">{revealedPins.has(s.student_id) ? s.pin : '••••'}</span>
                                <button onClick={() => togglePinReveal(s.student_id)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                  {revealedPins.has(s.student_id)
                                    ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                    : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                  }
                                </button>
                              </div>
                            ) : <span className="text-gray-300 text-xs">ไม่มี</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-3">
                              <button onClick={() => { const deptInList = DEPARTMENTS.includes(s.department); setEditStudentModal(s); setEditStudentForm({ student_id: s.student_id, name: s.name, department: deptInList ? s.department : 'อื่นๆ', faculty: s.faculty ?? FACULTIES[0], major: s.major ?? '' }); setEditStudentCustomDept(deptInList ? '' : s.department) }} className="text-xs text-blue-700 hover:text-blue-800 font-medium">แก้ไข</button>
                              <button onClick={() => { setPinModal({ student_id: s.student_id, name: s.name }); setPinInput(s.pin ?? '') }} className="text-xs text-blue-700 hover:text-blue-800 font-medium">{s.pin ? 'เปลี่ยน PIN' : 'ตั้ง PIN'}</button>
                              <button onClick={() => handleDeleteStudent(s)} className="text-xs text-red-500 hover:text-red-700 font-medium">ลบ</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
        </div>{/* end tab-content */}
      </main>

      {/* ── Edit Log Modal ──────────────────────────────────────────────────── */}
      {editingLog && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="anim-pop-in bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-gray-800">แก้ไขรายการลงเวลา</h3>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">เวลาเข้า</label>
              <input type="date" className={inputCls} value={editForm.check_in.slice(0, 10)}
                onChange={e => setEditForm(f => ({ ...f, check_in: e.target.value + 'T' + (f.check_in.slice(11) || '00:00') }))} />
              <p className="text-xs text-gray-400 mt-2 mb-1">เวลา</p>
              <TimeWheelPicker value={editForm.check_in.slice(11, 16) || '00:00'}
                onChange={t => setEditForm(f => ({ ...f, check_in: f.check_in.slice(0, 10) + 'T' + t }))} minuteStep={30} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">เวลาออก</label>
              <input type="date" className={inputCls} value={editForm.check_out.slice(0, 10)}
                onChange={e => setEditForm(f => ({ ...f, check_out: e.target.value + 'T' + (f.check_out.slice(11) || '00:00') }))} />
              <p className="text-xs text-gray-400 mt-2 mb-1">เวลา</p>
              <TimeWheelPicker value={editForm.check_out ? editForm.check_out.slice(11, 16) : ''}
                onChange={t => { if (!t) { setEditForm(f => ({ ...f, check_out: '' })); return } setEditForm(f => ({ ...f, check_out: (f.check_out.slice(0, 10) || f.check_in.slice(0, 10)) + 'T' + t })) }} minuteStep={30} />
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">สรุปงาน</label><textarea className={inputCls} rows={3} value={editForm.work_summary} onChange={e => setEditForm(f => ({ ...f, work_summary: e.target.value }))} /></div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditingLog(null)} className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleEditSave} disabled={editSaving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">{editSaving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Log Modal ───────────────────────────────────────────────────── */}
      {addLogOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="anim-pop-in bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-800">เพิ่ม Log ย้อนหลัง</h3>
                <p className="text-xs text-gray-400 mt-0.5">{students.find(s => s.student_id === selectedStudentId)?.name}</p>
              </div>
              <button onClick={() => setAddLogOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่ <span className="text-red-400">*</span></label>
              <input type="date" className={inputCls} value={addLogForm.date} onChange={e => setAddLogForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เวลาเข้า <span className="text-red-400">*</span></label>
              <TimeWheelPicker value={addLogForm.check_in || '00:00'} onChange={t => setAddLogForm(f => ({ ...f, check_in: t }))} minuteStep={30} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <label className="text-sm font-medium text-gray-700">เวลาออก</label>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={!!addLogForm.check_out}
                    onChange={e => setAddLogForm(f => ({ ...f, check_out: e.target.checked ? '18:00' : '', check_out_date: e.target.checked ? f.date : '' }))} />
                  ระบุเวลาออก
                </label>
              </div>
              {addLogForm.check_out && (<>
                <div className="mb-2">
                  <label className="block text-xs text-gray-500 mb-1">วันที่ออก</label>
                  <input type="date" className={inputCls} value={addLogForm.check_out_date || addLogForm.date}
                    min={addLogForm.date}
                    onChange={e => setAddLogForm(f => ({ ...f, check_out_date: e.target.value }))} />
                </div>
                <TimeWheelPicker value={addLogForm.check_out} onChange={t => setAddLogForm(f => ({ ...f, check_out: t }))} minuteStep={30} />
              </>)}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สรุปงาน</label>
              <textarea rows={2} className={inputCls + ' resize-none'} placeholder="งานที่ทำ..." value={addLogForm.work_summary} onChange={e => setAddLogForm(f => ({ ...f, work_summary: e.target.value }))} />
            </div>
            <AttachmentInput
              value={addLogForm.photo_url}
              onChange={url => setAddLogForm(f => ({ ...f, photo_url: url }))}
              studentId={selectedStudentId}
            />
            <div className="flex gap-3 pt-1">
              <button onClick={() => setAddLogOpen(false)} className="flex-1 border border-gray-300 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleAddLog} disabled={addLogSaving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white font-medium py-2.5 rounded-lg text-sm transition-colors">{addLogSaving ? 'กำลังเพิ่ม...' : 'เพิ่ม Log'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Student Modal ───────────────────────────────────────────────── */}
      {addStudentOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="anim-pop-in bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold text-gray-800">เพิ่มนิสิตใหม่</h3>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">รหัสนิสิต *</label><input className={inputCls} placeholder="6630200000" value={addStudentForm.student_id} onChange={e => setAddStudentForm(f => ({ ...f, student_id: e.target.value }))} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">ชื่อ-นามสกุล *</label><input className={inputCls} placeholder="นาย..." value={addStudentForm.name} onChange={e => setAddStudentForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">ชื่อเล่น</label><input className={inputCls} placeholder="ชื่อเล่น..." value={addStudentForm.nickname} onChange={e => setAddStudentForm(f => ({ ...f, nickname: e.target.value }))} /></div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ฝ่าย</label>
              <select className={inputCls} value={addStudentForm.department} onChange={e => setAddStudentForm(f => ({ ...f, department: e.target.value }))}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {addStudentForm.department === 'อื่นๆ' && <input className={inputCls + ' mt-2'} placeholder="ระบุฝ่าย..." value={addStudentCustomDept} onChange={e => setAddStudentCustomDept(e.target.value)} />}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">คณะ</label>
              <select className={inputCls} value={addStudentForm.faculty} onChange={e => setAddStudentForm(f => ({ ...f, faculty: e.target.value }))}>
                {FACULTIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">สาขา</label><input className={inputCls} placeholder="สาขาวิชา..." value={addStudentForm.major} onChange={e => setAddStudentForm(f => ({ ...f, major: e.target.value }))} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">PIN (4 หลัก, ไม่บังคับ)</label><input className={inputCls} placeholder="0000" maxLength={4} value={addStudentForm.pin} onChange={e => setAddStudentForm(f => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} /></div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => { setAddStudentOpen(false); setAddStudentCustomDept('') }} className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleAddStudent} disabled={addStudentSaving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">{addStudentSaving ? 'กำลังบันทึก...' : 'เพิ่มนิสิต'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Student Modal ──────────────────────────────────────────────── */}
      {editStudentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="anim-pop-in bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-gray-800">แก้ไขข้อมูลนิสิต</h3>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">รหัสนิสิต</label><input className={inputCls + ' font-mono'} value={editStudentForm.student_id} onChange={e => setEditStudentForm(f => ({ ...f, student_id: e.target.value }))} /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">ชื่อ-นามสกุล</label><input className={inputCls} value={editStudentForm.name} onChange={e => setEditStudentForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ฝ่าย</label>
              <select className={inputCls} value={editStudentForm.department} onChange={e => setEditStudentForm(f => ({ ...f, department: e.target.value }))}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              {editStudentForm.department === 'อื่นๆ' && <input className={inputCls + ' mt-2'} placeholder="ระบุฝ่าย..." value={editStudentCustomDept} onChange={e => setEditStudentCustomDept(e.target.value)} />}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">คณะ</label>
              <select className={inputCls} value={editStudentForm.faculty} onChange={e => setEditStudentForm(f => ({ ...f, faculty: e.target.value }))}>
                {FACULTIES.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">สาขา</label><input className={inputCls} value={editStudentForm.major} onChange={e => setEditStudentForm(f => ({ ...f, major: e.target.value }))} /></div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setEditStudentModal(null)} className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleEditStudent} disabled={editStudentSaving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">{editStudentSaving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PIN Modal ───────────────────────────────────────────────────────── */}
      {pinModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="anim-pop-in bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 space-y-4">
            <h3 className="font-bold text-gray-800">ตั้ง PIN — {pinModal.name}</h3>
            <input className={inputCls + ' text-center text-2xl tracking-widest font-mono'} placeholder="0000" maxLength={4} value={pinInput} onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))} />
            <p className="text-xs text-gray-400 text-center">ปล่อยว่างเพื่อลบ PIN</p>
            <div className="flex gap-3">
              <button onClick={() => { setPinModal(null); setPinInput('') }} className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleSetPin} disabled={pinSaving} className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">{pinSaving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reject Modal ────────────────────────────────────────────────────── */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="anim-pop-in bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-800">ตีกลับรายการนี้</h3>
            <p className="text-xs text-gray-500">ระบุเหตุผลให้นิสิตทราบว่าทำไมรายการนี้ไม่ผ่าน นิสิตจะเห็นเหตุผลนี้และแก้ไขส่งใหม่ได้</p>
            <textarea autoFocus rows={3} className={inputCls + ' resize-none'} placeholder="เช่น เวลาที่ลงไม่ตรงกับที่ทำงานจริง กรุณาแก้ไข..."
              value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={() => { setRejectModal(null); setRejectReason('') }} className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">ยกเลิก</button>
              <button onClick={handleReject} disabled={rejectSaving} className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">{rejectSaving ? 'กำลังส่ง...' : 'ตีกลับ'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Announce Tab ────────────────────────────────────────────────────── */}
      {tab === 'announce' && (
        <div className="space-y-4">
          {/* Post form */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
            <h2 className="font-semibold text-gray-700 text-sm">สร้างประกาศใหม่</h2>
            {annError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{annError}</p>}
            <div><label className="block text-xs font-medium text-gray-500 mb-1">หัวข้อ</label><input className={inputCls} placeholder="เช่น แจ้งกำหนดส่งงาน" value={annTitle} onChange={e => setAnnTitle(e.target.value)} /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">เนื้อหา</label><textarea className={inputCls + ' resize-none'} rows={3} placeholder="รายละเอียดประกาศ..." value={annBody} onChange={e => setAnnBody(e.target.value)} /></div>
            <div><label className="block text-xs font-medium text-gray-500 mb-1">หมดอายุ (ไม่บังคับ)</label><input type="datetime-local" className={inputCls + ' w-auto'} value={annExpires} onChange={e => setAnnExpires(e.target.value)} /></div>
            <button onClick={handlePostAnnouncement} disabled={annSaving} className="bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors">
              {annSaving ? 'กำลังโพสต์...' : 'โพสต์ประกาศ'}
            </button>
          </div>
          {/* List */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-700 text-sm">ประกาศที่ใช้งานอยู่</h2>
              <button onClick={fetchAnnouncements} disabled={annLoading} className="text-xs text-blue-700 hover:text-blue-800 font-medium">{annLoading ? '...' : 'รีเฟรช'}</button>
            </div>
            {annLoading ? (
              <div className="py-10 text-center text-gray-400 text-sm">กำลังโหลด...</div>
            ) : announcements.length === 0 ? (
              <div className="py-10 text-center text-gray-400 text-sm">ยังไม่มีประกาศ</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {announcements.map(a => (
                  <div key={a.id} className="px-5 py-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 text-sm">{a.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap">{a.body}</p>
                      <p className="text-xs text-gray-400 mt-1.5">
                        โดย {a.author} · {format(new Date(a.created_at), 'd MMM yyyy HH:mm', { locale: th })}
                        {a.expires_at && ` · หมดอายุ ${format(new Date(a.expires_at), 'd MMM yyyy HH:mm', { locale: th })}`}
                      </p>
                    </div>
                    <button onClick={() => handleDeleteAnnouncement(a.id)} className="flex-shrink-0 text-xs text-red-400 hover:text-red-600 font-medium transition-colors">ลบ</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Roster Tab ──────────────────────────────────────────────────────── */}
      {tab === 'roster' && (
        <RosterTab
          students={rosterStudents}
          loading={rosterLoading}
          onRefresh={fetchRoster}
          lockedDept={mgrDept || undefined}
          canEditStudentId
        />
      )}

      {/* ── Settings Modal ─────────────────────────────────────────────────── */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="anim-pop-in bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800">ตั้งค่าบัญชี</h3>
              <button onClick={() => setSettingsOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex rounded-lg border border-gray-200 p-1 gap-1">
              {(['info', 'password'] as const).map(t => (
                <button key={t} onClick={() => { setSettingsTab(t); setPwSettingsError(''); setPwSettingsSuccess(false) }}
                  className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${settingsTab === t ? 'bg-blue-700 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}>
                  {t === 'info' ? 'ข้อมูลบัญชี' : 'เปลี่ยนรหัสผ่าน'}
                </button>
              ))}
            </div>

            {settingsTab === 'info' && (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-400 mb-0.5">ชื่อผู้ใช้</p>
                  <p className="text-sm font-medium text-gray-800">{localStorage.getItem('mgr_username') || '-'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-xs text-gray-400">ชื่อ-นามสกุล</p>
                    {!editingName && (
                      <button onClick={() => { setNameInput(mgrName); setNameError(''); setEditingName(true) }}
                        className="text-xs text-blue-700 hover:text-blue-800 font-medium">แก้ไข</button>
                    )}
                  </div>
                  {editingName ? (
                    <div className="space-y-2 mt-1">
                      <input className={inputCls} value={nameInput} onChange={e => { setNameInput(e.target.value); setNameError('') }} placeholder="ชื่อ-นามสกุล" autoFocus />
                      {nameError && <p className="text-xs text-red-500">{nameError}</p>}
                      <div className="flex gap-2">
                        <button onClick={() => setEditingName(false)}
                          className="flex-1 border border-gray-300 text-gray-600 text-xs font-medium py-1.5 rounded-lg hover:bg-gray-50">ยกเลิก</button>
                        <button disabled={nameSaving || !nameInput.trim()}
                          onClick={async () => {
                            setNameSaving(true); setNameError('')
                            try {
                              const res = await fetch('/api/manager/settings', {
                                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ username: localStorage.getItem('mgr_username') || '', name: nameInput }),
                              })
                              if (!res.ok) { const d = await res.json(); setNameError(d.error || 'เกิดข้อผิดพลาด'); return }
                              setMgrName(nameInput)
                              localStorage.setItem('mgr_name', nameInput)
                              setEditingName(false)
                            } catch { setNameError('เกิดข้อผิดพลาด') } finally { setNameSaving(false) }
                          }}
                          className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-xs font-medium py-1.5 rounded-lg">
                          {nameSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-gray-800">{mgrName || '-'}</p>
                  )}
                </div>
                <div className="bg-gray-50 rounded-lg px-4 py-3">
                  <p className="text-xs text-gray-400 mb-0.5">ฝ่าย</p>
                  <p className="text-sm font-medium text-gray-800">{mgrDept || 'ทุกแผนก'}</p>
                </div>
              </div>
            )}

            {settingsTab === 'password' && (
              <div className="space-y-3">
                {pwSettingsSuccess ? (
                  <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm text-center">เปลี่ยนรหัสผ่านสำเร็จ</div>
                ) : (
                  <>
                    {pwSettingsError && <div className="bg-red-50 border border-red-200 text-red-600 rounded-lg px-4 py-2 text-xs text-center">{pwSettingsError}</div>}
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">รหัสผ่านปัจจุบัน</label><input type="password" className={inputCls} placeholder="••••••••" value={pwCurrent} onChange={e => { setPwCurrent(e.target.value); setPwSettingsError('') }} /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">รหัสผ่านใหม่</label><input type="password" className={inputCls} placeholder="อย่างน้อย 6 ตัวอักษร" value={pwNew} onChange={e => { setPwNew(e.target.value); setPwSettingsError('') }} /></div>
                    <div><label className="block text-xs font-medium text-gray-600 mb-1">ยืนยันรหัสผ่านใหม่</label><input type="password" className={inputCls} placeholder="••••••••" value={pwConfirm} onChange={e => { setPwConfirm(e.target.value); setPwSettingsError('') }} /></div>
                    <button
                      disabled={pwSavingSettings || !pwCurrent || !pwNew || !pwConfirm}
                      onClick={async () => {
                        if (pwNew !== pwConfirm) return setPwSettingsError('รหัสผ่านใหม่ไม่ตรงกัน')
                        if (pwNew.length < 6) return setPwSettingsError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
                        setPwSavingSettings(true); setPwSettingsError('')
                        try {
                          const res = await fetch('/api/manager/settings', {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ username: localStorage.getItem('mgr_username') || '', currentPassword: pwCurrent, newPassword: pwNew }),
                          })
                          const data = await res.json()
                          if (!res.ok) setPwSettingsError(data.error || 'เกิดข้อผิดพลาด')
                          else { setPwSettingsSuccess(true); setPwCurrent(''); setPwNew(''); setPwConfirm('') }
                        } catch { setPwSettingsError('เกิดข้อผิดพลาด กรุณาลองใหม่') } finally { setPwSavingSettings(false) }
                      }}
                      className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                      {pwSavingSettings ? 'กำลังบันทึก...' : 'บันทึกรหัสผ่านใหม่'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Feedback Modal ──────────────────────────────────────────────────── */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="anim-pop-in bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-800 text-lg">ให้คะแนนระบบ</h3>
              <p className="text-sm text-gray-500 mt-1">{feedbackModal.message}</p>
            </div>
            <div className="flex justify-center gap-2">
              {[1,2,3,4,5].map(s => (
                <button key={s} onClick={() => setFeedbackRating(s)} className={`text-4xl transition-transform hover:scale-110 ${s <= feedbackRating ? 'text-yellow-400' : 'text-gray-300'}`}>★</button>
              ))}
            </div>
            {feedbackRating > 0 && <p className="text-center text-sm text-gray-500">{['','แย่มาก','พอใช้','ดี','ดีมาก','ยอดเยี่ยม'][feedbackRating]}</p>}
            <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" rows={3} placeholder="ความคิดเห็นเพิ่มเติม (ไม่บังคับ)" value={feedbackComment} onChange={e => setFeedbackComment(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={() => setFeedbackModal(null)} className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">ข้าม</button>
              <button disabled={feedbackRating === 0 || feedbackSaving}
                onClick={async () => {
                  setFeedbackSaving(true)
                  await fetch('/api/feedback/response', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ campaign_id: feedbackModal.campaignId, respondent_type: 'manager', respondent_id: localStorage.getItem('mgr_username') || '', respondent_name: mgrName, rating: feedbackRating, comment: feedbackComment || null }),
                  })
                  setFeedbackSaving(false); setFeedbackModal(null)
                }}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                {feedbackSaving ? 'กำลังส่ง...' : 'ส่ง Feedback'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
