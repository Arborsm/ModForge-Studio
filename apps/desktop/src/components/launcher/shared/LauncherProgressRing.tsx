import type { CSSProperties, ReactNode } from 'react'
import { cx } from '../../../lib/cx'

type LauncherProgressRingProps = {
  progress: number
  label: string
  size?: number
  strokeWidth?: number
  className?: string
  indicatorColor?: string
  trackColor?: string
  children?: ReactNode
}

export function LauncherProgressRing({
  progress,
  label,
  size = 32,
  strokeWidth = 3,
  className,
  indicatorColor = 'var(--accent)',
  trackColor = 'color-mix(in srgb, var(--accent) 18%, transparent)',
  children,
}: LauncherProgressRingProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress))
  const normalizedRadius = (size - strokeWidth) / 2
  const circumference = normalizedRadius * 2 * Math.PI
  const dashOffset = circumference - (clampedProgress / 100) * circumference
  const containerStyle = { width: size, height: size } satisfies CSSProperties

  return (
    <span
      className={cx('launcher-progress-ring', className)}
      style={containerStyle}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clampedProgress)}
    >
      <svg className="launcher-progress-ring-svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          className="launcher-progress-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={normalizedRadius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          className="launcher-progress-ring-indicator"
          cx={size / 2}
          cy={size / 2}
          r={normalizedRadius}
          fill="none"
          stroke={indicatorColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="launcher-progress-ring-content">{children}</span>
    </span>
  )
}
