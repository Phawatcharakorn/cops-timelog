'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { type Student } from '@/lib/supabase'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

const GEN_COLORS: Record<number, string> = {
  1: '#7c3aed', 2: '#2563eb', 3: '#16a34a', 4: '#ea580c', 5: '#e11d48',
}

const tdS: React.CSSProperties = { border: '1px solid #d1d5db', padding: '5px 8px', color: '#374151', verticalAlign: 'top' }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#1a3a5c', margin: '0 0 4px', paddingBottom: 4, borderBottom: '1px solid #d1d5db' }}>{title}</p>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: 'flex', gap: 12, borderBottom: '1px solid #e5e7eb', padding: '6px 14px', alignItems: 'start' }}>
      <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, flexShrink: 0, minWidth: 110 }}>{label}</span>
      <span style={{ fontSize: 12, color: '#111827', fontWeight: 600, wordBreak: 'break-word' }}>{value || '-'}</span>
    </div>
  )
}

export default function PrintRosterClient() {
  const params      = useSearchParams()
  const dept        = params.get('dept') || ''
  const genParam    = params.get('gen')
  const studentId   = params.get('studentId') || ''
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    ;(async () => {
      const token = localStorage.getItem('mgr_token') || localStorage.getItem('dev_token') || ''
      const qs = new URLSearchParams()
      if (studentId) qs.set('id', studentId)
      else if (dept) qs.set('dept', dept)

      const res = await fetch(`/api/students?${qs}`, { headers: { 'x-token': token } })
      let data: Student[] = res.ok ? await res.json() : []
      if (!Array.isArray(data)) data = data ? [data] : []
      if (!studentId && genParam) data = data.filter(s => s.gen === Number(genParam))
      data.sort((a, b) => {
        const g = (a.gen ?? Infinity) - (b.gen ?? Infinity)
        return g !== 0 ? g : a.name.localeCompare(b.name, 'th')
      })

      setStudents(data)
      setLoading(false)
    })()
  }, [dept, genParam, studentId])

  useEffect(() => {
    if (!loading && students.length > 0) setTimeout(() => window.print(), 700)
  }, [loading, students])

  if (loading) return <div style={{ padding: 40, color: '#999', fontFamily: 'Sarabun, sans-serif' }}>กำลังโหลด...</div>

  const printedAt = format(new Date(), "d MMM yyyy, HH:mm 'น.'", { locale: th })

  /* ── Single student — full A4 portrait ── */
  if (students.length === 1) {
    const s = students[0]
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

        <div className="no-print" style={{ background: '#1a3a5c', color: 'white', padding: '8px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>รายละเอียดสมาชิก — {s.name}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`/api/export-members?studentId=${s.student_id}`} download
              style={{ background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Excel
            </a>
            <button onClick={() => window.print()}
              style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
              PDF
            </button>
          </div>
        </div>

        <div className="page-body" style={{ maxWidth: 680, margin: '20px auto', background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,.12)', padding: '32px 40px' }}>

          {/* Letterhead — logo centered */}
          <div style={{ borderBottom: '2px solid #1a3a5c', paddingBottom: 10, marginBottom: 16, textAlign: 'center' }}>
            <p style={{ textAlign: 'right', fontSize: 10, color: '#9ca3af', margin: '0 0 6px' }}>{printedAt}</p>
            <img src="/kus-logo.svg" alt="KUS Logo" style={{ display: 'block', width: 70, height: 70, objectFit: 'contain', margin: '0 auto 6px' }} />
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1a3a5c', margin: 0 }}>มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตศรีราชา</p>
            <p style={{ fontSize: 12, color: '#374151', margin: 0 }}>Kasetsart University Sriracha Campus</p>
          </div>

          {/* Title */}
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1a3a5c', margin: 0 }}>รายละเอียดสมาชิก CoPs</p>
          </div>

          {/* ข้อมูลส่วนตัว — กรอบเดียว */}
          <div style={{ border: '1.5px solid #1a3a5c', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
            <div style={{ background: '#1a3a5c', padding: '6px 14px' }}>
              <p style={{ color: 'white', fontSize: 12, fontWeight: 700, margin: 0 }}>ข้อมูลส่วนตัว</p>
            </div>
            <InfoRow label="ชื่อ-นามสกุล"   value={s.name} />
            <InfoRow label="รหัสนิสิต"        value={s.student_id} />
            <InfoRow label="ฝ่าย / กลุ่มงาน" value={s.department} />
            <InfoRow label="รุ่นที่ (Gen)"     value={s.gen != null ? `รุ่นที่ ${s.gen}` : null} />
            <InfoRow label="สถานะ"             value={s.status} />
          </div>

          {/* ส่วนอื่น — ไม่มีกรอบ แค่หัวข้อ + rows */}
          <Section title="ข้อมูลการศึกษา">
            <InfoRow label="คณะ"      value={s.faculty} />
            <InfoRow label="สาขาวิชา" value={s.major} />
          </Section>

          <Section title="ข้อมูลส่วนตัวเพิ่มเติม">
            <InfoRow label="เพศ"      value={s.gender} />
            <InfoRow label="วันเกิด"  value={s.birthdate ? new Date(s.birthdate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : null} />
            <InfoRow label="ศาสนา"    value={s.religion} />
            <InfoRow label="สัญชาติ"  value={s.nationality} />
          </Section>

          <Section title="ข้อมูลการติดต่อ">
            <InfoRow label="เบอร์โทรศัพท์"   value={s.phone} />
            <InfoRow label="E-mail"            value={s.email} />
            <InfoRow label="เลขบัตรประจำตัว" value={s.national_id} />
          </Section>

          {s.note && (
            <Section title="หมายเหตุ">
              <div style={{ padding: '6px 14px', fontSize: 12, color: '#374151' }}>{s.note}</div>
            </Section>
          )}
        </div>
      </div>
    )
  }

  /* ── Multi student — landscape A4 table ── */
  const withGen    = students.filter(s => s.gen != null)
  const withoutGen = students.filter(s => s.gen == null)
  const gens       = Array.from(new Set(withGen.map(s => s.gen as number))).sort()
  const subtitle   = [dept, genParam ? `รุ่นที่ ${genParam}` : ''].filter(Boolean).join(' · ')

  // Continuous numbering across all groups
  let globalIdx = 0
  const sections: { genNum: number | null; group: Student[] }[] = [
    ...gens.map(g => ({ genNum: g, group: withGen.filter(s => s.gen === g) })),
    ...(withoutGen.length > 0 ? [{ genNum: null, group: withoutGen }] : []),
  ]

  return (
    <div style={{ fontFamily: 'Sarabun, sans-serif', padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
        @page { size: A4 landscape; margin: 12mm 14mm; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; margin: 0; padding: 0; }
        }
      `}</style>

      {/* Letterhead */}
      <div style={{ borderBottom: '2px solid #1a3a5c', paddingBottom: 10, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src="/kus-logo.svg" alt="KUS Logo" style={{ width: 64, height: 64, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1a3a5c', margin: 0 }}>มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตศรีราชา</p>
            <p style={{ fontSize: 12, color: '#374151', margin: 0 }}>Kasetsart University Sriracha Campus</p>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#1a3a5c', margin: '4px 0 0' }}>รายละเอียดสมาชิก CoPs</p>
            {subtitle && <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{subtitle}</p>}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>{printedAt}</p>
          <p style={{ fontSize: 12, color: '#374151', margin: '4px 0 0' }}>ทั้งหมด <strong>{students.length}</strong> คน</p>
        </div>
      </div>

      {/* Tables */}
      {sections.map(({ genNum, group }) => {
        if (group.length === 0) return null
        const color = genNum != null ? (GEN_COLORS[genNum] ?? '#374151') : '#6b7280'
        const label = genNum != null ? `รุ่นที่ ${genNum} (${group.length} คน)` : `ยังไม่ระบุรุ่น (${group.length} คน)`
        return (
          <div key={genNum ?? 'none'} style={{ marginBottom: 20, breakInside: 'avoid' }}>
            <div style={{ background: color, color: 'white', padding: '5px 12px', borderRadius: '6px 6px 0 0', fontSize: 12, fontWeight: 700 }}>{label}</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
              <thead>
                <tr>
                  {['#','ชื่อ-นามสกุล','รหัสนิสิต','ฝ่าย','คณะ / สาขาวิชา','เพศ','วันเกิด','ศาสนา','สัญชาติ','เบอร์โทร','E-mail','เลขบัตรประชาชน','สถานะ','หมายเหตุ'].map(h => (
                    <th key={h} style={{ background: '#1a3a5c', color: 'white', padding: '5px 8px', textAlign: 'left', border: '1px solid #0f2744', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.map((s, i) => {
                  globalIdx++
                  const num = globalIdx
                  return (
                    <tr key={s.student_id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', background: i % 2 === 1 ? '#e8edf5' : 'white' }}>
                      <td style={{ ...tdS, textAlign: 'center', color: '#9ca3af' }}>{num}</td>
                      <td style={{ ...tdS, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.name}</td>
                      <td style={{ ...tdS, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{s.student_id}</td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{s.department}</td>
                      <td style={tdS}>{[s.faculty, s.major].filter(Boolean).join(' · ') || '-'}</td>
                      <td style={{ ...tdS, textAlign: 'center' }}>{s.gender ?? '-'}</td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{s.birthdate ? new Date(s.birthdate).toLocaleDateString('th-TH') : '-'}</td>
                      <td style={{ ...tdS, textAlign: 'center' }}>{s.religion ?? '-'}</td>
                      <td style={{ ...tdS, textAlign: 'center' }}>{s.nationality ?? '-'}</td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{s.phone ?? '-'}</td>
                      <td style={tdS}>{s.email ?? '-'}</td>
                      <td style={{ ...tdS, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{s.national_id ?? '-'}</td>
                      <td style={{ ...tdS, whiteSpace: 'nowrap' }}>{s.status ?? '-'}</td>
                      <td style={tdS}>{s.note ?? '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      })}

      <button className="no-print" onClick={() => window.print()}
        style={{ marginTop: 16, background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '10px 28px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
        พิมพ์ / บันทึก PDF
      </button>
    </div>
  )
}
