import { createElement, Suspense } from 'react'
import type { WorkbenchModuleRegistration } from '@shared/contracts'
import { useEditorCopy } from '@locales/provider'
import { LoadingMotionFallback, LoadingMotionReveal } from '@shared/ui/loading-motion'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'

/** Loads one registered workbench runtime without passing feature-specific props. */
export function WorkbenchViewHost({ module }: { module: WorkbenchModuleRegistration | null }) {
  const copy = useEditorCopy()
  if (!module) {
    return (
      <div className="empty-state-card-fill">
        <EmptyStateCard
          title={copy.messages.workbenchViewUnavailableTitle}
          detail={copy.messages.workbenchViewUnavailableDetail}
          density="compact"
        />
      </div>
    )
  }

  return (
    <LoadingMotionReveal itemId={`workbench-module:${module.id}`} index={0} className="h-full min-h-0">
      <Suspense fallback={<LoadingMotionFallback className="workbench-loading-motion-fallback" />}>
        {createElement(module.runtime)}
      </Suspense>
    </LoadingMotionReveal>
  )
}
