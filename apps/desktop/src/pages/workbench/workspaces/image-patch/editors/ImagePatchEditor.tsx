import { useCallback, useEffect, useRef, useState } from 'react'
import { Upload, Trash2, ImageIcon } from 'lucide-react'
import type { EditorComponent } from '@features/cp-maker'
import { loadImageResourceFromPath } from '@shared/lib/assets'
import { buildGameContentPath } from '@shared/infra/stardew-assets/contentPaths'
import { Disclosure } from '@shared/ui/Disclosure'
import { SheetRegionPicker, type SheetRegion } from '@shared/ui/SheetRegionPicker'
import { useEditorCopy } from '@locales/provider'

type Area = {
  x: number | string
  y: number | string
  width: number | string
  height: number | string
}

type ImageState = {
  url: string
  width: number
  height: number
}

/** Decodes a data/blob URL into its natural pixel size. */
function useDataUrlImageSize(url: string | null): { width: number; height: number } | null {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    if (url === null) {
      setSize(null)
      return
    }
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (!cancelled) {
        setSize({ width: image.naturalWidth, height: image.naturalHeight })
      }
    }
    image.onerror = () => {
      if (!cancelled) {
        setSize(null)
      }
    }
    image.src = url
    return () => {
      cancelled = true
    }
  }, [url])
  return size
}

function areaToRegion(area: Area | null): SheetRegion | null {
  if (area === null) return null
  const numeric = [area.x, area.y, area.width, area.height].every((value) => typeof value === 'number')
  if (!numeric) return null
  return { x: area.x as number, y: area.y as number, width: area.width as number, height: area.height as number }
}

function regionToArea(region: SheetRegion): Area {
  return { x: region.x, y: region.y, width: region.width, height: region.height }
}

/**
 * EditImage editor. Authors pick regions directly on the sheets: the left
 * stage is the uploaded replacement (FromArea), the right stage is the vanilla
 * target loaded from the game directory (ToArea). The numeric inputs remain as
 * the advanced escape for tokenized values. Load patches are edited in the
 * asset library and never route here.
 */
export const ImagePatchEditor: EditorComponent = ({ patch, draftPort, resources }) => {
  const { draft, updatePatch: onPatchChange, addVirtualAsset: onAddVirtualAsset, removeVirtualAsset: onRemoveVirtualAsset } = draftPort
  const copy = useEditorCopy().studioDesk.imagePatchEditor
  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const fromArea = (editorState['fromArea'] as Area | undefined) ?? null
  const toArea = (editorState['toArea'] as Area | undefined) ?? null
  const patchMode = (editorState['patchMode'] as string | undefined) ?? 'Replace'

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [targetImage, setTargetImage] = useState<ImageState | null>(null)
  const [targetFailed, setTargetFailed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const current = previewUrl
    return () => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current)
      }
    }
  }, [previewUrl])

  // Load the vanilla target sheet so ToArea can be picked visually.
  useEffect(() => {
    const targetPath = resources.gameRootPath !== null ? buildGameContentPath(resources.gameRootPath, patch.target) : null
    if (targetPath === null || patch.target.trim() === '') {
      setTargetImage(null)
      setTargetFailed(false)
      return
    }
    let cancelled = false
    setTargetFailed(false)
    loadImageResourceFromPath(targetPath, resources.locale)
      .then((result) => {
        if (cancelled) return
        if (result === null) {
          setTargetImage(null)
          setTargetFailed(true)
          return
        }
        setTargetImage({ url: result.url, width: result.width, height: result.height })
      })
      .catch(() => {
        if (!cancelled) {
          setTargetImage(null)
          setTargetFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [patch.target, resources.gameRootPath, resources.locale])

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
  const replacementSize = useDataUrlImageSize(displayUrl)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-border-subtle flex items-center border-b px-3 py-2">
        <span className="text-text-primary text-xs font-medium">{patch.target}</span>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Left: replacement image + FromArea picking */}
        <div className="border-border-subtle flex w-1/2 shrink-0 flex-col border-r p-3">
          <span className="text-text-secondary text-caption-px mb-2 font-semibold tracking-wider uppercase">{copy.replacementImage}</span>

          {displayUrl ? (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="min-h-0 flex-1 overflow-auto">
                {replacementSize !== null ? (
                  <SheetRegionPicker
                    imageUrl={displayUrl}
                    imageWidth={replacementSize.width}
                    imageHeight={replacementSize.height}
                    value={areaToRegion(fromArea)}
                    onChange={(region) => updateEditorState({ fromArea: regionToArea(region) })}
                    className="max-h-full"
                  />
                ) : (
                  <div className="border-border-subtle bg-surface-app flex items-center justify-center overflow-auto rounded-lg border p-2">
                    <img
                      src={displayUrl}
                      alt={copy.previewAlt}
                      className="max-h-full max-w-full object-contain"
                      style={{ imageRendering: 'pixelated' }}
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-secondary text-caption-px truncate">{patch.fromFile ?? copy.unsaved}</span>
                <button
                  type="button"
                  className="icon-button text-danger h-6 w-6"
                  aria-label={copy.removeImage}
                  title={copy.removeImage}
                  onClick={() => {
                    setPreviewUrl((prev) => {
                      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
                      return null
                    })
                    if (patch.fromFile) {
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
              className="border-border-subtle bg-surface-panel-muted hover:border-accent flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_3%,var(--bg-panel-muted))]"
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <ImageIcon className="text-text-secondary h-10 w-10 opacity-40" />
              <div className="text-center">
                <p className="text-text-primary text-xs">{copy.dropTitle}</p>
                <p className="text-text-secondary text-caption-px mt-1">{copy.dropHint}</p>
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

        {/* Right: vanilla target + ToArea picking */}
        <div className="min-w-0 flex-1 overflow-auto p-3">
          <div className="space-y-4">
            {/* Patch Mode */}
            <div>
              <label className="text-text-secondary text-caption-px mb-1.5 block font-semibold tracking-wider uppercase">
                {copy.patchMode}
              </label>
              <select
                className="border-border-subtle bg-surface-app text-text-primary focus:border-accent w-full rounded-md border px-3 py-2 text-xs outline-none"
                value={patchMode}
                onChange={(e) => updateEditorState({ patchMode: e.target.value })}
              >
                <option value="Replace">{copy.modeLabels.Replace}</option>
                <option value="Overlay">{copy.modeLabels.Overlay}</option>
                <option value="Mask">{copy.modeLabels.Mask}</option>
              </select>
              <p className="text-text-secondary text-caption-px mt-1">{copy.modeDescription}</p>
            </div>

            {/* Vanilla target with ToArea picking */}
            <div>
              <label className="text-text-secondary text-caption-px mb-1.5 block font-semibold tracking-wider uppercase">
                {copy.toArea}
              </label>
              {targetImage !== null ? (
                <SheetRegionPicker
                  imageUrl={targetImage.url}
                  imageWidth={targetImage.width}
                  imageHeight={targetImage.height}
                  value={areaToRegion(toArea)}
                  onChange={(region) => updateEditorState({ toArea: regionToArea(region) })}
                />
              ) : (
                <p className="border-border-subtle bg-surface-panel-muted text-text-secondary text-meta-px rounded-md border px-3 py-2">
                  {targetFailed ? copy.targetLoadFailed : copy.targetLoading}
                </p>
              )}
            </div>

            {/* Manual coordinates stay available for tokenized values */}
            <Disclosure title={copy.manualAreasTitle} subtitle={copy.manualAreasSubtitle}>
              <div className="space-y-4">
                <div>
                  <label className="text-text-secondary text-caption-px mb-1.5 block font-semibold tracking-wider uppercase">
                    {copy.fromArea}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['x', 'y', 'width', 'height'] as const).map((field) => (
                      <div key={field}>
                        <span className="text-text-secondary text-caption-px mb-0.5 block uppercase">{field}</span>
                        <input
                          type="text"
                          className="border-border-subtle bg-surface-app text-text-primary focus:border-accent text-meta-px w-full rounded border px-2 py-1.5 outline-none"
                          value={fromArea?.[field] ?? ''}
                          placeholder="0"
                          onChange={(e) => updateArea('fromArea', field, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-text-secondary text-caption-px mt-1">{copy.fromAreaDescription}</p>
                </div>

                <div>
                  <label className="text-text-secondary text-caption-px mb-1.5 block font-semibold tracking-wider uppercase">
                    {copy.toArea}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['x', 'y', 'width', 'height'] as const).map((field) => (
                      <div key={field}>
                        <span className="text-text-secondary text-caption-px mb-0.5 block uppercase">{field}</span>
                        <input
                          type="text"
                          className="border-border-subtle bg-surface-app text-text-primary focus:border-accent text-meta-px w-full rounded border px-2 py-1.5 outline-none"
                          value={toArea?.[field] ?? ''}
                          placeholder="0"
                          onChange={(e) => updateArea('toArea', field, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-text-secondary text-caption-px mt-1">{copy.toAreaDescription}</p>
                </div>
              </div>
            </Disclosure>
          </div>

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
  )
}
