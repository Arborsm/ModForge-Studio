import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Trash2, ImageIcon } from 'lucide-react'
import type { DraftPatch, CpMakerDraft, VirtualPreviewAsset } from '@features/cp-maker'
import { useEditorCopy } from '@locales/provider'

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
  const copy = useEditorCopy().studioDesk.imagePatchEditor
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
      <div className="flex items-center border-b border-(--border-color) px-3 py-2">
        <span className="text-xs font-medium text-(--text-primary)">{patch.target}</span>
        <span className="ml-2 text-[10px] text-(--text-secondary)">({patch.action})</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: Image Upload / Preview */}
        <div className="flex w-1/2 shrink-0 flex-col border-r border-(--border-color) p-3">
          <span className="mb-2 text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">{copy.replacementImage}</span>

          {displayUrl ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-lg border border-(--border-color) bg-(--bg-app) p-2">
                <img
                  src={displayUrl}
                  alt={copy.previewAlt}
                  className="max-h-full max-w-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="truncate text-[10px] text-(--text-secondary)">{patch.fromFile ?? copy.unsaved}</span>
                <button
                  type="button"
                  className="icon-button h-6 w-6 text-(--danger)"
                  aria-label={copy.removeImage}
                  title={copy.removeImage}
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
              className="flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-(--border-color) bg-(--bg-panel-muted) transition-colors hover:border-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_3%,var(--bg-panel-muted))]"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <ImageIcon className="h-10 w-10 text-(--text-secondary) opacity-40" />
              <div className="text-center">
                <p className="text-xs text-(--text-primary)">{copy.dropTitle}</p>
                <p className="mt-1 text-[10px] text-(--text-secondary)">{copy.dropHint}</p>
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
              <div className="rounded-lg border border-(--border-color) bg-(--bg-panel-muted) p-3">
                <p className="text-xs font-medium text-(--text-primary)">{copy.loadAction}</p>
                <p className="mt-1 text-[10px] text-(--text-secondary)">{copy.loadDescription}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Patch Mode */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">
                    {copy.patchMode}
                  </label>
                  <select
                    className="w-full rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
                    value={patchMode}
                    onChange={(e) => updateEditorState({ patchMode: e.target.value })}
                  >
                    <option value="Replace">{copy.modeLabels.Replace}</option>
                    <option value="Overlay">{copy.modeLabels.Overlay}</option>
                    <option value="Mask">{copy.modeLabels.Mask}</option>
                  </select>
                  <p className="mt-1 text-[10px] text-(--text-secondary)">{copy.modeDescription}</p>
                </div>

                {/* From Area */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">
                    {copy.fromArea}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['x', 'y', 'width', 'height'] as const).map((field) => (
                      <div key={field}>
                        <span className="mb-0.5 block text-[9px] text-(--text-secondary) uppercase">{field}</span>
                        <input
                          type="text"
                          className="w-full rounded border border-(--border-color) bg-(--bg-app) px-2 py-1.5 text-[11px] text-(--text-primary) outline-none focus:border-(--accent)"
                          value={fromArea?.[field] ?? ''}
                          placeholder="0"
                          onChange={(e) => updateArea('fromArea', field, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-(--text-secondary)">{copy.fromAreaDescription}</p>
                </div>

                {/* To Area */}
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider text-(--text-secondary) uppercase">
                    {copy.toArea}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['x', 'y', 'width', 'height'] as const).map((field) => (
                      <div key={field}>
                        <span className="mb-0.5 block text-[9px] text-(--text-secondary) uppercase">{field}</span>
                        <input
                          type="text"
                          className="w-full rounded border border-(--border-color) bg-(--bg-app) px-2 py-1.5 text-[11px] text-(--text-primary) outline-none focus:border-(--accent)"
                          value={toArea?.[field] ?? ''}
                          placeholder="0"
                          onChange={(e) => updateArea('toArea', field, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-(--text-secondary)">{copy.toAreaDescription}</p>
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
              {displayUrl ? copy.replaceFile : copy.uploadFile}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
