import { useEffect, useState, type ReactNode } from 'react'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'
import { cx } from '@shared/lib/helper'

type DeferredWorkspacePlaceholderProps = {
  title: string
  subtitle: string
  lines?: number
}

export function DeferredWorkspacePlaceholder({ title, subtitle }: DeferredWorkspacePlaceholderProps) {
  return (
    <PanelFrame title={title} subtitle={subtitle} className="h-full" bodyClassName="empty-state-card-fill">
      <EmptyStateCard title={title} detail={subtitle} density="compact" />
    </PanelFrame>
  )
}

export function DeferredWorkspaceReveal({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setVisible(true)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [])

  return (
    <div
      className={cx(
        'h-full transform-gpu transition-[opacity,transform] duration-200 ease-out',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0',
      )}
    >
      {children}
    </div>
  )
}

const DEFERRED_WORKSPACE_CROSSFADE_MS = 220

export function DeferredWorkspaceCrossfade({
  ready,
  placeholder,
  children,
}: {
  ready: boolean
  placeholder: ReactNode
  children: ReactNode
}) {
  const [renderPlaceholder, setRenderPlaceholder] = useState(!ready)
  const [renderContent, setRenderContent] = useState(ready)
  const [contentVisible, setContentVisible] = useState(ready)

  useEffect(() => {
    let frameId = 0
    let timeoutId = 0

    frameId = window.requestAnimationFrame(() => {
      if (!ready) {
        setRenderPlaceholder(true)
        setRenderContent(false)
        setContentVisible(false)
        return
      }

      setRenderPlaceholder(true)
      setRenderContent(true)
      setContentVisible(true)
      timeoutId = window.setTimeout(() => {
        setRenderPlaceholder(false)
      }, DEFERRED_WORKSPACE_CROSSFADE_MS)
    })

    return () => {
      window.cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
    }
  }, [ready])

  return (
    <div className="relative h-full">
      {renderPlaceholder ? (
        <div
          className={cx(
            'absolute inset-0 transition-opacity duration-200 ease-out',
            ready ? 'pointer-events-none opacity-0' : 'opacity-100',
          )}
        >
          {placeholder}
        </div>
      ) : null}

      {renderContent ? (
        <div className="absolute inset-0">
          <div
            className={cx(
              'h-full transform-gpu transition-[opacity,transform] duration-200 ease-out',
              contentVisible ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0',
            )}
          >
            {children}
          </div>
        </div>
      ) : null}
    </div>
  )
}
