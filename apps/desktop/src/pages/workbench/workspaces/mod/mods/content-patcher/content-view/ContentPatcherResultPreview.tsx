import type { LoadContentPatcherResultAssetResult } from '@entities/mod/api'
import type { ContentPatcherBackendSimulationContext } from '../content-model/contentPatcher'
import { ContentPatcherImagePreview } from './ContentPatcherImagePreview'

type ContentPatcherResultPreviewProps = {
  result: LoadContentPatcherResultAssetResult | null
  loading: boolean
  error: string | null
  simulationContext: ContentPatcherBackendSimulationContext
  simulationConfigEntries: Array<{
    key: string
    defaultValue: unknown
  }>
  onSimulationContextChange: (next: ContentPatcherBackendSimulationContext) => void
  dynamicTokens?: Record<string, unknown>
}

export function ContentPatcherResultPreview({
  result,
  loading,
  error,
  simulationContext,
  simulationConfigEntries,
  onSimulationContextChange,
  dynamicTokens,
}: ContentPatcherResultPreviewProps) {
  if (loading) {
    return (
      <section className="cp-debugger-preview">
        <p className="panel-empty-state">Loading simulated target result...</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="cp-debugger-preview">
        <p className="panel-empty-state">{error}</p>
      </section>
    )
  }

  if (!result) {
    return (
      <section className="cp-debugger-preview">
        <p className="panel-empty-state">Select a target to preview the final simulated result.</p>
      </section>
    )
  }

  if (result.result.kind === 'image' && result.result.imageDataUrl) {
    return (
      <section className="cp-debugger-preview">
        <h2 className="cp-debugger-preview-title">{`Target: ${result.target.path}`}</h2>
        <ContentPatcherImagePreview
          targetPath={result.target.path}
          imageDataUrl={result.result.imageDataUrl}
          originalImageDataUrl={result.result.originalImageDataUrl}
          originalImageSource={result.result.originalImageSource}
          simulationContext={simulationContext}
          simulationConfigEntries={simulationConfigEntries}
          onSimulationContextChange={onSimulationContextChange}
          dynamicTokens={dynamicTokens}
        />
      </section>
    )
  }

  const payload = result.result.kind === 'map' ? result.result.mapDebug : result.result.json

  return (
    <section className="cp-debugger-preview">
      <h2 className="cp-debugger-preview-title">{`Target: ${result.target.path}`}</h2>
      <pre className="cp-debugger-code" aria-label="target result preview">
        {JSON.stringify(payload ?? {}, null, 2)}
      </pre>
    </section>
  )
}
