'use client'

import { useRef, useEffect, useState, useCallback, useMemo } from 'react'

const IH     = 40   // item height px
const N      = 3    // visible items (center = selected)
const REPEAT = 3    // copies → ample room to scroll either way

function Wheel({ values, value, onChange }: {
  values: string[]; value: string; onChange: (v: string) => void
}) {
  const el       = useRef<HTMLDivElement>(null)
  const timer    = useRef<ReturnType<typeof setTimeout>>()
  const dragging = useRef(false)
  // settle() calls onChange(), which flows back down as this same wheel's
  // own `value` prop a render later. Without this flag, the sync effect
  // below couldn't tell "the parent just echoed back what I picked" apart
  // from "the value changed for some other reason" — it would yank
  // scrollTop back instantly mid-way through settle()'s smooth-scroll
  // animation, which is what caused the visible stutter/flicker (scrolling
  // to "1" would jump back toward "0" before landing).
  const selfInitiated = useRef(false)

  const looped = useMemo(() => Array.from({ length: REPEAT }, () => values).flat(), [values])
  const mid    = values.length   // index offset of the middle copy

  const [center, setCenter] = useState(() => mid + Math.max(0, values.indexOf(value)))

  // Sync external value → scroll position (instant, no animation)
  useEffect(() => {
    if (selfInitiated.current) { selfInitiated.current = false; return }
    const i = values.indexOf(value)
    if (i >= 0 && el.current) {
      el.current.scrollTop = (mid + i) * IH
      setCenter(mid + i)
    }
  }, [value, values, mid])

  // After drag/scroll stops: snap to nearest item, then silently re-center to middle copy
  const settle = useCallback(() => {
    if (!el.current) return
    const raw     = Math.round(el.current.scrollTop / IH)
    const logical = ((raw % values.length) + values.length) % values.length
    el.current.scrollTo({ top: raw * IH, behavior: 'smooth' })
    setCenter(raw)
    selfInitiated.current = true
    onChange(values[logical])
    // After smooth animation finishes, jump to middle copy — no visual change since same number
    setTimeout(() => {
      if (!el.current) return
      el.current.scrollTop = (mid + logical) * IH
      setCenter(mid + logical)
    }, 260)
  }, [values, mid, onChange])

  // Native scroll (touch / trackpad)
  const onScroll = useCallback(() => {
    if (!el.current || dragging.current) return
    setCenter(Math.round(el.current.scrollTop / IH))
    clearTimeout(timer.current)
    timer.current = setTimeout(settle, 100)
  }, [settle])

  // Mouse drag
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

  // Scroll wheel (one step at a time)
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
      {/* Selection highlight */}
      <div className="absolute rounded-lg bg-indigo-600 pointer-events-none"
        style={{ top: IH, left: 3, right: 3, height: IH, zIndex: 1 }} />

      {/* Looped list */}
      <style>{'.tw::-webkit-scrollbar{display:none}'}</style>
      <div ref={el} onScroll={onScroll} className="tw absolute inset-0 overflow-y-auto"
        style={{ scrollbarWidth: 'none', overscrollBehavior: 'contain', cursor: 'ns-resize', zIndex: 2, willChange: 'scroll-position' }}>
        <div style={{ height: IH }} />
        {looped.map((v, i) => (
          <div key={i} className="flex items-center justify-center"
            style={{
              height: IH, fontSize: 19, userSelect: 'none',
              fontWeight: i === center ? 700 : 400,
              color: i === center ? '#fff' : '#9ca3af',
              transition: 'color .1s ease',
              position: 'relative', zIndex: 3,
            }}>
            {v}
          </div>
        ))}
        <div style={{ height: IH }} />
      </div>

      {/* Fade edges */}
      <div className="absolute inset-x-0 top-0 pointer-events-none"
        style={{ height: IH, background: 'linear-gradient(to bottom,white 30%,transparent)', zIndex: 4 }} />
      <div className="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{ height: IH, background: 'linear-gradient(to top,white 30%,transparent)', zIndex: 4 }} />
    </div>
  )
}

export default function TimeWheelPicker({ value, onChange, minuteStep = 1 }: { value: string; onChange: (v: string) => void; minuteStep?: number }) {
  const [hh, mm] = (value || '00:00').split(':')
  const hours   = useMemo(() => Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0')), [])
  const minutes = useMemo(
    () => Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => (i * minuteStep).toString().padStart(2, '0')),
    [minuteStep]
  )
  // Snap an incoming minute value that doesn't land on a step (e.g. loaded from an existing record) to the nearest option
  const mmSnapped = useMemo(() => {
    const m = Number(mm ?? 0)
    if (minuteStep <= 1 || minutes.includes(mm ?? '00')) return mm ?? '00'
    const nearest = Math.round(m / minuteStep) * minuteStep % 60
    return nearest.toString().padStart(2, '0')
  }, [mm, minuteStep, minutes])
  return (
    <div className="flex items-center justify-center gap-0.5 bg-gray-50 rounded-xl py-1 px-2">
      <Wheel values={hours}   value={hh ?? '00'} onChange={h => onChange(`${h}:${mmSnapped}`)} />
      <span className="text-xl font-bold text-indigo-300 pointer-events-none select-none" style={{ paddingBottom: 2 }}>:</span>
      <Wheel values={minutes} value={mmSnapped} onChange={m => onChange(`${hh ?? '00'}:${m}`)} />
    </div>
  )
}
