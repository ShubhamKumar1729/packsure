'use client'

import { useId } from 'react'

export type RobotState = 'idle' | 'thinking' | 'speaking' | 'offline'

/**
 * The Pia robot avatar. Pure inline SVG plus the CSS keyframes in globals.css, so the assistant
 * adds no dependency and fetches no image assets.
 */
export function RobotAvatar({ state = 'idle', size = 40, label = 'PackSure assistant' }: { state?: RobotState; size?: number; label?: string }) {
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9]/g, '')
  const shell = `ps-robot ps-robot--${state}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label}
      className={shell}
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <radialGradient id={`bg${uid}`} cx="35%" cy="28%" r="82%">
          <stop offset="0%" stopColor="#3d8f6b" />
          <stop offset="58%" stopColor="#244936" />
          <stop offset="100%" stopColor="#163325" />
        </radialGradient>
        <linearGradient id={`face${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fffefb" />
          <stop offset="100%" stopColor="#f0ece2" />
        </linearGradient>
      </defs>

      <circle cx="32" cy="32" r="30" fill={`url(#bg${uid})`} />
      <circle cx="32" cy="32" r="30" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.4" />
      <ellipse cx="23" cy="15" rx="12" ry="7" fill="rgba(255,255,255,0.09)" />

      {/* antenna */}
      <path d="M32 21.5V13.5" stroke="#cfe0d5" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <circle cx="32" cy="10.4" r="6" fill="#d9882b" opacity="0.22" className="ps-antenna" />
      <circle cx="32" cy="10.4" r="3.4" fill="#e79b3d" className="ps-antenna" />

      {/* ears */}
      <rect x="7.6" y="31" width="5.4" height="12" rx="2.7" fill="#cfe0d5" />
      <rect x="51" y="31" width="5.4" height="12" rx="2.7" fill="#cfe0d5" />

      {/* head */}
      <rect x="13" y="20.5" width="38" height="31" rx="13.5" fill={`url(#face${uid})`} />
      <rect x="13" y="20.5" width="38" height="31" rx="13.5" fill="none" stroke="rgba(32,37,33,0.1)" strokeWidth="1.2" />

      {/* cheeks */}
      <circle cx="19.4" cy="41.4" r="2.9" fill="#e79b3d" opacity="0.34" />
      <circle cx="44.6" cy="41.4" r="2.9" fill="#e79b3d" opacity="0.34" />

      <g className="ps-eyes">
        <ellipse cx="24.8" cy="34.2" rx="3.5" ry="4.4" fill="#202521" />
        <ellipse cx="39.2" cy="34.2" rx="3.5" ry="4.4" fill="#202521" />
        <circle cx="26" cy="32.5" r="1.25" fill="#ffffff" opacity="0.92" />
        <circle cx="40.4" cy="32.5" r="1.25" fill="#ffffff" opacity="0.92" />
      </g>

      {state === 'offline'
        ? <rect x="27.4" y="44.2" width="9.2" height="2.2" rx="1.1" fill="#202521" opacity="0.62" />
        : <rect x="27" y="42.8" width="10" height="4" rx="2" fill="#202521" opacity="0.78" className="ps-mouth" />}
    </svg>
  )
}

/** Three bouncing dots shown while the assistant is retrieving records and waiting on the model. */
export function ThinkingDots({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="ps-dot block h-1.5 w-1.5 rounded-full bg-moss"
          style={{ animationDelay: `${index * 0.16}s` }}
        />
      ))}
    </span>
  )
}

/** Soft pulsing halo behind the floating launcher. */
export function LauncherRing() {
  return <span className="ps-ring pointer-events-none absolute inset-0 rounded-full bg-moss/45" aria-hidden="true" />
}
