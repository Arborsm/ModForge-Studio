import { Component, createElement, Suspense, useState, type ErrorInfo, type ReactNode } from 'react'
import type { WorkbenchModuleRegistration } from '@shared/contracts'
import { appEvent } from '@platform/observability'
import { useEditorCopy } from '@locales/provider'
import { LoadingMotionFallback, LoadingMotionReveal } from '@shared/ui/loading-motion'
import { EmptyStateCard } from '@shared/ui/EmptyStateCard'

type ModuleErrorBoundaryProps = {
  title: string
  detail: string
  moduleId: string
  children: ReactNode
}

type ModuleErrorBoundaryState = { error: Error | null; retryKey: number }

function RetryButton({ onClick }: { onClick: () => void }) {
  const copy = useEditorCopy()
  return (
    <button type="button" className="control-button control-button-primary" onClick={onClick}>
      {copy.messages.workbenchModuleRetry}
    </button>
  )
}

class ModuleErrorBoundary extends Component<ModuleErrorBoundaryProps, ModuleErrorBoundaryState> {
  state: ModuleErrorBoundaryState = { error: null, retryKey: 0 }

  static getDerivedStateFromError(error: Error): Partial<ModuleErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The webview console bridge drops the Error object argument from React's
    // default caught-error logging, so log the message and component stack
    // explicitly to keep module crashes diagnosable from the terminal log.
    appEvent('error', 'Workbench module crashed')
      .error(error)
      .context({ source: 'workbench-view-host', operation: 'module-error-boundary', moduleId: this.props.moduleId })
      .logMessage(`${error.message}\n${info.componentStack}`)
      .emit({ notify: false })
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty-state-card-fill" role="alert">
          <EmptyStateCard title={this.props.title} detail={this.props.detail} density="compact" />
          <RetryButton onClick={() => this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }))} />
        </div>
      )
    }
    return (
      <div key={this.state.retryKey} className="h-full min-h-0">
        {this.props.children}
      </div>
    )
  }
}

function WorkbenchRuntime({ module }: { module: WorkbenchModuleRegistration }) {
  // Re-create the lazy runtime when the module registration object reference
  // changes (e.g. compat-plugin hot-reload swaps the module set). useState's
  // initializer only runs once per mount, so we track the module identity and
  // reset the Runtime when it changes.
  const [Runtime, setRuntime] = useState(() => module.createRuntime())
  const [trackedModule, setTrackedModule] = useState(module)
  if (trackedModule !== module) {
    setTrackedModule(module)
    setRuntime(module.createRuntime())
  }

  return (
    <LoadingMotionReveal itemId={`workbench-module:${module.id}`} index={0} className="h-full min-h-0">
      <Suspense fallback={<LoadingMotionFallback className="workbench-loading-motion-fallback" />}>{createElement(Runtime)}</Suspense>
    </LoadingMotionReveal>
  )
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
      key={module.id}
      moduleId={module.id}
      title={copy.messages.workbenchModuleErrorTitle}
      detail={copy.messages.workbenchModuleErrorDetail}
    >
      <WorkbenchRuntime module={module} />
    </ModuleErrorBoundary>
  )
}
