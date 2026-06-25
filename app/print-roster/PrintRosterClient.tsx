'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, type Student } from '@/lib/supabase'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

const GEN_COLORS: Record<number, string> = {
  1: '#7c3aed', 2: '#2563eb', 3: '#16a34a', 4: '#ea580c', 5: '#e11d48',
}

export default function PrintRosterClient() {
  const params   = useSearchParams()
  const dept     = params.get('dept') || ''
  const genParam = params.get('gen')
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    ;(async () => {
      let q = supabase.from('students').select('*')
        .order('gen', { ascending: true, nullsFirst: false }).order('name')
      if (dept) q = q.eq('department', dept)
      if (genParam) q = q.eq('gen', Number(genParam))
      const { data } = await q
      setStudents(data ?? [])
      setLoading(false)
    })()
  }, [dept, genParam])

  useEffect(() => {
    if (!loading && students.length > 0) {
      setTimeout(() => window.print(), 700)
    }
  }, [loading, students])

  if (loading) return <div style={{ padding: 40, color: '#999', fontFamily: 'Sarabun, sans-serif' }}>กำลังโหลด...</div>

  const withGen    = students.filter(s => s.gen != null)
  const withoutGen = students.filter(s => s.gen == null)
  const gens       = Array.from(new Set(withGen.map(s => s.gen as number))).sort()

  const subtitle = [dept, genParam ? `รุ่นที่ ${genParam}` : ''].filter(Boolean).join(' · ')
  const printedAt = format(new Date(), "d MMM yyyy, HH:mm 'น.'", { locale: th })

  const TableSection = ({ group, genNum }: { group: Student[]; genNum: number | null }) => {
    if (group.length === 0) return null
    const color = genNum ? (GEN_COLORS[genNum] ?? '#374151') : '#374151'
    return (
      <div style={{ marginBottom: 24, breakInside: 'avoid' }}>
        {genNum != null ? (
          <div style={{ background: color, color: 'white', padding: '5px 12px', borderRadius: '6px 6px 0 0', fontSize: 12, fontWeight: 700 }}>
            รุ่นที่ {genNum} ({group.length} คน)
          </div>
        ) : (
          <div style={{ background: '#6b7280', color: 'white', padding: '5px 12px', borderRadius: '6px 6px 0 0', fontSize: 12, fontWeight: 700 }}>
            ยังไม่ระบุรุ่น ({group.length} คน)
          </div>
        )}
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10 }}>
          <thead>
            <tr>
              {['#','ชื่อ-นามสกุล','รหัสนิสิต','ฝ่าย','คณะ / สาขาวิชา','เพศ','วันเกิด','ศาสนา','สัญชาติ','เบอร์โทร','E-mail','เลขบัตรประชาชน','สถานะ','หมายเหตุ'].map(h => (
                <th key={h} style={{ background: '#1a3a5c', color: 'white', padding: '5px 8px', textAlign: 'left', border: '1px solid #0f2744', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.map((s, i) => (
              <tr key={s.student_id} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', background: i % 2 === 1 ? '#e8edf5' : 'white' }}>
                <td style={tdS}>{i + 1}</td>
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
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: 'Sarabun, sans-serif', padding: '20px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap');
        @page { size: A4 landscape; margin: 12mm 14mm; }
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; margin: 0; padding: 0; }
          .page-wrap { padding: 0 !important; max-width: none !important; }
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

      {/* Tables by gen */}
      {gens.map(g => (
        <TableSection key={g} group={withGen.filter(s => s.gen === g)} genNum={g} />
      ))}
      <TableSection group={withoutGen} genNum={null} />

      <button className="no-print" onClick={() => window.print()}
        style={{ marginTop: 16, background: '#1a3a5c', color: 'white', border: 'none', borderRadius: 8, padding: '10px 28px', fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
        พิมพ์ / บันทึก PDF
      </button>
    </div>
  )
}

const tdS: React.CSSProperties = { border: '1px solid #d1d5db', padding: '5px 8px', color: '#374151', verticalAlign: 'top' }
