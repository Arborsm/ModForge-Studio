import { render } from '@testing-library/react'
import { describe, expect, it } from 'vite-plus/test'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'

describe('ImageSkeleton', () => {
  it('renders a skeleton element that is hidden from assistive technology', () => {
    const { container } = render(<ImageSkeleton />)
    const skeleton = container.querySelector('.image-skeleton')

    expect(skeleton).toBeTruthy()
    expect(skeleton).toHaveAttribute('aria-hidden', 'true')
  })

  it('applies rounded and overlay classes by default', () => {
    const { container } = render(<ImageSkeleton />)
    const skeleton = container.querySelector('.image-skeleton')

    expect(skeleton).toHaveClass('image-skeleton-rounded')
  })

  it('applies overlay class when overlay is requested', () => {
    const { container } = render(<ImageSkeleton overlay />)
    const skeleton = container.querySelector('.image-skeleton')

    expect(skeleton).toHaveClass('image-skeleton-overlay')
  })

  it('omits rounded class when rounded is false', () => {
    const { container } = render(<ImageSkeleton rounded={false} />)
    const skeleton = container.querySelector('.image-skeleton')

    expect(skeleton).not.toHaveClass('image-skeleton-rounded')
  })

  it('applies aspect ratio through style', () => {
    const { container } = render(<ImageSkeleton aspectRatio="16/9" />)
    const skeleton = container.querySelector('.image-skeleton')

    expect(skeleton).toHaveStyle({ aspectRatio: '16/9' })
  })

  it('merges custom class names', () => {
    const { container } = render(<ImageSkeleton className="custom-skeleton" />)
    const skeleton = container.querySelector('.image-skeleton')

    expect(skeleton).toHaveClass('custom-skeleton')
  })
})
