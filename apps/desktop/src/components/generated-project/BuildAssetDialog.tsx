import { useEffect, useState } from 'react'
import { X, Loader2, CheckCircle2, AlertCircle, Hammer } from 'lucide-react'
import { buildGeneratedProjectMapAsset } from '../../lib/desktop'
import type { VirtualPreviewAsset } from '../../lib/app/useGeneratedProject'

interface BuildAssetDialogProps {
  open: boolean
  mapDocument: unknown // MapDocument from backend
  targetMapName: string
  onClose: () => void
  onAssetBuilt: (asset: VirtualPreviewAsset) => void
}

type BuildState =
  | { phase: 'idle' }
  | { phase: 'building'; message: string }
  | { phase: 'done'; asset: VirtualPreviewAsset }
  | { phase: 'error'; message: string }

export function BuildAssetDialog({ open, mapDocument, targetMapName, onClose, onAssetBuilt }: BuildAssetDialogProps) {
  const [buildState, setBuildState] = useState<BuildState>({ phase: 'idle' })

  useEffect(() => {
    if (!open || buildState.phase !== 'idle') return

    setBuildState({ phase: 'building', message: 'Serializing map to tBIN format...' })

    let cancelled = false

    void (async () => {
      try {
        const relativePath = `assets/maps/${targetMapName.replace(/\//g, '_')}.tbin`
        const asset = await buildGeneratedProjectMapAsset({
          relative_path: relativePath,
          map_document: mapDocument,
        })
        if (cancelled) return
        setBuildState({ phase: 'done', asset })
        onAssetBuilt(asset)
      } catch (err) {
        if (cancelled) return
        setBuildState({
          phase: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) {
      setBuildState({ phase: 'idle' })
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="w-[400px] max-w-[90vw] rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Hammer className="h-4 w-4 text-[var(--accent)]" />
            <span className="text-sm font-semibold text-[var(--text-primary)]">Build Map Asset</span>
          </div>
          <button type="button" className="icon-button h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-6">
          {buildState.phase === 'building' && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--text-primary)]">Building...</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{buildState.message}</p>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-panel-muted)]">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-[var(--accent)]" />
              </div>
            </div>
          )}

          {buildState.phase === 'done' && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-green-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--text-primary)]">Build Complete</p>
                <p className="mt-1 text-xs text-[var(--text-secondary)]">
                  Asset saved as {buildState.asset.relativePath}
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                  Size: {Math.round((buildState.asset.bytesBase64.length * 3) / 4 / 1024)} KB
                </p>
              </div>
            </div>
          )}

          {buildState.phase === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <AlertCircle className="h-8 w-8 text-red-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--text-primary)]">Build Failed</p>
                <p className="mt-1 text-xs text-red-400">{buildState.message}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-3">
          {buildState.phase === 'done' || buildState.phase === 'error' ? (
            <button type="button" className="control-button control-button-primary text-xs" onClick={onClose}>
              {buildState.phase === 'done' ? 'Done' : 'Close'}
            </button>
          ) : (
            <button type="button" className="control-button text-xs" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
