import type { LoadContentPatcherResultAssetResult } from '@entities/mod/api'
import type { ContentPatcherBackendSimulationContext } from '../content-model/contentPatcher'
import { ContentPatcherImagePreview } from './ContentPatcherImagePreview'
import { useModWorkspaceCopy } from '@locales/localeContext'

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
  const copy = useModWorkspaceCopy().contentPatcherPreview

  if (loading) {
    return (
      <section className="cp-debugger-preview">
        <p className="panel-empty-state">{copy.loading}</p>
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
        <p className="panel-empty-state">{copy.empty}</p>
      </section>
    )
  }

  if (result.result.kind === 'image' && result.result.imageDataUrl) {
    return (
      <section className="cp-debugger-preview">
        <h2 className="cp-debugger-preview-title">{copy.targetTitle(result.target.path)}</h2>
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
      <h2 className="cp-debugger-preview-title">{copy.targetTitle(result.target.path)}</h2>
      <pre className="cp-debugger-code" aria-label={copy.previewAriaLabel}>
        {JSON.stringify(payload ?? {}, null, 2)}
      </pre>
    </section>
  )
}
