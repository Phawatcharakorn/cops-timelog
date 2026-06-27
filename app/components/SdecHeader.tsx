'use client'

interface SdecHeaderProps {
  subtitle?: string
  right?: React.ReactNode
}

export default function SdecHeader({ subtitle, right }: SdecHeaderProps) {
  return (
    <header
      className="px-4 py-3 flex items-center justify-between gap-3"
      style={{ background: 'linear-gradient(135deg, #0d2f6e 0%, #1565c0 100%)' }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex-shrink-0 w-10 h-10 bg-white rounded-xl overflow-hidden flex items-center justify-center shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sdec-logo.jpg" alt="SDEC" className="w-9 h-9 object-contain" />
        </div>
        <div className="min-w-0 text-white">
          <div className="text-[10px] opacity-60 leading-none mb-0.5 truncate">
            มหาวิทยาลัยเกษตรศาสตร์ วิทยาเขตศรีราชา
          </div>
          <div className="text-sm font-bold leading-tight truncate">
            ศูนย์พัฒนานิสิตสู่ความเป็นเลิศ
          </div>
          {subtitle && (
            <div className="text-[10px] opacity-60 mt-0.5 truncate">{subtitle}</div>
          )}
        </div>
      </div>
      {right && <div className="flex-shrink-0 flex items-center gap-3">{right}</div>}
    </header>
  )
}
