'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, type Student, type TimeLog } from '@/lib/supabase'
import { monthRangeISO } from '@/lib/retention'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

const tdS: React.CSSProperties = { border: '1px solid #d1d5db', padding: '6px 10px', color: '#374151', verticalAlign: 'top' }

function InfoCell({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: '#6b7280', margin: '0 0 2px' }}>{label}</p>
      <p style={{ fontSize: 12, color: '#111827', fontWeight: 700, margin: 0 }}>{value || '-'}</p>
    </div>
  )
}

function fmtHM(minutes: number) {
  return `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`
}

export default function PrintWorklogClient() {
  const params    = useSearchParams()
  const studentId = params.get('studentId') || ''
  const month     = params.get('month') || format(new Date(), 'yyyy-MM')

  const [student, setStudent] = useState<Student | null>(null)
  const [logs, setLogs]       = useState<TimeLog[]>([])
  const [loading, setLoading] = useState(true)
  const [projectName, setProjectName] = useState('')

  useEffect(() => {
    if (!studentId) { setLoading(false); return }
    const fetchData = async () => {
      const [year, m] = month.split('-').map(Number)
      const { startISO, endISO } = monthRangeISO({ year, month: m })
      const [{ data: s }, { data: l }] = await Promise.all([
        supabase.from('students').select('*').eq('student_id', studentId).maybeSingle(),
        supabase.from('time_logs').select('*').eq('student_id', studentId)
          .gte('check_in', startISO).lte('check_in', endISO).order('check_in', { ascending: true }),
      ])
      setStudent(s ?? null)
      // Only approved logs count toward a payroll-facing report — pending
      // or rejected entries haven't been signed off yet.
      setLogs(((l ?? []) as TimeLog[]).filter(log => log.check_out && !log.is_rejected && log.status === 'approved'))
      setLoading(false)
    }
    void fetchData()
    // A log added/edited a moment ago can still read back as its pre-write
    // value for a second or two (Supabase-side read consistency lag, seen
    // even querying PostgREST directly right after a write) — one quiet
    // re-fetch shortly after mount self-heals a report opened immediately
    // after saving a log, without the visible flash of a manual reload.
    const settleTimer = setTimeout(() => void fetchData(), 1500)

    // A tab left open from an earlier click (or restored via the browser's
    // back/forward cache) doesn't remount, so its one-time effect above
    // never runs again — the printed numbers silently go stale the moment
    // any log for this student changes elsewhere. Re-fetch whenever this
    // tab is actually looked at again instead of relying on a manual reload.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) void fetchData() }
    const onVisible = () => { if (document.visibilityState === 'visible') void fetchData() }
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearTimeout(settleTimer)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [studentId, month])

  if (!studentId) return <div style={{ padding: 40, color: '#999', fontFamily: 'Sarabun, sans-serif' }}>ไม่พบรหัสนิสิต</div>
  if (loading) return <div style={{ padding: 40, color: '#999', fontFamily: 'Sarabun, sans-serif' }}>กำลังโหลด...</div>

  const printedAt   = format(new Date(), "d MMM yyyy, HH:mm 'น.'", { locale: th })
  const monthLabel  = format(new Date(`${month}-01`), 'MMMM yyyy', { locale: th })
  const toThaiDate  = (iso: string) => new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 10)

  const totalMinutes = logs.reduce((sum, l) => {
    if (!l.check_out || l.is_auto_closed) return sum
    return sum + Math.max(0, Math.round((new Date(l.check_out).getTime() - new Date(l.check_in).getTime()) / 60000))
  }, 0)
  const totalDays = new Set(logs.map(l => toThaiDate(l.check_in))).size
  const avgMinutesPerDay = totalDays > 0 ? Math.round(totalMinutes / totalDays) : 0

  // A morning shift and an afternoon shift on the same day are two separate
  // logs but one day of work for a payroll report — collapse same-day logs
  // into a single row with hours summed, instead of listing each visit.
  type DayRow = { date: string; firstIn: string; lastOut: string; minutes: number; items: TimeLog[] }
  const dayRows: DayRow[] = []
  {
    const byDate = new Map<string, DayRow>()
    for (const log of logs) {
      const date = toThaiDate(log.check_in)
      const mins = (log.check_out && !log.is_auto_closed)
        ? Math.max(0, Math.round((new Date(log.check_out).getTime() - new Date(log.check_in).getTime()) / 60000))
        : 0
      const existing = byDate.get(date)
      if (!existing) {
        byDate.set(date, { date, firstIn: log.check_in, lastOut: log.check_out ?? log.check_in, minutes: mins, items: [log] })
      } else {
        existing.minutes += mins
        if (log.check_in < existing.firstIn) existing.firstIn = log.check_in
        if (log.check_out && log.check_out > existing.lastOut) existing.lastOut = log.check_out
        existing.items.push(log)
      }
    }
    dayRows.push(...Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date)))
  }

  return (
    <div style={{ fontFamily: 'Sarabun, sans-serif' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #f3f4f6; }
        @page { size: A4 portrait; margin: 14mm 16mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          .page-body { padding: 0 !important; box-shadow: none !important; margin: 0 !important; max-width: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="no-print" style={{ background: '#1a3a5c', color: 'white', padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>{student?.name ?? studentId} — {monthLabel}</span>
        <input
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          placeholder="ชื่อโครงการ"
          style={{ flex: 1, maxWidth: 480, background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.25)', borderRadius: 6, padding: '6px 12px', fontSize: 13, color: 'white', fontFamily: 'inherit' }}
        />
        <button onClick={() => window.print()}
          style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          ดาวน์โหลด PDF
        </button>
      </div>

      <div className="page-body" style={{ maxWidth: 900, margin: '20px auto', background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,.12)', padding: '32px 40px' }}>

        {/* Letterhead */}
        <div style={{ borderBottom: '2px solid #1a3a5c', paddingBottom: 10, marginBottom: 16, textAlign: 'center' }}>
          <p style={{ textAlign: 'right', fontSize: 10, color: '#9ca3af', margin: '0 0 6px' }}>{printedAt}</p>
          <img src="/kus-logo.svg" alt="KUS Logo" style={{ display: 'block', width: 64, height: 64, objectFit: 'contain', margin: '0 auto 6px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1a3a5c', margin: 0 }}>มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตศรีราชา</p>
          <p style={{ fontSize: 12, color: '#374151', margin: 0 }}>Kasetsart University Sriracha Campus</p>
        </div>

        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1a3a5c', margin: 0 }}>รายงานการลงเวลาปฏิบัติงาน</p>
          <p style={{ fontSize: 12, color: '#6b7280', margin: '2px 0 0' }}>ประจำเดือน {monthLabel}{projectName ? ` — โครงการ: ${projectName}` : ''}</p>
        </div>

        {/* Student info box */}
        <div style={{ border: '1.5px solid #1a3a5c', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ background: '#1a3a5c', padding: '6px 14px' }}>
            <p style={{ color: 'white', fontSize: 12, fontWeight: 700, margin: 0 }}>ข้อมูลนิสิต</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', padding: '12px 16px' }}>
            <InfoCell label="ชื่อ-นามสกุล" value={student?.name} />
            <InfoCell label="รหัสนิสิต" value={student?.student_id ?? studentId} />
            <InfoCell label="คณะ" value={student?.faculty} />
            <InfoCell label="สาขาวิชา" value={student?.major} />
            <InfoCell label="ฝ่าย / กลุ่มงาน" value={student?.department} />
            <InfoCell label="ช่วงเวลา" value={monthLabel} />
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 18 }}>
          {[
            { label: 'จำนวนวันที่ปฏิบัติงาน', value: `${totalDays} วัน`, color: '#7c3aed' },
            { label: 'ชั่วโมงทำงานทั้งหมด',   value: fmtHM(totalMinutes), color: '#16a34a' },
            { label: 'เฉลี่ยต่อวัน',           value: fmtHM(avgMinutesPerDay), color: '#2563eb' },
          ].map(c => (
            <div key={c.label} style={{ border: `1px solid ${c.color}33`, background: `${c.color}0d`, borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: c.color, margin: 0 }}>{c.value}</p>
              <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0' }}>{c.label}</p>
            </div>
          ))}
        </div>

        {/* Detail table */}
        <p style={{ fontSize: 12, fontWeight: 700, color: '#1a3a5c', margin: '0 0 6px' }}>รายละเอียดการลงเวลาปฏิบัติงาน</p>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 11, marginBottom: 16 }}>
          <thead>
            <tr>
              {['ลำดับ', 'วันที่', 'เวลาเข้า', 'เวลาออก', 'ชั่วโมง', 'สรุปงานที่ปฏิบัติ'].map(h => (
                <th key={h} style={{ background: '#1a3a5c', color: 'white', padding: '6px 10px', textAlign: 'left', border: '1px solid #0f2744', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dayRows.length === 0 && (
              <tr><td colSpan={6} style={{ ...tdS, textAlign: 'center', color: '#9ca3af' }}>ไม่มีข้อมูลการลงเวลาในเดือนนี้</td></tr>
            )}
            {dayRows.map((row, i) => (
              <tr key={row.date} style={{ background: i % 2 === 1 ? '#e8edf5' : 'white' }}>
                <td style={{ ...tdS, textAlign: 'center', color: '#9ca3af' }}>{i + 1}</td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{format(new Date(row.firstIn), 'd MMM yy', { locale: th })}</td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{format(new Date(row.firstIn), 'HH:mm')}</td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{format(new Date(row.lastOut), 'HH:mm')}</td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{Math.floor(row.minutes / 60)}h {row.minutes % 60}m</td>
                <td style={tdS}>
                  {row.items.map((log, j) => (
                    <div key={log.id} style={{ marginTop: j > 0 ? 6 : 0, paddingTop: j > 0 ? 6 : 0, borderTop: j > 0 ? '1px dashed #d1d5db' : undefined }}>
                      {log.project_name && <div style={{ fontWeight: 700 }}>{log.project_name}</div>}
                      <div style={{ color: '#6b7280' }}>{log.work_summary || '-'}</div>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Footer totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 40, fontSize: 12, marginBottom: 30 }}>
          <p style={{ margin: 0 }}>จำนวนวันปฏิบัติงาน <strong>{totalDays} วัน</strong></p>
          <p style={{ margin: 0 }}>รวมทั้งหมด <strong>{fmtHM(totalMinutes)}</strong></p>
        </div>

        {/* Signatures */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, textAlign: 'center', fontSize: 11, color: '#374151' }}>
          <div>
            <p style={{ borderTop: '1px solid #9ca3af', margin: '30px 8px 4px', paddingTop: 6 }}>ลายมือชื่อนิสิต</p>
            <p style={{ margin: 0 }}>({student?.name ?? '-'})</p>
          </div>
          <div>
            <p style={{ borderTop: '1px solid #9ca3af', margin: '30px 8px 4px', paddingTop: 6 }}>ลงชื่อพี่เลี้ยงหรือคนดูแล</p>
            <p style={{ margin: 0 }}>(..............................)</p>
          </div>
          <div>
            <p style={{ borderTop: '1px solid #9ca3af', margin: '30px 8px 4px', paddingTop: 6 }}>ลายมือชื่อผู้อนุมัติ</p>
            <p style={{ margin: 0 }}>(..............................)</p>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 10, color: '#9ca3af', marginTop: 30 }}>สร้างโดยระบบลงเวลา — {printedAt}</p>
      </div>
    </div>
  )
}
