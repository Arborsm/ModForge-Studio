import type { CSSProperties } from 'react'
import { cx } from '@shared/lib/helper'

type ImageSkeletonProps = {
  className?: string
  style?: CSSProperties
  aspectRatio?: string
  rounded?: boolean
  overlay?: boolean
}

export function ImageSkeleton({ className, style, aspectRatio, rounded = true, overlay = false }: ImageSkeletonProps) {
  return (
    <span
      className={cx('image-skeleton', rounded && 'image-skeleton-rounded', overlay && 'image-skeleton-overlay', className)}
      style={{ ...style, aspectRatio }}
      aria-hidden="true"
    />
  )
}
