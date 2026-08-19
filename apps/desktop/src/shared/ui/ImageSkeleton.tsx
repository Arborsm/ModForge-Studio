/** @file Image placeholder skeleton with configurable aspect ratio and overlay mode. */

import type { CSSProperties } from 'react'
import { cx } from '@shared/lib/helper'

type ImageSkeletonProps = {
  className?: string
  style?: CSSProperties
  aspectRatio?: string
  rounded?: boolean
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
