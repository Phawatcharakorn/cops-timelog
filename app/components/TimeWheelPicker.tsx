'use client'

import { useRef, useEffect, useState, useCallback } from 'react'

const IH = 40   // item height px
const N  = 3    // visible items (center = selected)

function Wheel({ values, value, onChange }: { values: string[]; value: string; onChange: (v: string) => void }) {
  const el       = useRef<HTMLDivElement>(null)
  const timer    = useRef<ReturnType<typeof setTimeout>>()
  const dragging = useRef(false)
  const [center, setCenter] = useState(() => Math.max(0, values.indexOf(value)))

  useEffect(() => {
    const i = values.indexOf(value)
    if (i >= 0 && el.current) { el.current.scrollTop = i * IH; setCenter(i) }
  }, [value, values])

  const settle = useCallback(() => {
    if (!el.current) return
    const i = Math.max(0, Math.min(values.length - 1, Math.round(el.current.scrollTop / IH)))
    el.current.scrollTo({ top: i * IH, behavior: 'smooth' })
    setCenter(i)
    onChange(values[i])
  }, [values, onChange])

  const onScroll = useCallback(() => {
    if (!el.current || dragging.current) return
    setCenter(Math.round(el.current.scrollTop / IH))
    clearTimeout(timer.current)
    timer.current = setTimeout(settle, 100)
  }, [settle])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!el.current) return
    dragging.current = true
    clearTimeout(timer.current)
    const y0 = e.clientY
    const t0 = el.current.scrollTop

    const move = (e: MouseEvent) => {
      if (!el.current) return
      el.current.scrollTop = t0 - (e.clientY - y0)
      setCenter(Math.round(el.current.scrollTop / IH))
    }
    const up = () => {
      dragging.current = false
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      settle()
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [settle])

  useEffect(() => {
    const div = el.current
    if (!div) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      div.scrollTop += e.deltaY > 0 ? IH : -IH
      setCenter(Math.round(div.scrollTop / IH))
      clearTimeout(timer.current)
      timer.current = setTimeout(settle, 120)
    }
    div.addEventListener('wheel', onWheel, { passive: false })
    return () => div.removeEventListener('wheel', onWheel)
  }, [settle])

  return (
    <div className="relative select-none" style={{ width: 56, height: IH * N }} onMouseDown={onMouseDown}>
      {/* Highlight */}
      <div className="absolute rounded-lg bg-indigo-600 pointer-events-none"
        style={{ top: IH, left: 3, right: 3, height: IH, zIndex: 1 }} />

      {/* Scroll list */}
      <style>{'.tw::-webkit-scrollbar{display:none}'}</style>
      <div ref={el} onScroll={onScroll} className="tw absolute inset-0 overflow-y-auto"
        style={{ scrollbarWidth: 'none', overscrollBehavior: 'contain', cursor: 'ns-resize', zIndex: 2, willChange: 'scroll-position' }}>
        <div style={{ height: IH }} />
        {values.map((v, i) => (
          <div key={v} className="flex items-center justify-center"
            style={{
              height: IH, fontSize: 19, fontWeight: i === center ? 700 : 400,
              color: i === center ? '#fff' : '#9ca3af',
              transition: 'color .1s ease',
              position: 'relative', zIndex: 3, userSelect: 'none',
            }}>
            {v}
          </div>
        ))}
        <div style={{ height: IH }} />
      </div>

      {/* Top fade */}
      <div className="absolute inset-x-0 top-0 pointer-events-none"
        style={{ height: IH, background: 'linear-gradient(to bottom,white 30%,transparent)', zIndex: 4 }} />
      {/* Bottom fade */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{ height: IH, background: 'linear-gradient(to top,white 30%,transparent)', zIndex: 4 }} />
    </div>
  )
}

export default function TimeWheelPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hh, mm] = (value || '00:00').split(':')
  const hours   = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'))
  const minutes = Array.from({ length: 60 }, (_, i) => i.toString().padStart(2, '0'))

  return (
    <div className="flex items-center justify-center gap-0.5 bg-gray-50 rounded-xl py-1 px-2">
      <Wheel values={hours}   value={hh ?? '00'} onChange={h => onChange(`${h}:${mm ?? '00'}`)} />
      <span className="text-xl font-bold text-indigo-300 pointer-events-none select-none" style={{ paddingBottom: 2 }}>:</span>
      <Wheel values={minutes} value={mm ?? '00'} onChange={m => onChange(`${hh ?? '00'}:${m}`)} />
    </div>
  )
}
