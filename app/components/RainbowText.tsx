'use client'

export default function RainbowText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={className} style={{ fontWeight: 700 }}>
      {text.split('').map((char, i) => (
        <span
          key={i}
          style={{
            animation: 'rainbow-text 2s linear infinite',
            animationDelay: `${-(i * 0.13)}s`,
          }}
        >
          {char === ' ' ? ' ' : char}
        </span>
      ))}
    </span>
  )
}
