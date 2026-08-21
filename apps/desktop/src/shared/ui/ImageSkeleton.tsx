/** @file Image placeholder skeleton with configurable aspect ratio and overlay mode. */

import type { CSSProperties } from 'react'
import { cx } from '@shared/lib/helper'

type ImageSkeletonProps = {
  /** Extra class applied to the skeleton element. */
  className?: string
  /** Inline styles forwarded to the skeleton element. */
  style?: CSSProperties
  /** Target aspect ratio (e.g. `16 / 9`); the element is auto-sized when omitted. */
  aspectRatio?: string
  /** Rounded corners, on by default. */
  rounded?: boolean
  /** Overlay variant for images rendered on top of content. */
  overlay?: boolean
}

/** Image placeholder skeleton that respects a target aspect ratio while the real image loads. */
export function ImageSkeleton({ className, style, aspectRatio, rounded = true, overlay = false }: ImageSkeletonProps) {
  return (
    <span
      className={cx('image-skeleton', rounded && 'image-skeleton-rounded', overlay && 'image-skeleton-overlay', className)}
      style={{ ...style, aspectRatio }}
      aria-hidden="true"
    />
  )
}
