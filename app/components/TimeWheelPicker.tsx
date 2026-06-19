'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

const ITEM_H  = 44
const VISIBLE = 5

interface WheelProps {
  values: string[]
  value:  string
  onChange: (v: string) => void
}

function Wheel({ values, value, onChange }: WheelProps) {
  const ref      = useRef<HTMLDivElement>(null)
  const snapRef  = useRef<ReturnType<typeof setTimeout>>()
  const [centerIdx, setCenterIdx] = useState(() => Math.max(0, values.indexOf(value)))

  useEffect(() => {
    const idx = values.indexOf(value)
    if (idx >= 0 && ref.current) {
      ref.current.scrollTop = idx * ITEM_H
      setCenterIdx(idx)
    }
  }, [value, values])

  const handleScroll = useCallback(() => {
    if (!ref.current) return
    setCenterIdx(Math.round(ref.current.scrollTop / ITEM_H))
    clearTimeout(snapRef.current)
    snapRef.current = setTimeout(() => {
      if (!ref.current) return
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(ref.current.scrollTop / ITEM_H)))
      ref.current.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' })
      onChange(values[idx])
    }, 120)
  }, [values, onChange])

  const scrollTo = (i: number) => {
    ref.current?.scrollTo({ top: i * ITEM_H, behavior: 'smooth' })
    onChange(values[i])
  }

  return (
    <div className="relative select-none" style={{ width: 72, height: ITEM_H * VISIBLE }}>
      {/* Highlight strip */}
      <div className="absolute inset-x-1 rounded-xl bg-indigo-600"
        style={{ top: ITEM_H * 2, height: ITEM_H, zIndex: 1 }} />

      {/* Scrollable list */}
      <style>{`.tw-wheel::-webkit-scrollbar{display:none}`}</style>
      <div
        ref={ref}
        onScroll={handleScroll}
        className="tw-wheel absolute inset-0 overflow-y-auto"
        style={{ scrollSnapType: 'y mandatory', scrollbarWidth: 'none', overscrollBehavior: 'contain', zIndex: 2 }}
      >
        <div style={{ height: ITEM_H * 2 }} />
        {values.map((v, i) => (
          <div
            key={v}
            onClick={() => scrollTo(i)}
            className="flex items-center justify-center cursor-pointer"
            style={{
              height: ITEM_H,
              scrollSnapAlign: 'center',
              fontSize: 22,
              fontWeight: i === centerIdx ? 700 : 400,
              color: i === centerIdx ? 'white' : '#9ca3af',
              transition: 'color 0.12s ease',
              position: 'relative',
              zIndex: 3,
            }}
          >
            {v}
          </div>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>

      {/* Fade top */}
      <div className="absolute inset-x-0 top-0 pointer-events-none"
        style={{ height: ITEM_H * 2, background: 'linear-gradient(to bottom, white 25%, transparent)', zIndex: 4 }} />
      {/* Fade bottom */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{ height: ITEM_H * 2, background: 'linear-gradient(to top, white 25%, transparent)', zIndex: 4 }} />
    </div>
  )
}

export default function TimeWheelPicker({
  value, onChange,
}: { value: string; onChange: (v: string) => void }) {
  const [hh, mm] = (value || '00:00').split(':')
  const hours   = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))

  return (
    <div className="flex items-center justify-center gap-1 bg-gray-50 rounded-2xl py-2">
      <Wheel values={hours}   value={hh ?? '00'} onChange={h => onChange(`${h}:${mm ?? '00'}`)} />
      <span className="text-3xl font-bold text-indigo-300 pb-0.5 select-none">:</span>
      <Wheel values={minutes} value={mm ?? '00'} onChange={m => onChange(`${hh ?? '00'}:${m}`)} />
    </div>
  )
}
