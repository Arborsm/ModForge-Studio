import { useEffect, useMemo, useState } from 'react'
import { measureImageDimensions } from '../../../../../lib/imageMetrics'
import {
  getScaleUpEditorState,
  upsertScaleUpEntry,
  type ScaleUpBreathType,
  type ScaleUpDraft,
  type ScaleUpImageDimensions,
  type ScaleUpSpriteDraft,
} from './scaleup'
import { buildScaleUpPreviewModel, withBreathTypeDefaults } from './preview'

type ContentPatcherScaleUpPanelProps = {
  targetPath: string
  focusSection: 'preview' | 'settings'
  content: unknown
  resultImageDataUrl: string
  originalImageDataUrl: string | null
  onContentChange: (nextContent: unknown) => void
  onClose: () => void
}

function cloneDraft(draft: ScaleUpDraft): ScaleUpDraft {
  return JSON.parse(JSON.stringify(draft)) as ScaleUpDraft
}

function inputValue(value: number | null | undefined) {
  return typeof value === 'number' ? String(value) : ''
}

function parseIntegerInput(
  value: string,
  options?: {
    min?: number
    nullable?: boolean
  },
) {
  if (options?.nullable && !value.trim()) {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return options?.nullable ? null : options?.min ?? 0
  }

  if (typeof options?.min === 'number') {
    return Math.max(options.min, parsed)
  }

  return parsed
}

function sectionButtonClass(active: boolean) {
  return active
    ? 'rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm'
    : 'rounded-full border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]'
}

function sectionCardClass(active: boolean) {
  return active
    ? 'rounded-[24px] border border-[color-mix(in_srgb,var(--accent)_28%,var(--border-color))] bg-[color-mix(in_srgb,var(--bg-panel)_94%,white_6%)] p-4 shadow-[0_12px_28px_rgba(15,23,42,0.08)]'
    : 'rounded-[24px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4'
}

function metricCardClass() {
  return 'rounded-2xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel-muted)_78%,white_10%)] px-3 py-2'
}

function fieldClass() {
  return 'w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-[var(--text-primary)]'
}

function labelClass() {
  return 'text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]'
}

function imageStyle() {
  return {
    imageRendering: 'pixelated' as const,
  }
}

function ensureSpriteDraft(draft: ScaleUpDraft): ScaleUpSpriteDraft {
  if (draft.sprite) {
    return draft.sprite
  }

  return {
    breathType: 'None',
    spriteOriginX: null,
    spriteOriginY: null,
    chestSourceX: null,
    chestSourceY: null,
    chestSourceWidth: null,
    chestSourceHeight: null,
    chestAdjustX: null,
    chestAdjustY: null,
    headShotX: 12,
    headShotY: 58,
    headShotXRenderOffset: 0,
    headShotYRenderOffset: 0,
    miniMapXOffset: 0,
    miniMapYOffset: 0,
  }
}

type PreviewRectProps = {
  label: string
  colorClassName: string
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  sheetWidth: number
  sheetHeight: number
}

function PreviewRect({ label, colorClassName, rect, sheetWidth, sheetHeight }: PreviewRectProps) {
  return (
    <div
      className={`absolute rounded-lg border-2 ${colorClassName}`}
      aria-label={label}
      style={{
        left: `${(rect.x / Math.max(1, sheetWidth)) * 100}%`,
        top: `${(rect.y / Math.max(1, sheetHeight)) * 100}%`,
        width: `${(rect.width / Math.max(1, sheetWidth)) * 100}%`,
        height: `${(rect.height / Math.max(1, sheetHeight)) * 100}%`,
      }}
    >
      <span className="absolute left-1 top-1 rounded-full bg-[rgba(15,23,42,0.82)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
        {label}
      </span>
    </div>
  )
}

type CropPreviewProps = {
  title: string
  imageDataUrl: string
  sheetWidth: number
  sheetHeight: number
  rect: {
    x: number
    y: number
    width: number
    height: number
  }
  renderOffset?: {
    x: number
    y: number
  }
}

function CropPreview({ title, imageDataUrl, sheetWidth, sheetHeight, rect, renderOffset }: CropPreviewProps) {
  const previewScale = Math.max(1, Math.min(3, 192 / Math.max(rect.width, rect.height, 1)))
  const frameWidth = Math.max(1, rect.width * previewScale)
  const frameHeight = Math.max(1, rect.height * previewScale)
  const offsetX = (renderOffset?.x ?? 0) * previewScale
  const offsetY = (renderOffset?.y ?? 0) * previewScale

  return (
    <article className="rounded-2xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel)_92%,white_8%)] p-3">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h4>
        <span className="text-[11px] text-[var(--text-tertiary)]">{`${rect.width}x${rect.height}`}</span>
      </header>
      <div
        className="relative overflow-hidden rounded-xl border border-[var(--border-color)] bg-[linear-gradient(180deg,rgba(15,23,42,0.04),rgba(15,23,42,0.1))]"
        style={{ width: `${frameWidth}px`, height: `${frameHeight}px`, maxWidth: '100%' }}
      >
        <img
          src={imageDataUrl}
          alt={title}
          style={{
            ...imageStyle(),
            position: 'absolute',
            left: `${offsetX - rect.x * previewScale}px`,
            top: `${offsetY - rect.y * previewScale}px`,
            width: `${sheetWidth * previewScale}px`,
            height: `${sheetHeight * previewScale}px`,
            maxWidth: 'none',
          }}
        />
      </div>
    </article>
  )
}

type NumberFieldProps = {
  label: string
  value: number | null | undefined
  min?: number
  nullable?: boolean
  onChange: (nextValue: number | null) => void
}

function NumberField({ label, value, min, nullable, onChange }: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelClass()}>{label}</span>
      <input
        aria-label={label}
        type="number"
        min={typeof min === 'number' ? min : undefined}
        className={fieldClass()}
        value={inputValue(value)}
        onChange={(event) => onChange(parseIntegerInput(event.target.value, { min, nullable }))}
      />
    </label>
  )
}

export function ContentPatcherScaleUpPanel({
  targetPath,
  focusSection,
  content,
  resultImageDataUrl,
  originalImageDataUrl,
  onContentChange,
  onClose,
}: ContentPatcherScaleUpPanelProps) {
  const [activeSection, setActiveSection] = useState<'preview' | 'settings'>(focusSection)
  const [images, setImages] = useState<{
    resultImage?: ScaleUpImageDimensions | null
    originalImage?: ScaleUpImageDimensions | null
  }>({})
  const editorState = useMemo(
    () =>
      getScaleUpEditorState(content, targetPath, {
        resultImage: images.resultImage ?? null,
        originalImage: images.originalImage ?? null,
      }),
    [content, images.originalImage, images.resultImage, targetPath],
  )
  const editorStateKey = useMemo(() => JSON.stringify(editorState), [editorState])
  const [draft, setDraft] = useState<ScaleUpDraft>(() => cloneDraft(editorState.draft))
  const preview = useMemo(
    () =>
      buildScaleUpPreviewModel(draft, {
        resultImage: images.resultImage ?? null,
        originalImage: images.originalImage ?? null,
      }),
    [draft, images.originalImage, images.resultImage],
  )

  useEffect(() => {
    setActiveSection(focusSection)
  }, [focusSection])

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      measureImageDimensions(resultImageDataUrl).catch(() => null),
      originalImageDataUrl ? measureImageDimensions(originalImageDataUrl).catch(() => null) : Promise.resolve(null),
    ]).then(([resultImage, originalImage]) => {
      if (!cancelled) {
        setImages({
          resultImage,
          originalImage,
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [originalImageDataUrl, resultImageDataUrl])

  useEffect(() => {
    setDraft(cloneDraft(editorState.draft))
  }, [editorStateKey])

  function emitDraft(nextDraft: ScaleUpDraft) {
    setDraft(nextDraft)
    onContentChange(upsertScaleUpEntry(content, nextDraft))
  }

  function updateDraft(nextDraft: ScaleUpDraft) {
    emitDraft(cloneDraft(nextDraft))
  }

  function updateRootField(field: 'scale' | 'paddingWidth' | 'paddingHeight', nextValue: number | null) {
    const minimum = field === 'scale' ? 1 : 0
    updateDraft({
      ...draft,
      [field]: Math.max(minimum, nextValue ?? minimum),
    })
  }

  function updateSpriteField(field: keyof ScaleUpSpriteDraft, nextValue: number | null) {
    updateDraft({
      ...draft,
      sprite: {
        ...ensureSpriteDraft(draft),
        [field]: nextValue,
      },
    })
  }

  function updateBreathType(nextBreathType: ScaleUpBreathType) {
    updateDraft({
      ...draft,
      sprite: withBreathTypeDefaults(ensureSpriteDraft(draft), nextBreathType),
    })
  }

  return (
    <section className="mt-4 rounded-[28px] border border-[var(--border-color)] bg-[var(--bg-panel)] p-4">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--accent)]">
              ScaleUp
            </span>
            <span className="text-xs text-[var(--text-tertiary)]">
              {editorState.source === 'existing' ? 'Existing attachment entry' : 'Derived from image metrics'}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{targetPath}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={sectionButtonClass(activeSection === 'preview')}
            aria-pressed={activeSection === 'preview'}
            onClick={() => setActiveSection('preview')}
          >
            Render Preview
          </button>
          <button
            type="button"
            className={sectionButtonClass(activeSection === 'settings')}
            aria-pressed={activeSection === 'settings'}
            onClick={() => setActiveSection('settings')}
          >
            Parameter Settings
          </button>
          <button
            type="button"
            className="rounded-full border border-[var(--border-color)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </header>

      <div className="mb-4 grid gap-3 md:grid-cols-4">
        <div className={metricCardClass()}>
          <p className={labelClass()}>Scale</p>
          <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{draft.scale}</p>
        </div>
        <div className={metricCardClass()}>
          <p className={labelClass()}>Padding</p>
          <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{`${draft.paddingWidth} x ${draft.paddingHeight}`}</p>
        </div>
        <div className={metricCardClass()}>
          <p className={labelClass()}>Result Sheet</p>
          <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{`${preview.sheet.width} x ${preview.sheet.height}`}</p>
        </div>
        <div className={metricCardClass()}>
          <p className={labelClass()}>Original Sheet</p>
          <p className="mt-1 text-base font-semibold text-[var(--text-primary)]">{`${preview.sheet.originalWidth} x ${preview.sheet.originalHeight}`}</p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className={sectionCardClass(activeSection === 'preview')}>
          <header className="mb-3">
            <h4 className="text-base font-semibold text-[var(--text-primary)]">Render Preview</h4>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Preview the oversized sheet with ScaleUp crop regions and exported sub-previews.
            </p>
          </header>

          <div className="rounded-[24px] border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel-muted)_84%,white_8%)] p-3">
            <div className="relative overflow-hidden rounded-[20px] border border-[var(--border-color)]">
              <img
                src={resultImageDataUrl}
                alt={`${targetPath} ScaleUp sheet`}
                className="block h-auto w-full"
                style={imageStyle()}
              />
              <div className="pointer-events-none absolute inset-0">
                {preview.headshot ? (
                  <PreviewRect
                    label="Headshot"
                    colorClassName="border-sky-400/90 bg-sky-400/10"
                    rect={preview.headshot.sourceRect}
                    sheetWidth={preview.sheet.width}
                    sheetHeight={preview.sheet.height}
                  />
                ) : null}
                {preview.miniMap ? (
                  <PreviewRect
                    label="Minimap"
                    colorClassName="border-amber-400/90 bg-amber-400/12"
                    rect={preview.miniMap.sourceRect}
                    sheetWidth={preview.sheet.width}
                    sheetHeight={preview.sheet.height}
                  />
                ) : null}
                {preview.chestOverlay ? (
                  <PreviewRect
                    label="Chest"
                    colorClassName="border-emerald-400/90 bg-emerald-400/12"
                    rect={preview.chestOverlay.sourceRect}
                    sheetWidth={preview.sheet.width}
                    sheetHeight={preview.sheet.height}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {preview.headshot ? (
              <CropPreview
                title="Headshot Preview"
                imageDataUrl={resultImageDataUrl}
                sheetWidth={preview.sheet.width}
                sheetHeight={preview.sheet.height}
                rect={preview.headshot.sourceRect}
                renderOffset={preview.headshot.renderOffset}
              />
            ) : (
              <article className="rounded-2xl border border-dashed border-[var(--border-color)] p-3 text-sm text-[var(--text-secondary)]">
                Headshot Preview
              </article>
            )}
            {preview.miniMap ? (
              <CropPreview
                title="Minimap Preview"
                imageDataUrl={resultImageDataUrl}
                sheetWidth={preview.sheet.width}
                sheetHeight={preview.sheet.height}
                rect={preview.miniMap.sourceRect}
              />
            ) : (
              <article className="rounded-2xl border border-dashed border-[var(--border-color)] p-3 text-sm text-[var(--text-secondary)]">
                Minimap Preview
              </article>
            )}
          </div>
        </section>

        <section className={sectionCardClass(activeSection === 'settings')}>
          <header className="mb-3">
            <h4 className="text-base font-semibold text-[var(--text-primary)]">Parameter Settings</h4>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Editing these fields writes the ScaleUp entry back into <code>content.json</code>.
            </p>
          </header>

          <div className="grid gap-3 md:grid-cols-2">
            <NumberField label="Scale" value={draft.scale} min={1} onChange={(nextValue) => updateRootField('scale', nextValue)} />
            <NumberField
              label="Padding Width"
              value={draft.paddingWidth}
              min={0}
              onChange={(nextValue) => updateRootField('paddingWidth', nextValue)}
            />
            <NumberField
              label="Padding Height"
              value={draft.paddingHeight}
              min={0}
              onChange={(nextValue) => updateRootField('paddingHeight', nextValue)}
            />
          </div>

          {draft.sprite ? (
            <>
              <div className="mt-4">
                <label className="flex flex-col gap-1.5">
                  <span className={labelClass()}>Breath Type</span>
                  <select
                    aria-label="Breath Type"
                    className={fieldClass()}
                    value={draft.sprite.breathType}
                    onChange={(event) => updateBreathType(event.target.value as ScaleUpBreathType)}
                  >
                    <option value="None">None</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </select>
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <NumberField
                  label="HeadShot X"
                  value={draft.sprite.headShotX}
                  min={0}
                  onChange={(nextValue) => updateSpriteField('headShotX', nextValue)}
                />
                <NumberField
                  label="HeadShot Y"
                  value={draft.sprite.headShotY}
                  min={0}
                  onChange={(nextValue) => updateSpriteField('headShotY', nextValue)}
                />
                <NumberField
                  label="HeadShot X Render Offset"
                  value={draft.sprite.headShotXRenderOffset}
                  nullable
                  onChange={(nextValue) => updateSpriteField('headShotXRenderOffset', nextValue)}
                />
                <NumberField
                  label="HeadShot Y Render Offset"
                  value={draft.sprite.headShotYRenderOffset}
                  nullable
                  onChange={(nextValue) => updateSpriteField('headShotYRenderOffset', nextValue)}
                />
                <NumberField
                  label="MiniMap X Offset"
                  value={draft.sprite.miniMapXOffset}
                  nullable
                  onChange={(nextValue) => updateSpriteField('miniMapXOffset', nextValue)}
                />
                <NumberField
                  label="MiniMap Y Offset"
                  value={draft.sprite.miniMapYOffset}
                  nullable
                  onChange={(nextValue) => updateSpriteField('miniMapYOffset', nextValue)}
                />
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <NumberField
                  label="Chest Source X"
                  value={draft.sprite.chestSourceX}
                  nullable
                  onChange={(nextValue) => updateSpriteField('chestSourceX', nextValue)}
                />
                <NumberField
                  label="Chest Source Y"
                  value={draft.sprite.chestSourceY}
                  nullable
                  onChange={(nextValue) => updateSpriteField('chestSourceY', nextValue)}
                />
                <NumberField
                  label="Chest Source Width"
                  value={draft.sprite.chestSourceWidth}
                  nullable
                  onChange={(nextValue) => updateSpriteField('chestSourceWidth', nextValue)}
                />
                <NumberField
                  label="Chest Source Height"
                  value={draft.sprite.chestSourceHeight}
                  nullable
                  onChange={(nextValue) => updateSpriteField('chestSourceHeight', nextValue)}
                />
                <NumberField
                  label="Chest Adjust X"
                  value={draft.sprite.chestAdjustX}
                  nullable
                  onChange={(nextValue) => updateSpriteField('chestAdjustX', nextValue)}
                />
                <NumberField
                  label="Chest Adjust Y"
                  value={draft.sprite.chestAdjustY}
                  nullable
                  onChange={(nextValue) => updateSpriteField('chestAdjustY', nextValue)}
                />
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">
              This target only uses ScaleUp sizing data and does not expose sprite-specific settings.
            </p>
          )}
        </section>
      </div>
    </section>
  )
}
