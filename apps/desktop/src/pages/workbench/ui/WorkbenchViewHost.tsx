import { Component, createElement, Suspense, type ErrorInfo, type ReactNode } from 'react'
import type { WorkbenchModuleRegistration } from '@shared/contracts'
import { useEditorCopy } from '@locales/provider'
import { LoadingMotionFallback, LoadingMotionReveal } from '@shared/ui/loading-motion'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'

type ModuleErrorBoundaryProps = {
  resetKey: string
  title: string
  detail: string
  retryLabel: string
  children: ReactNode
}

type ModuleErrorBoundaryState = { error: Error | null; retryKey: number }

class ModuleErrorBoundary extends Component<ModuleErrorBoundaryProps, ModuleErrorBoundaryState> {
  state: ModuleErrorBoundaryState = { error: null, retryKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<ModuleErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {}

  componentDidUpdate(previousProps: ModuleErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null })
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty-state-card-fill" role="alert">
          <EmptyStateCard title={this.props.title} detail={this.props.detail} density="compact" />
          <button
            type="button"
            className="control-button control-button-primary"
            onClick={() => this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }))}
          >
            {this.props.retryLabel}
          </button>
        </div>
      )
    }
    return <div key={this.state.retryKey}>{this.props.children}</div>
  }
}

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
    <ModuleErrorBoundary
      resetKey={module.id}
      title={copy.messages.workbenchModuleErrorTitle}
      detail={copy.messages.workbenchModuleErrorDetail}
      retryLabel={copy.messages.workbenchModuleRetry}
    >
      <LoadingMotionReveal itemId={`workbench-module:${module.id}`} index={0} className="h-full min-h-0">
        <Suspense fallback={<LoadingMotionFallback className="workbench-loading-motion-fallback" />}>
          {createElement(module.runtime)}
        </Suspense>
      </LoadingMotionReveal>
    </ModuleErrorBoundary>
  )
}
