/** @file Circular progress ring with accessible role and configurable size, stroke, and colors. */

import type { CSSProperties, ReactNode } from 'react'
import { cx } from '@shared/lib/helper'

type ProgressRingProps = {
  /** Progress percentage, clamped to 0–100. */
  progress: number
  /** Accessible label for the progressbar role. */
  label: string
  /** Ring diameter in pixels, defaults to 32. */
  size?: number
  /** Ring stroke width in pixels, defaults to 3. */
  strokeWidth?: number
  /** Extra class applied to the ring wrapper. */
  className?: string
  /** Indicator ring color, defaults to the accent token. */
  indicatorColor?: string
  /** Track ring color, defaults to a translucent accent tint. */
  trackColor?: string
  /** Optional center content rendered inside the ring. */
  children?: ReactNode
}

/** Circular progress indicator with an accessible progressbar role and optional center content. */
export function ProgressRing({
  progress,
  label,
  size = 32,
  strokeWidth = 3,
  className,
  indicatorColor = 'var(--accent)',
  trackColor = 'color-mix(in srgb, var(--accent) 18%, transparent)',
  children,
}: ProgressRingProps) {
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
