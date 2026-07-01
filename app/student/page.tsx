'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, type Announcement } from '@/lib/supabase'
import { differenceInMinutes } from 'date-fns'
import SdecHeader from '@/app/components/SdecHeader'
import TimeWheelPicker from '@/app/components/TimeWheelPicker'
import AttachmentInput from '@/app/components/AttachmentInput'

type FormState  = { name: string; student_id: string; department: string; faculty: string; major: string }
type ActiveLog  = { id: string; check_in: string }
type HistoryLog = {
  id: string; check_in: string; check_out: string | null; work_summary: string | null; project_name: string | null; photo_url: string | null
  dateStr: string; checkInStr: string; checkOutStr: string; durationStr: string
  status: 'pending' | 'approved'; isSelfReported: boolean
  isRejected: boolean; rejectedReason: string | null
}
type SelfReportForm = { date: string; check_in: string; check_out: string; check_out_date: string; project_name: string; work_summary: string; photo_url: string | null }

const BKK = 'Asia/Bangkok'

function thaiToUTC(date: string, time: string) { return new Date(`${date}T${time}:00+07:00`).toISOString() }
function todayThai() { return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10) }
function minDateThai() { return new Date(Date.now() + 7 * 3600000 - 30 * 24 * 3600000).toISOString().slice(0, 10) }

function toThaiTime(iso: string) {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000)
}
function isRecentCheckIn(iso: string) {
  // true if checked in within the last 18 hours — covers overnight shifts
  // (>18 h gap means they genuinely forgot to check out)
  return Date.now() - new Date(iso).getTime() < 18 * 60 * 60 * 1000
}
function fmtHHMM(iso: string) {
  return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: BKK })
}
function fmtShortDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: BKK })
}
function getInitials(name: string) {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return parts[0][0] + parts[1][0]
  return name.slice(0, 2)
}

export default function StudentPage() {
  const [form, setForm]               = useState<FormState>({ name: '', student_id: '', department: '', faculty: '', major: '' })
  const [studentLocked, setStudentLocked] = useState(false)
  const [studentNotFound, setStudentNotFound] = useState(false)
  const [activeLog, setActiveLog]     = useState<ActiveLog | null>(null)
  const [checkOutProject, setCheckOutProject] = useState('')
  const [workSummary, setWorkSummary] = useState('')
  const [checkOutPhoto, setCheckOutPhoto] = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)
  const [cooldown, setCooldown]       = useState(0)
  const [idLooking, setIdLooking]     = useState(false)
  const [message, setMessage]         = useState<{ type: 'success' | 'error' | 'warn'; text: string } | null>(null)

  const [hasPin, setHasPin]           = useState(false)
  const [pinInput, setPinInput]       = useState('')
  const [pinSetStep, setPinSetStep]   = useState(false)
  const [pinFirst, setPinFirst]       = useState('')
  const [pinConfirm, setPinConfirm]   = useState('')
  const [pinSetting, setPinSetting]   = useState(false)

  const [now, setNow] = useState<Date | null>(null)

  const [showHistory, setShowHistory]       = useState(false)
  const [historyLogs, setHistoryLogs]       = useState<HistoryLog[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyMonth, setHistoryMonth]     = useState('')

  const [selfReportOpen, setSelfReportOpen]     = useState(false)
  const [selfReportForm, setSelfReportForm]     = useState<SelfReportForm>({ date: '', check_in: '09:00', check_out: '', check_out_date: '', project_name: '', work_summary: '', photo_url: null })
  const [selfReportSaving, setSelfReportSaving] = useState(false)
  const [editingLog, setEditingLog]             = useState<HistoryLog | null>(null)

  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => { audioRef.current?.pause() }, [])

  // Synchronous re-entrancy locks — `loading`/`selfReportSaving` are React state,
  // so a second click can slip through before a re-render disables the button
  // (fast double-tap, or two queued click events). These refs are checked and
  // set in the same tick the handler starts, closing that race window.
  const checkInLock  = useRef(false)
  const checkOutLock = useRef(false)
  const selfReportLock = useRef(false)

  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    fetch('/api/announcements').then(r => r.json()).then(setAnnouncements).catch(() => {})
  }, [])

  // Feedback modal
  const [feedbackModal, setFeedbackModal]     = useState<{ campaignId: string; message: string } | null>(null)
  const [feedbackStudent, setFeedbackStudent] = useState<{ id: string; name: string } | null>(null)
  const [feedbackRating, setFeedbackRating]   = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  const [feedbackSaving, setFeedbackSaving]   = useState(false)

  useEffect(() => {
    const d = new Date()
    setNow(d)
    setHistoryMonth(new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7))
    const iv = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(iv)
  }, [])

  const timeStr = now?.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: BKK }) ?? ''
  const dateStr = now?.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: BKK }) ?? ''

  const startCooldown = (seconds = 3) => {
    setCooldown(seconds)
    const iv = setInterval(() => {
      setCooldown(prev => { if (prev <= 1) { clearInterval(iv); return 0 } return prev - 1 })
    }, 1000)
  }

  const showMsg = (type: 'success' | 'error' | 'warn', text: string, duration = 5000) => {
    setMessage({ type, text })
    if (duration > 0) setTimeout(() => setMessage(null), duration)
  }

  const handleStudentIdBlur = async () => {
    if (!form.student_id || studentLocked) return
    setIdLooking(true)
    try {
      // Fetch the month summary in the same round-trip instead of waiting
      // for studentLocked to flip and a separate effect to kick off a
      // follow-up fetch afterward — the badges used to visibly pop in a
      // beat later than the rest of the student info for no real reason.
      const [{ data: student }, { data: activeLogData }, pinRes] = await Promise.all([
        supabase.from('students').select('name, department, faculty, major').eq('student_id', form.student_id).maybeSingle(),
        supabase.from('time_logs').select('id, check_in').eq('student_id', form.student_id).is('check_out', null).maybeSingle(),
        fetch(`/api/student-pin?student_id=${encodeURIComponent(form.student_id)}`),
        historyMonth ? fetchHistory(historyMonth) : Promise.resolve(),
      ])
      if (student) {
        const { hasPin: hp } = pinRes.ok ? await pinRes.json() : { hasPin: false }
        setForm(f => ({ ...f, name: student.name, department: student.department, faculty: student.faculty ?? '', major: student.major ?? '' }))
        setStudentLocked(true)
        setStudentNotFound(false)
        setHasPin(hp)
        if (!hp) { setPinSetStep(true); setPinFirst(''); setPinConfirm('') }
        if (activeLogData) {
          if (isRecentCheckIn(activeLogData.check_in)) {
            setActiveLog(activeLogData)
            showMsg('warn', `คุณยังไม่ได้บันทึกเวลาออก (เข้าเมื่อ ${fmtHHMM(activeLogData.check_in)})`, 0)
          } else {
            const checkInThai = toThaiTime(activeLogData.check_in)
            const endOfDay = new Date(checkInThai)
            endOfDay.setHours(18, 0, 0, 0)
            // If check-in itself was at/after 18:00, "18:00 same day" would be
            // BEFORE check-in — producing a negative-duration row. Close at
            // 18:00 the next day instead so check_out is always after check_in.
            if (endOfDay <= checkInThai) endOfDay.setDate(endOfDay.getDate() + 1)
            await supabase.from('time_logs').update({
              check_out:    new Date(endOfDay.getTime() - 7 * 60 * 60 * 1000).toISOString(),
              work_summary: '(ปิดอัตโนมัติ — ลืม check-out)',
            }).eq('id', activeLogData.id)
            showMsg('warn', `พบการลงเวลาค้างจากวันก่อน ระบบปิดให้อัตโนมัติแล้ว — ${student.name}`, 8000)
          }
        }
      } else {
        setStudentNotFound(true)
        showMsg('error', 'ไม่พบรหัสนิสิตในระบบ กรุณาติดต่อผู้ดูแลระบบ', 0)
      }
    } finally { setIdLooking(false) }
  }

  const fetchHistory = useCallback(async (month: string) => {
    setHistoryLoading(true)
    const TZ    = 7 * 60 * 60 * 1000
    const [y, m] = month.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1) - TZ).toISOString()
    const end   = new Date(Date.UTC(y, m, 1) - TZ - 1).toISOString()
    const { data } = await supabase.from('time_logs').select('*')
      .eq('student_id', form.student_id)
      .gte('check_in', start).lte('check_in', end)
      .order('check_in', { ascending: true })
    setHistoryLogs((data ?? []).map(log => {
      const dur = log.check_out ? differenceInMinutes(new Date(log.check_out), new Date(log.check_in)) : 0
      return {
        id: log.id, check_in: log.check_in, check_out: log.check_out,
        work_summary: log.work_summary, project_name: log.project_name, photo_url: log.photo_url,
        dateStr:     fmtShortDate(log.check_in),
        checkInStr:  fmtHHMM(log.check_in),
        checkOutStr: log.check_out ? fmtHHMM(log.check_out) : '-',
        durationStr: dur > 0 ? `${Math.floor(dur / 60)}h ${dur % 60}m` : '-',
        status: (log.status ?? 'pending') as 'pending' | 'approved',
        isSelfReported: !!log.is_self_reported,
        isRejected: !!log.is_rejected, rejectedReason: log.rejected_reason,
      }
    }))
    setHistoryLoading(false)
  }, [form.student_id])

  // Live refresh: if staff approve/reject/edit this student's log — or the
  // student submits/edits their own self-report — reflect it immediately,
  // both in the history table and the always-visible month summary badges,
  // without needing a manual "รีเฟรช" click or the history panel open.
  const historyMonthRef  = useRef(historyMonth)
  useEffect(() => { historyMonthRef.current = historyMonth }, [historyMonth])

  useEffect(() => {
    if (!studentLocked || !form.student_id) return
    const channel = supabase
      .channel(`student-time-logs-${form.student_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'time_logs', filter: `student_id=eq.${form.student_id}`,
      }, () => {
        void fetchHistory(historyMonthRef.current)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [studentLocked, form.student_id, fetchHistory])

  const handleToggleHistory = () => {
    if (!showHistory && historyMonth) fetchHistory(historyMonth)
    setShowHistory(h => !h)
  }

  const handleSetNewPin = async () => {
    if (pinFirst.length !== 4) return showMsg('error', 'PIN ต้องเป็นตัวเลข 4 หลัก')
    if (pinConfirm !== pinFirst) {
      showMsg('error', 'PIN ไม่ตรงกัน กรุณาลองใหม่')
      setPinFirst(''); setPinConfirm('')
      return
    }
    setPinSetting(true)
    try {
      const res = await fetch('/api/student-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: form.student_id, pin: pinFirst }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || res.statusText) }
      setHasPin(true); setPinSetStep(false); setPinFirst(''); setPinConfirm('')
      showMsg('success', 'ตั้ง PIN สำเร็จ! กรอก PIN เพื่อบันทึกเวลาเข้า')
    } catch (e) {
      showMsg('error', 'ตั้ง PIN ไม่สำเร็จ: ' + (e as Error).message)
    } finally { setPinSetting(false) }
  }

  const verifyPin = async (pin: string) => {
    try {
      const res = await fetch('/api/student-pin/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: form.student_id, pin }),
      })
      const d = await res.json().catch(() => ({ ok: false }))
      return { ok: !!d.ok, locked: !!d.locked }
    } catch { return { ok: false, locked: false } }
  }

  const handleCheckIn = async () => {
    if (checkInLock.current) return
    if (!studentLocked) return showMsg('error', 'ไม่พบรหัสนิสิตในระบบ กรุณาติดต่อผู้ดูแลระบบ')
    checkInLock.current = true
    setLoading(true)
    try {
      // PIN verification and the open-log guard don't depend on each
      // other — run them as one round-trip instead of two sequential ones.
      const [pinResult, { data: openLog }] = await Promise.all([
        hasPin ? verifyPin(pinInput) : Promise.resolve({ ok: true, locked: false }),
        supabase.from('time_logs').select('id, check_in').eq('student_id', form.student_id).is('check_out', null).maybeSingle(),
      ])
      if (!pinResult.ok) return showMsg('error', pinResult.locked ? 'กรอก PIN ผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่' : 'กรอก PIN ผิด กรุณาลองใหม่')
      // Guard: ป้องกัน 2 tab check-in พร้อมกัน
      if (openLog) {
        setActiveLog(openLog)
        return showMsg('warn', `มีการลงเวลาเข้าค้างอยู่แล้ว (เข้าเมื่อ ${fmtHHMM(openLog.check_in)})`, 0)
      }

      const { data, error } = await supabase.from('time_logs')
        .insert({ student_id: form.student_id, check_in: new Date().toISOString() })
        .select('id, check_in').single()
      if (error) {
        // 23505 = unique_violation — the DB-level guard caught a duplicate check-in
        // that slipped past the client-side lock (e.g. two tabs/devices at once)
        if ((error as { code?: string }).code === '23505') {
          const { data: existing } = await supabase.from('time_logs').select('id, check_in')
            .eq('student_id', form.student_id).is('check_out', null).maybeSingle()
          if (existing) setActiveLog(existing)
          return showMsg('warn', 'มีการลงเวลาเข้าค้างอยู่แล้ว กรุณารีเฟรชหน้าแล้วลองใหม่', 0)
        }
        throw error
      }
      setActiveLog(data)
      startCooldown(3)
      showMsg('success', `บันทึกเวลาเข้า ${fmtHHMM(data.check_in)} สำเร็จ`)
    } catch (e: unknown) {
      showMsg('error', (e as Error).message)
    } finally { setLoading(false); checkInLock.current = false }
  }

  const handleCheckOut = async () => {
    if (checkOutLock.current) return
    if (!activeLog) return
    checkOutLock.current = true
    try {
      const rawMinutes = Math.round((Date.now() - new Date(activeLog.check_in).getTime()) / 60000)
      const remainder  = rawMinutes % 30
      let duration = rawMinutes
      if (remainder > 0) {
        if (remainder > 25) {
          duration = rawMinutes + (30 - remainder) // round up — silent
        } else {
          duration = rawMinutes - remainder // round down — confirm first
          const h = Math.floor(duration / 60), m = duration % 60
          const ok = window.confirm(`เวลาทำงานจะถูกปัดลงเหลือ ${h} ชม. ${m} นาที ต้องการบันทึกเวลาออกหรือไม่?`)
          if (!ok) return
        }
      }
      await finishCheckOut(duration)
    } finally { checkOutLock.current = false }
  }

  const finishCheckOut = async (duration: number) => {
    if (!activeLog) return
    const checkOutISO = new Date(new Date(activeLog.check_in).getTime() + duration * 60000).toISOString()
    setLoading(true)
    try {
      const { error } = await supabase.from('time_logs').update({
        check_out:    checkOutISO,
        work_summary: workSummary,
        project_name: checkOutProject || null,
        photo_url:    checkOutPhoto,
      }).eq('id', activeLog.id)
      if (error) throw error
      const studentId = form.student_id
      const studentName = form.name
      startCooldown(3)
      showMsg('success', `บันทึกเวลาออก ทำงาน ${duration} นาที สำเร็จ`)
      setActiveLog(null); setWorkSummary(''); setCheckOutProject(''); setCheckOutPhoto(null)
      setStudentLocked(false); setStudentNotFound(false)
      setHasPin(false); setPinInput(''); setPinSetStep(false); setPinFirst(''); setPinConfirm('')
      setShowHistory(false); setHistoryLogs([])
      setForm({ name: '', student_id: '', department: '', faculty: '', major: '' })

      // check for active feedback campaign
      try {
        const res = await fetch('/api/feedback/campaign')
        const campaign = await res.json()
        if (campaign?.id) {
          // check if this student already submitted for this campaign
          const checkRes = await fetch(`/api/feedback/response?campaign_id=${campaign.id}&respondent_type=student&respondent_id=${studentId}`)
          const existing = await checkRes.json()
          if (existing.length === 0) {
            setFeedbackRating(0)
            setFeedbackComment('')
            setFeedbackModal({ campaignId: campaign.id, message: campaign.message })
            setFeedbackStudent({ id: studentId, name: studentName })
          }
        }
      } catch { /* ignore */ }
    } catch (e: unknown) {
      showMsg('error', (e as Error).message)
    } finally { setLoading(false) }
  }

  const openSelfReport = () => {
    setEditingLog(null)
    setSelfReportForm({ date: todayThai(), check_in: '09:00', check_out: '', check_out_date: '', project_name: '', work_summary: '', photo_url: null })
    setSelfReportOpen(true)
  }

  const openEditSelfReport = (log: HistoryLog) => {
    const thaiIn  = new Date(new Date(log.check_in).getTime() + 7 * 3600000)
    const inDate  = thaiIn.toISOString().slice(0, 10)
    const inTime  = thaiIn.toISOString().slice(11, 16)
    let outTime = '', outDate = ''
    if (log.check_out) {
      const thaiOut = new Date(new Date(log.check_out).getTime() + 7 * 3600000)
      outTime = thaiOut.toISOString().slice(11, 16)
      outDate = thaiOut.toISOString().slice(0, 10)
    }
    setSelfReportForm({ date: inDate, check_in: inTime, check_out: outTime, check_out_date: outDate, project_name: log.project_name || '', work_summary: log.work_summary || '', photo_url: log.photo_url })
    setEditingLog(log)
    setSelfReportOpen(true)
  }

  const handleDeleteSelfReport = async (log: HistoryLog) => {
    if (!window.confirm('ต้องการลบคำขอนี้ใช่ไหม?')) return
    const { error } = await supabase.from('time_logs').delete().eq('id', log.id)
    if (error) return showMsg('error', error.message)
    showMsg('success', 'ลบคำขอสำเร็จ')
    fetchHistory(historyMonth)
  }

  const handleSelfReport = async () => {
    // Acquire the re-entrancy lock synchronously, before any `await` — the
    // overlap check below is an async DB round-trip, so a second tap while
    // it's in flight used to sail straight through the same check (it
    // hadn't inserted yet) and create a duplicate/overlapping log. Locking
    // only after the check (as this used to) doesn't close that window.
    if (selfReportLock.current) return
    selfReportLock.current = true
    try {
      // Self-report is a higher-trust action (a backdated entry with no
      // check-in/out to corroborate it) than check-in, so — unlike
      // check-in — it always requires a PIN, even for an account that
      // never set one. Normally the UI already forces PIN setup before
      // this button is reachable (pinSetStep gates it), but "แก้ไข" on an
      // existing self-report opens this same form without going through
      // that gate, so the handler enforces it independently too.
      if (!hasPin) return showMsg('error', 'กรุณาตั้ง PIN ก่อนใช้งานฟีเจอร์นี้')

      const { date, check_in, check_out, check_out_date, project_name, work_summary, photo_url } = selfReportForm
      if (!date || !check_in) return showMsg('error', 'กรุณากรอกวันที่และเวลาเข้า')
      if (!work_summary.trim() || work_summary.trim().length < 5)
        return showMsg('error', 'กรุณาสรุปงานที่ทำ (อย่างน้อย 5 ตัวอักษร) เพื่อให้ผู้ดูแลตรวจสอบได้')
      if (date > todayThai()) return showMsg('error', 'ไม่สามารถลงเวลาล่วงหน้าได้')
      if (date < minDateThai()) return showMsg('error', 'ลงย้อนหลังได้ไม่เกิน 1 เดือน กรุณาติดต่อผู้ดูแลโดยตรง')
      const outDate = check_out_date || date
      const inISO  = thaiToUTC(date, check_in)
      const outISO = check_out ? thaiToUTC(outDate, check_out) : null
      if (outISO && outISO <= inISO) return showMsg('error', 'เวลาออกต้องมากกว่าเวลาเข้า')
      if (outISO) {
        const mins = (new Date(outISO).getTime() - new Date(inISO).getTime()) / 60000
        if (mins > 16 * 60) return showMsg('error', 'ไม่สามารถลงเวลาเกิน 16 ชั่วโมงต่อครั้งได้')
      }

      // PIN verification and the overlap check are independent of each
      // other — run them as one round-trip instead of two sequential ones.
      const effectiveEnd = outISO || thaiToUTC(date, '23:59')
      let overlapQ = supabase.from('time_logs').select('id').eq('student_id', form.student_id)
        .lt('check_in', effectiveEnd)
        .or(`check_out.is.null,check_out.gt.${inISO}`)
      if (editingLog) overlapQ = overlapQ.neq('id', editingLog.id)
      const [{ ok, locked }, { data: overlaps }] = await Promise.all([verifyPin(pinInput), overlapQ])
      if (!ok) return showMsg('error', locked ? 'กรอก PIN ผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่' : 'กรอก PIN ในช่องด้านบนให้ถูกต้องก่อนส่งคำขอ')
      if (overlaps && overlaps.length > 0) {
        // window.alert() after an `await` gets silently blocked by some
        // mobile browsers (no longer counts as a direct user gesture), so
        // this used to look like the button just did nothing.
        return showMsg('error', 'คุณเคยลงเวลานี้แล้ว กรุณาตรวจสอบประวัติการลงเวลา')
      }
      setSelfReportSaving(true)
      try {
        if (editingLog) {
          const { error } = await supabase.from('time_logs').update({
            check_in: inISO, check_out: outISO, project_name: project_name || null, work_summary: work_summary || null, photo_url,
            is_rejected: false, rejected_reason: null, rejected_at: null,
          }).eq('id', editingLog.id)
          if (error) throw error
          showMsg('success', 'แก้ไขคำขอสำเร็จ ส่งกลับไปรออนุมัติอีกครั้ง')
        } else {
          const { error } = await supabase.from('time_logs').insert({
            student_id: form.student_id, check_in: inISO, check_out: outISO,
            project_name: project_name || null, work_summary: work_summary || null, is_self_reported: true, photo_url,
          })
          if (error) throw error
          showMsg('success', 'ส่งคำขอลงเวลาย้อนหลังแล้ว รอผู้ดูแลตรวจสอบ')
        }
        setSelfReportOpen(false)
        setEditingLog(null)
        fetchHistory(historyMonth)
      } catch (e: unknown) {
        showMsg('error', (e as Error).message)
      } finally { setSelfReportSaving(false) }
    } finally { selfReportLock.current = false }
  }

  const historyTotalMin = historyLogs.reduce((s, l) => {
    if (!l.check_out) return s
    return s + differenceInMinutes(new Date(l.check_out), new Date(l.check_in))
  }, 0)
  const historyDays = new Set(historyLogs.map(l => toThaiTime(l.check_in).toISOString().slice(0, 10))).size
  const approvedCount = historyLogs.filter(l => l.status === 'approved').length
  const rejectedCount = historyLogs.filter(l => l.isRejected).length
  const pendingCount  = historyLogs.filter(l => l.status === 'pending' && !l.isRejected).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex flex-col items-center justify-start pb-24">

      <div className="w-full"><SdecHeader
        subtitle="CoPs — ระบบบันทึกเวลา"
        right={
          <a href="/manager" className="text-xs text-white/80 hover:text-white font-medium whitespace-nowrap transition-colors flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Manager
          </a>
        }
      /></div>

      <div className="w-full max-w-sm space-y-4 p-4 pt-6">

        {/* Live clock */}
        <div className="text-center py-2 anim-fade-in">
          <div className="text-6xl font-light text-gray-900 tracking-tight tabular-nums leading-none">
            {timeStr}
          </div>
          <div className="text-sm text-gray-400 mt-2">{dateStr}</div>
        </div>

        {/* Alert — fixed + high z-index so it's still visible over the
            self-report/feedback modals (both z-50), which otherwise hid it
            completely: a validation error (wrong PIN, duplicate time, etc.)
            while a modal was open looked like the button just did nothing. */}
        {message && (
          // mx-auto centering (not left-1/2 + translate-x) because
          // anim-slide-up's keyframes set `transform` directly and would
          // clobber a translateX-based centering transform.
          <div className={`fixed top-4 inset-x-0 mx-auto z-[60] w-[calc(100%-2rem)] max-w-sm rounded-xl px-4 py-3 text-sm font-medium border shadow-lg anim-slide-up ${
            message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' :
            message.type === 'warn'    ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                         'bg-red-50 text-red-700 border-red-200'
          }`}>
            {message.text}
          </div>
        )}

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

          {/* Active status bar */}
          {activeLog && (
            <div className="bg-blue-700 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span className="text-blue-200 text-xs">กำลังทำงาน</span>
              </div>
              <div className="text-white text-sm">
                <span className="text-blue-300 text-xs">เข้างาน </span>
                <span className="font-semibold">{fmtHHMM(activeLog.check_in)}</span>
              </div>
            </div>
          )}

          <div className="p-5 space-y-4">

            {/* Student ID */}
            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                รหัสนิสิต
              </label>
              <div className="relative">
                <input
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg font-medium tracking-widest bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent disabled:opacity-50 transition-all duration-200 text-center"
                  placeholder="กรอกรหัสนิสิต"
                  value={form.student_id}
                  inputMode="numeric"
                  maxLength={10}
                  disabled={!!activeLog}
                  onChange={e => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                    setForm(f => ({ ...f, student_id: val }))
                    setStudentLocked(false); setStudentNotFound(false)
                    setMessage(null)
                    setHasPin(false); setPinInput('')
                  }}
                  onBlur={handleStudentIdBlur}
                />
                {idLooking && (
                  // animate-pulse (opacity fading in/out on a loop) looked
                  // like a flicker here since idLooking is usually only
                  // true for a few hundred ms — barely enough for one pulse
                  // cycle to start before it's cut off. A spinning icon
                  // reads as "loading" immediately with no fade-in beat.
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-blue-400">
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    ค้นหา...
                  </span>
                )}
              </div>
              {studentNotFound && (
                <p className="text-xs text-red-500 mt-1.5 font-medium text-center">
                  ❌ ไม่พบรหัสนิสิตในระบบ — ติดต่อผู้ดูแลระบบ
                </p>
              )}
            </div>

            {/* Student info card */}
            {studentLocked && (
              <div className="anim-slide-up rounded-xl border border-indigo-100 overflow-hidden">
                <div className="bg-blue-700 px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-400 flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
                    {getInitials(form.name)}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-sm truncate text-white">{form.name}</div>
                    <div className="text-blue-300 text-xs">{form.student_id} · {form.department}</div>
                  </div>
                </div>
                {(form.faculty || form.major) && (
                  <div className="px-4 py-2.5 bg-blue-50 grid grid-cols-2 gap-x-4 gap-y-1">
                    {form.faculty && (
                      <div>
                        <div className="text-xs text-blue-400">คณะ</div>
                        <div className="text-xs text-blue-800 font-medium leading-tight mt-0.5">{form.faculty}</div>
                      </div>
                    )}
                    {form.major && (
                      <div>
                        <div className="text-xs text-blue-400">สาขา</div>
                        <div className="text-xs text-blue-800 font-medium leading-tight mt-0.5">{form.major}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Month summary + status breakdown */}
            {studentLocked && !pinSetStep && (
              <div className="anim-slide-up space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">สรุปเดือน</p>
                  <input
                    type="month"
                    value={historyMonth}
                    onChange={e => { setHistoryMonth(e.target.value); fetchHistory(e.target.value) }}
                    className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5 text-center">
                    <p className="text-[10px] text-blue-400 font-medium mb-0.5">วันทำงาน</p>
                    <p className="text-sm font-bold text-blue-700">{historyLoading ? '...' : `${historyDays} วัน`}</p>
                  </div>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5 text-center">
                    <p className="text-[10px] text-indigo-400 font-medium mb-0.5">ชั่วโมงทำงาน</p>
                    <p className="text-sm font-bold text-indigo-700">
                      {historyLoading ? '...' : `${Math.floor(historyTotalMin / 60)}h ${historyTotalMin % 60}m`}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-green-50 border border-green-100 rounded-xl px-2 py-2 text-center">
                    <p className="text-[10px] text-green-500 font-medium mb-0.5">อนุมัติแล้ว</p>
                    <p className="text-sm font-bold text-green-700">{historyLoading ? '...' : approvedCount}</p>
                  </div>
                  <div className="bg-orange-50 border border-orange-100 rounded-xl px-2 py-2 text-center">
                    <p className="text-[10px] text-orange-500 font-medium mb-0.5">รออนุมัติ</p>
                    <p className="text-sm font-bold text-orange-600">{historyLoading ? '...' : pendingCount}</p>
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-xl px-2 py-2 text-center">
                    <p className="text-[10px] text-red-500 font-medium mb-0.5">ถูกตีกลับ</p>
                    <p className="text-sm font-bold text-red-600">{historyLoading ? '...' : rejectedCount}</p>
                  </div>
                </div>
              </div>
            )}

            {/* PIN setup (first time) — 2 fields at once */}
            {studentLocked && pinSetStep && (
              <div className="anim-slide-up space-y-3">
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest">ตั้ง PIN ครั้งแรก 🔑</p>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">PIN</label>
                  <input
                    type="password" inputMode="numeric" maxLength={4} autoFocus autoComplete="new-password"
                    className="w-full border border-blue-300 rounded-xl px-4 py-3 text-sm bg-blue-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent tracking-widest text-center"
                    placeholder="• • • •"
                    value={pinFirst}
                    onChange={e => setPinFirst(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">ยืนยัน PIN</label>
                  <input
                    type="password" inputMode="numeric" maxLength={4} autoComplete="new-password"
                    className="w-full border border-blue-300 rounded-xl px-4 py-3 text-sm bg-blue-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent tracking-widest text-center"
                    placeholder="• • • •"
                    value={pinConfirm}
                    onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    onKeyDown={e => e.key === 'Enter' && handleSetNewPin()}
                  />
                </div>
                <button
                  onClick={handleSetNewPin}
                  disabled={pinSetting || pinFirst.length !== 4 || pinConfirm.length !== 4}
                  className="w-full bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-colors text-sm">
                  {pinSetting ? 'กำลังบันทึก...' : 'ยืนยัน PIN'}
                </button>
              </div>
            )}

            {/* PIN verify (has PIN) */}
            {studentLocked && hasPin && !pinSetStep && !activeLog && (
              <div className="anim-slide-up">
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">PIN 🔒</label>
                <input
                  type="password" inputMode="numeric" maxLength={4} autoComplete="off"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent tracking-widest text-center"
                  placeholder="กรอก PIN 4 หลัก"
                  value={pinInput}
                  onChange={e => setPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                />
              </div>
            )}

            {/* Work summary for check-out */}
            {activeLog && (
              <div className="anim-slide-up border-t border-gray-100 pt-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">ชื่อโครงงาน</label>
                  <input
                    className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                    placeholder="เช่น Long Dee Market"
                    value={checkOutProject}
                    onChange={e => setCheckOutProject(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">รายละเอียด</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
                    rows={3}
                    placeholder="อธิบายงานที่ทำในวันนี้..."
                    value={workSummary}
                    onChange={e => setWorkSummary(e.target.value)}
                  />
                </div>
                <AttachmentInput value={checkOutPhoto} onChange={setCheckOutPhoto} studentId={form.student_id} />
              </div>
            )}

            {/* Action button */}
            {!pinSetStep && (!activeLog ? (
              <button
                onClick={handleCheckIn}
                disabled={loading || studentNotFound || cooldown > 0 || !studentLocked}
                className="w-full bg-blue-700 hover:bg-blue-800 active:scale-95 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all duration-150 shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300"
              >
                {loading ? 'กำลังบันทึก...' : cooldown > 0 ? `รอ ${cooldown} วินาที...` : 'บันทึกเวลาเข้า'}
              </button>
            ) : (
              <button
                onClick={handleCheckOut}
                disabled={loading || cooldown > 0}
                className="w-full bg-amber-500 hover:bg-amber-600 active:scale-95 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all duration-150 shadow-md shadow-amber-200 hover:shadow-lg hover:shadow-amber-300"
              >
                {loading ? 'กำลังบันทึก...' : cooldown > 0 ? `รอ ${cooldown} วินาที...` : 'บันทึกเวลาออก'}
              </button>
            ))}

            {/* Self-report backdated log */}
            {studentLocked && !activeLog && !pinSetStep && (
              <button onClick={openSelfReport}
                className="w-full text-xs text-gray-400 hover:text-blue-600 font-medium py-1 transition-colors flex items-center justify-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ลืมลงเวลา? กรอกย้อนหลัง
              </button>
            )}

            {/* History toggle */}
            {studentLocked && (
              <button onClick={handleToggleHistory}
                className="w-full text-xs text-gray-400 hover:text-blue-600 font-medium py-1 transition-colors flex items-center justify-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                {showHistory ? 'ซ่อนประวัติ' : 'ดูประวัติเดือนนี้'}
              </button>
            )}
          </div>
        </div>

        {/* Announcements */}
        {announcements.length > 0 && (
          <div className="space-y-2">
            {announcements.map(a => (
              <div key={a.id} className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className="text-lg leading-none mt-0.5">📢</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-amber-900 text-sm">{a.title}</p>
                    <p className="text-sm text-amber-800 mt-1 whitespace-pre-wrap leading-relaxed">{a.body}</p>
                    <p className="text-xs text-amber-500 mt-2">โดย {a.author}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* History panel */}
        {showHistory && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden anim-slide-up">
            <div className="px-5 py-3 border-b border-gray-100 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-700">ประวัติการลงเวลา</p>
                <button onClick={() => fetchHistory(historyMonth)} disabled={historyLoading}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium">
                  {historyLoading ? '...' : 'รีเฟรช'}
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="month"
                  value={historyMonth}
                  onChange={e => { setHistoryMonth(e.target.value); fetchHistory(e.target.value) }}
                  className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
                {!historyLoading && historyLogs.length > 0 && (
                  <p className="text-xs text-gray-400">
                    {historyDays} วัน · {Math.floor(historyTotalMin / 60)}h {historyTotalMin % 60}m
                  </p>
                )}
                <button
                  onClick={() => {
                    let pin = pinInput
                    if (hasPin && pin.length !== 4) {
                      const entered = window.prompt('กรอก PIN 4 หลัก เพื่อดูรายงาน')
                      if (entered === null) return
                      pin = entered.replace(/\D/g, '').slice(0, 4)
                    }
                    const params = new URLSearchParams({ studentId: form.student_id, month: historyMonth })
                    if (pin) params.set('pin', pin)
                    window.open(`/print?${params}`, '_blank')
                  }}
                  className="ml-auto inline-flex items-center gap-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg font-medium transition-colors">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m0-6V5a2 2 0 012-2h6a2 2 0 012 2v6H7z" />
                  </svg>
                  พิมพ์รายงาน
                </button>
              </div>
              <p className="text-[10px] text-gray-400">* แสดงเฉพาะรายการที่ผู้ดูแลอนุมัติแล้วเท่านั้น</p>
            </div>
            {historyLoading ? (
              <div className="py-8 text-center text-gray-400 text-xs">กำลังโหลด...</div>
            ) : historyLogs.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-xs">ไม่มีข้อมูลเดือนนี้</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">วันที่</th>
                      <th className="px-3 py-2 text-left font-medium">เข้า</th>
                      <th className="px-3 py-2 text-left font-medium">ออก</th>
                      <th className="px-3 py-2 text-left font-medium">ชม.</th>
                      <th className="px-3 py-2 text-left font-medium">งาน</th>
                      <th className="px-3 py-2 text-left font-medium">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {historyLogs.map((log, i) => (
                      <tr key={log.id} className={i % 2 === 1 ? 'bg-gray-50/50' : ''}>
                        <td className="px-3 py-2 text-gray-600" style={{ lineHeight: 1.8 }}>
                          {log.dateStr}
                          {log.isSelfReported && <span className="block text-[10px] text-blue-500 font-medium whitespace-nowrap">ลงเองย้อนหลัง</span>}
                        </td>
                        <td className="px-3 py-2 text-green-600 font-medium" style={{ lineHeight: 1.8 }}>{log.checkInStr}</td>
                        <td className="px-3 py-2 text-rose-500 font-medium" style={{ lineHeight: 1.8 }}>{log.checkOutStr}</td>
                        <td className="px-3 py-2 text-gray-600" style={{ lineHeight: 1.8 }}>{log.durationStr}</td>
                        <td className="px-3 py-2 text-gray-400 max-w-[100px]" style={{ lineHeight: 1.8 }}>
                          {log.project_name && <div className="truncate font-medium text-gray-600">{log.project_name}</div>}
                          <div className="truncate">{log.work_summary || '-'}</div>
                          {log.photo_url && (
                            <a href={log.photo_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline whitespace-nowrap">📎 ไฟล์แนบ</a>
                          )}
                        </td>
                        <td className="px-3 py-2" style={{ lineHeight: 1.8 }}>
                          {log.status === 'approved'
                            ? <span className="inline-block bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full border border-green-200 whitespace-nowrap">✓ อนุมัติ</span>
                            : log.isRejected
                            ? <span className="inline-block bg-red-50 text-red-600 text-xs px-2 py-0.5 rounded-full border border-red-200 whitespace-nowrap">✕ ถูกตีกลับ</span>
                            : <span className="inline-block bg-orange-50 text-orange-600 text-xs px-2 py-0.5 rounded-full border border-orange-200 whitespace-nowrap">รออนุมัติ</span>
                          }
                          {log.isRejected && log.rejectedReason && (
                            <p className="text-[10px] text-red-500 mt-0.5 max-w-[100px]">เหตุผล: {log.rejectedReason}</p>
                          )}
                          {log.isSelfReported && log.status === 'pending' && (
                            <div className="flex gap-2 mt-0.5">
                              <button onClick={() => openEditSelfReport(log)} className="text-[10px] text-blue-500 hover:text-blue-700 font-medium">แก้ไข</button>
                              <button onClick={() => handleDeleteSelfReport(log)} className="text-[10px] text-red-400 hover:text-red-600 font-medium">ลบ</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Contact footer */}
        <div className="text-center space-y-2 pb-2">
          <p className="text-xs text-gray-400 font-medium">ติดต่อผู้พัฒนา</p>
          <p className="text-xs text-gray-500">
            <span className="text-gray-400">โทร</span> 063-093-6726
            <span className="mx-2 text-gray-300">·</span>
            <span className="text-gray-400">Line</span> wave13045879
          </p>
          <div className="flex justify-center gap-4">
            {[
              { label: 'Facebook',  href: 'https://www.facebook.com/winny.5621149/', external: true },
              { label: 'Instagram', href: 'https://www.instagram.com/potato_ps.ps/', external: true },
              { label: 'About Me',  href: 'https://sawaddee-khonnarak.onrender.com/', external: true },
              { label: 'คู่มือ',   href: '/guide', external: false },
            ].map(l => (
              <a key={l.label} href={l.href}
                {...(l.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="text-xs text-gray-400 hover:text-blue-600 transition-colors">
                {l.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Toothless mascot */}
      <div className="fixed bottom-3 right-3 z-10 flex flex-col items-center gap-1 cursor-pointer select-none"
        onClick={() => {
          if (!playing) {
            if (!audioRef.current) {
              audioRef.current = new Audio('/toothless.mp3')
              audioRef.current.loop = true
            }
            audioRef.current.play().catch(() => {})
            setPlaying(true)
          } else {
            audioRef.current?.pause()
            setPlaying(false)
          }
        }}>
        {playing && (
          <span className="text-xs text-blue-600 font-medium bg-white/80 rounded-full px-2 py-0.5 shadow-sm">
            ♪ กำลังเล่น
          </span>
        )}
        <div className={`relative ${playing ? 'drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]' : 'drop-shadow-lg'}`}>
          <img
            src="/toothless.gif"
            alt="toothless"
            fetchPriority="low"
            className="w-14 h-14 sm:w-20 sm:h-20 object-contain"
          />
        </div>
      </div>


      {/* ── Self-report backdated log Modal ─────────────────────────────────── */}
      {selfReportOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden">
            <div className="bg-gradient-to-br from-blue-700 to-blue-800 px-6 py-4 flex items-start justify-between gap-3 flex-shrink-0">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <svg className="w-4.5 h-4.5 text-white" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg leading-tight">{editingLog ? 'แก้ไขคำขอลงเวลา' : 'ลงเวลาย้อนหลัง'}</h3>
                  <p className="text-xs text-blue-100 mt-1 leading-relaxed">
                    {editingLog
                      ? 'แก้ไขได้เฉพาะรายการที่ยังรออนุมัติอยู่'
                      : 'สำหรับวันที่ทำงานไปแล้วแต่ลืมลงเวลา — รายการนี้จะถูกส่งไปรออนุมัติจากผู้ดูแล'}
                  </p>
                </div>
              </div>
              <button onClick={() => { setSelfReportOpen(false); setEditingLog(null) }}
                className="text-white/70 hover:text-white flex-shrink-0 p-1 -mr-1 -mt-1 rounded-lg hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">วันที่</label>
                <input
                  type="date" min={minDateThai()} max={todayThai()} value={selfReportForm.date}
                  onChange={e => setSelfReportForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                />
              </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5 text-center">เวลาเข้า</label>
              <TimeWheelPicker value={selfReportForm.check_in} onChange={t => setSelfReportForm(f => ({ ...f, check_in: t }))} minuteStep={30} />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-widest">เวลาออก</label>
                <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox" checked={!!selfReportForm.check_out}
                    onChange={e => setSelfReportForm(f => ({ ...f, check_out: e.target.checked ? '18:00' : '', check_out_date: e.target.checked ? f.date : '' }))}
                  />
                  ระบุเวลาออก
                </label>
              </div>
              {selfReportForm.check_out && (
                <div className="space-y-2">
                  <input
                    type="date" min={selfReportForm.date} value={selfReportForm.check_out_date || selfReportForm.date}
                    onChange={e => setSelfReportForm(f => ({ ...f, check_out_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-2 text-xs bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                  <TimeWheelPicker value={selfReportForm.check_out} onChange={t => setSelfReportForm(f => ({ ...f, check_out: t }))} minuteStep={30} />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">ชื่อโครงงาน</label>
              <input
                placeholder="เช่น Long Dee Market"
                value={selfReportForm.project_name}
                onChange={e => setSelfReportForm(f => ({ ...f, project_name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1.5">รายละเอียด</label>
              <textarea
                rows={3}
                placeholder="อธิบายงานที่ทำในวันนั้น..."
                value={selfReportForm.work_summary}
                onChange={e => setSelfReportForm(f => ({ ...f, work_summary: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent resize-none"
              />
            </div>

            <AttachmentInput
              value={selfReportForm.photo_url}
              onChange={url => setSelfReportForm(f => ({ ...f, photo_url: url }))}
              studentId={form.student_id}
            />

            <div className="flex gap-3">
              <button onClick={() => { setSelfReportOpen(false); setEditingLog(null) }}
                className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                ยกเลิก
              </button>
              <button
                onClick={handleSelfReport}
                disabled={selfReportSaving}
                className="flex-1 bg-blue-700 hover:bg-blue-800 disabled:opacity-40 text-white text-sm font-medium py-2.5 rounded-xl transition-colors">
                {selfReportSaving ? 'กำลังส่ง...' : editingLog ? 'บันทึกการแก้ไข' : 'บันทึกเวลาย้อนหลัง'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Feedback Modal ────────────────────────────────────────────────── */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-5">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-800 text-lg">ให้คะแนนระบบ</h3>
              <p className="text-sm text-gray-500 mt-1">{feedbackModal.message}</p>
            </div>

            {/* Star rating */}
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(s => (
                <button key={s} onClick={() => setFeedbackRating(s)}
                  className={`text-4xl transition-transform hover:scale-110 ${s <= feedbackRating ? 'text-yellow-400' : 'text-gray-300'}`}>
                  ★
                </button>
              ))}
            </div>
            {feedbackRating > 0 && (
              <p className="text-center text-sm text-gray-500">
                {['', 'แย่มาก', 'พอใช้', 'ดี', 'ดีมาก', 'ยอดเยี่ยม'][feedbackRating]}
              </p>
            )}

            {/* Comment */}
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
              rows={3}
              placeholder="ความคิดเห็นเพิ่มเติม (ไม่บังคับ)"
              value={feedbackComment}
              onChange={e => setFeedbackComment(e.target.value)}
            />

            <div className="flex gap-3">
              <button onClick={() => setFeedbackModal(null)}
                className="flex-1 border border-gray-200 text-gray-500 text-sm font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                ข้าม
              </button>
              <button
                disabled={feedbackRating === 0 || feedbackSaving}
                onClick={async () => {
                  if (!feedbackRating) return
                  setFeedbackSaving(true)
                  await fetch('/api/feedback/response', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      campaign_id: feedbackModal.campaignId,
                      respondent_type: 'student',
                      respondent_id: feedbackStudent?.id || 'unknown',
                      respondent_name: feedbackStudent?.name,
                      rating: feedbackRating,
                      comment: feedbackComment || null,
                    }),
                  })
                  setFeedbackSaving(false)
                  setFeedbackModal(null)
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
