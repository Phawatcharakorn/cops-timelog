'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase, type Student } from '@/lib/supabase'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

function InfoCell({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p style={{ fontSize: 10, color: '#6b7280', margin: '0 0 2px' }}>{label}</p>
      <p style={{ fontSize: 12, color: '#111827', fontWeight: 700, margin: 0 }}>{value || '-'}</p>
    </div>
  )
}

function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|heic)$/i.test(url.split('?')[0])
}

export default function PrintBookbankClient() {
  const params    = useSearchParams()
  const studentId = params.get('studentId') || ''

  const [student, setStudent] = useState<Student | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!studentId) { setLoading(false); return }
    supabase.from('students').select('*').eq('student_id', studentId).maybeSingle()
      .then(({ data }) => { setStudent(data ?? null); setLoading(false) })
  }, [studentId])

  if (!studentId) return <div style={{ padding: 40, color: '#999', fontFamily: 'Sarabun, sans-serif' }}>ไม่พบรหัสนิสิต</div>
  if (loading) return <div style={{ padding: 40, color: '#999', fontFamily: 'Sarabun, sans-serif' }}>กำลังโหลด...</div>

  const printedAt = format(new Date(), "d MMM yyyy, HH:mm 'น.'", { locale: th })
  const bookUrl   = student?.bank_book_url ?? null

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

      <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, background: '#1a3a5c', color: 'white', padding: '8px 20px' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{student?.name ?? studentId} — สมุดบัญชี</span>
        <button onClick={() => window.print()}
          style={{ marginLeft: 'auto', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, padding: '6px 16px', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          ดาวน์โหลด PDF
        </button>
      </div>

      <div className="page-body" style={{ maxWidth: 700, margin: '20px auto', background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,.12)', padding: '32px 40px' }}>

        {/* Letterhead */}
        <div style={{ borderBottom: '2px solid #1a3a5c', paddingBottom: 10, marginBottom: 16, textAlign: 'center' }}>
          <p style={{ textAlign: 'right', fontSize: 10, color: '#9ca3af', margin: '0 0 6px' }}>{printedAt}</p>
          <img src="/kus-logo.svg" alt="KUS Logo" style={{ display: 'block', width: 64, height: 64, objectFit: 'contain', margin: '0 auto 6px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: '#1a3a5c', margin: 0 }}>มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตศรีราชา</p>
          <p style={{ fontSize: 12, color: '#374151', margin: 0 }}>Kasetsart University Sriracha Campus</p>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#1a3a5c', margin: 0 }}>ข้อมูลบัญชีธนาคาร (สมุดบัญชี)</p>
        </div>

        {/* Account info box */}
        <div style={{ border: '1.5px solid #1a3a5c', borderRadius: 8, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{ background: '#1a3a5c', padding: '6px 14px' }}>
            <p style={{ color: 'white', fontSize: 12, fontWeight: 700, margin: 0 }}>ข้อมูลนิสิตและบัญชี</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px', padding: '12px 16px' }}>
            <InfoCell label="ชื่อ-นามสกุล" value={student?.name} />
            <InfoCell label="รหัสนิสิต" value={student?.student_id ?? studentId} />
            <InfoCell label="ธนาคาร" value={student?.bank_name} />
            <InfoCell label="เลขที่บัญชี" value={student?.bank_account_number} />
            <InfoCell label="ชื่อบัญชี" value={student?.bank_account_name} />
          </div>
        </div>

        {/* Bookbank attachment */}
        <p style={{ fontSize: 12, fontWeight: 700, color: '#1a3a5c', margin: '0 0 6px' }}>หน้าสมุดบัญชี (Bookbank)</p>
        {!bookUrl ? (
          <p style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', border: '1px dashed #d1d5db', borderRadius: 8, padding: '24px 12px' }}>ยังไม่มีไฟล์แนบ</p>
        ) : isImageUrl(bookUrl) ? (
          <img src={bookUrl} alt="หน้าสมุดบัญชี" style={{ display: 'block', width: '100%', maxWidth: 480, margin: '0 auto', borderRadius: 8, border: '1px solid #d1d5db' }} />
        ) : (
          <p style={{ fontSize: 12, textAlign: 'center' }}>
            <a href={bookUrl} target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>เปิดไฟล์แนบ (PDF)</a>
          </p>
        )}

        <p style={{ textAlign: 'center', fontSize: 10, color: '#9ca3af', marginTop: 30 }}>สร้างโดยระบบลงเวลา — {printedAt}</p>
      </div>
    </div>
  )
}
