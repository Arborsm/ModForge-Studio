import { useEffect, useState, type ReactNode } from 'react'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { cx } from '@shared/lib/cx'

type DeferredWorkspacePlaceholderProps = {
  title: string
  subtitle: string
  lines?: number
}

export function DeferredWorkspacePlaceholder({
  title,
  subtitle,
  lines = 3,
}: DeferredWorkspacePlaceholderProps) {
  return (
    <PanelFrame title={title} subtitle={subtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 p-3">
        <div className="panel-section panel-section-muted">
          <div className="panel-section-body space-y-3">
            <div className="h-4 w-40 rounded-full bg-[color-mix(in_srgb,var(--border-color)_80%,transparent)]" />
            {Array.from({ length: lines }, (_, index) => (
              <div
                key={`${title}:${index}`}
                className="h-10 rounded-2xl bg-[linear-gradient(90deg,color-mix(in_srgb,var(--bg-panel-muted)_92%,transparent),color-mix(in_srgb,var(--bg-elevated)_88%,transparent),color-mix(in_srgb,var(--bg-panel-muted)_92%,transparent))]"
              />
            ))}
          </div>
        </div>
      </div>
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
        'h-full transform-gpu transition-[opacity,transform] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none',
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
              'h-full transform-gpu transition-[opacity,transform] duration-200 ease-out motion-reduce:transform-none motion-reduce:transition-none',
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
