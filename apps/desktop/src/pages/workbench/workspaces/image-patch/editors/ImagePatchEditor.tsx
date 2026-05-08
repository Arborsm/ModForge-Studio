import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Trash2, ImageIcon } from 'lucide-react'
import type { DraftPatch, CpMakerDraft, VirtualPreviewAsset } from '@shared/contracts'

interface ImagePatchEditorProps {
  patch: DraftPatch
  draft: CpMakerDraft
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onAddVirtualAsset: (asset: VirtualPreviewAsset) => void
  onRemoveVirtualAsset?: (relativePath: string) => void
}

type Area = {
  x: number | string
  y: number | string
  width: number | string
  height: number | string
}

export function ImagePatchEditor({ patch, draft, onPatchChange, onAddVirtualAsset, onRemoveVirtualAsset }: ImagePatchEditorProps) {
  const isLoad = patch.action === 'Load'
  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const fromArea = (editorState['fromArea'] as Area | undefined) ?? null
  const toArea = (editorState['toArea'] as Area | undefined) ?? null
  const patchMode = (editorState['patchMode'] as string | undefined) ?? 'Replace'

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const current = previewUrl
    return () => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current)
      }
    }
  }, [previewUrl])

  function updateEditorState(updates: Record<string, unknown>) {
    onPatchChange(patch.id, {
      editorState: { ...editorState, ...updates },
    })
  }

  const handleFileSelect = useCallback(
    async (file: File) => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      // Extract pure base64 from data URL
      const mediaType = file.type || 'image/png'
      const base64 = dataUrl.split(',')[1] ?? ''
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
      const relativePath = `assets/${patch.target.replace(/\//g, '_')}_${Date.now()}.${ext}`

      // Create virtual asset
      onAddVirtualAsset({
        relativePath,
        mediaType,
        bytesBase64: base64,
      })

      // Update patch with fromFile reference
      onPatchChange(patch.id, {
        fromFile: relativePath,
      })

      // Set preview directly from data URL (no blob/URL.createObjectURL needed)
      setPreviewUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
        return dataUrl
      })
    },
    [onAddVirtualAsset, onPatchChange, patch.id, patch.target],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file && file.type.startsWith('image/')) {
        void handleFileSelect(file)
      }
    },
    [handleFileSelect],
  )

  function updateArea(areaType: 'fromArea' | 'toArea', field: keyof Area, raw: string) {
    const current = areaType === 'fromArea' ? fromArea : toArea
    const next: Area = current ? { ...current } : { x: 0, y: 0, width: 0, height: 0 }
    const num = Number(raw)
    next[field] = Number.isNaN(num) ? raw : num
    updateEditorState({ [areaType]: next })
  }

  const existingAsset = draft.virtualAssets.find((a) => a.relativePath === patch.fromFile)
  const displayUrl = previewUrl ?? (existingAsset ? `data:${existingAsset.mediaType};base64,${existingAsset.bytesBase64}` : null)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center border-b border-[var(--border-color)] px-3 py-2">
        <span className="text-xs font-medium text-[var(--text-primary)]">{patch.target}</span>
        <span className="ml-2 text-[10px] text-[var(--text-secondary)]">({patch.action})</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: Image Upload / Preview */}
        <div className="flex w-1/2 shrink-0 flex-col border-r border-[var(--border-color)] p-3">
          <span className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Replacement Image
          </span>

          {displayUrl ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-app)] p-2">
                <img
                  src={displayUrl}
                  alt="Preview"
                  className="max-h-full max-w-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="truncate text-[10px] text-[var(--text-secondary)]">
                  {patch.fromFile ?? 'Unsaved'}
                </span>
                <button
                  type="button"
                  className="icon-button h-6 w-6 text-red-400"
                  onClick={() => {
                    setPreviewUrl((prev) => {
                      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
                      return null
                    })
                    if (patch.fromFile && onRemoveVirtualAsset) {
                      onRemoveVirtualAsset(patch.fromFile)
                    }
                    onPatchChange(patch.id, { fromFile: undefined })
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div
              className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-[var(--border-color)] bg-[var(--bg-panel-muted)] transition-colors hover:border-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_3%,var(--bg-panel-muted))]"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <ImageIcon className="h-10 w-10 text-[var(--text-secondary)] opacity-40" />
              <div className="text-center">
                <p className="text-xs text-[var(--text-primary)]">Click or drag image here</p>
                <p className="mt-1 text-[10px] text-[var(--text-secondary)]">PNG recommended for best quality</p>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                void handleFileSelect(file)
              }
              e.target.value = ''
            }}
          />
        </div>

        {/* Right: Settings */}
        <div className="min-w-0 flex-1 overflow-auto p-3">
          <div className="space-y-4">
            {isLoad ? (
              <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-3">
                <p className="text-xs font-medium text-[var(--text-primary)]">Load Action</p>
                <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                  This patch will replace the entire target asset with the uploaded file. No area or mode options are available for Load patches.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Patch Mode */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    Patch Mode
                  </label>
                  <select
                    className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={patchMode}
                    onChange={(e) => updateEditorState({ patchMode: e.target.value })}
                  >
                    <option value="Replace">Replace</option>
                    <option value="Overlay">Overlay</option>
                    <option value="Mask">Mask</option>
                  </select>
                  <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                    Replace: overwrite the entire target image. Overlay: blend on top. Mask: apply as transparency mask (CP 2.9.0).
                  </p>
                </div>

                {/* From Area */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    From Area (Source Crop)
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['x', 'y', 'width', 'height'] as const).map((field) => (
                      <div key={field}>
                        <span className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">{field}</span>
                        <input
                          type="text"
                          className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                          value={fromArea?.[field] ?? ''}
                          placeholder="0"
                          onChange={(e) => updateArea('fromArea', field, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                    Crop region from your replacement image. Numbers or tokens like {'{{X}}'}.
                  </p>
                </div>

                {/* To Area */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                    To Area (Target Position)
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['x', 'y', 'width', 'height'] as const).map((field) => (
                      <div key={field}>
                        <span className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">{field}</span>
                        <input
                          type="text"
                          className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                          value={toArea?.[field] ?? ''}
                          placeholder="0"
                          onChange={(e) => updateArea('toArea', field, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-[var(--text-secondary)]">
                    Position on the target image. Numbers or tokens like {'{{X}}'}.
                  </p>
                </div>
              </div>
            )}

            {/* Quick Upload Button */}
            <button
              type="button"
              className="control-button control-button-primary flex w-full items-center justify-center gap-1.5 text-xs"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" />
              {displayUrl ? 'Replace File' : 'Upload File'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
