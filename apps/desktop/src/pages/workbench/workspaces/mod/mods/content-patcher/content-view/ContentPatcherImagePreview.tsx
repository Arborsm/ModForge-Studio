import { Grip, Maximize, Move, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ContentPatcherBackendSimulationContext } from '../content-model/contentPatcher'
import { usePanZoomViewport } from '@shared/lib/viewports'
import { ContentPatcherSimulationForm } from './ContentPatcherSimulationForm'
import { prepareImageCompareAssets, type ImageCompareBounds, type PreparedImageCompareAssets } from '../content-model/imageCompare'
import { useModWorkspaceCopy } from '@locales/provider'
import { ImageSkeleton } from '@shared/ui/ImageSkeleton'

type CompareMode = 'layers' | 'split'

type ContentPatcherImagePreviewProps = {
  targetPath: string
  imageDataUrl: string
  originalImageDataUrl: string | null
  originalImageSource: string | null
  simulationContext: ContentPatcherBackendSimulationContext
  simulationConfigEntries: Array<{
    key: string
    defaultValue: unknown
  }>
  onSimulationContextChange: (next: ContentPatcherBackendSimulationContext) => void
  dynamicTokens?: Record<string, unknown>
}

type ImageFrameProps = {
  src: string
  alt: string
  width: number
  height: number
  bounds: ImageCompareBounds | null
  showPatchBounds: boolean
  overlaySrc?: string
  overlayOpacity?: number
}

type PanZoomFrameProps = {
  children: ReactNode
  label: string
  measure?: boolean
  panZoom: ReturnType<typeof usePanZoomViewport>
}

function toolbarButtonClass(active: boolean) {
  return active ? 'cp-debugger-toolbar-button cp-debugger-toolbar-button-active' : 'cp-debugger-toolbar-button'
}

function toPercent(value: number, total: number) {
  return `${(value / Math.max(1, total)) * 100}%`
}

function PanZoomFrame({ children, label, measure = false, panZoom }: PanZoomFrameProps) {
  return (
    <div
      ref={measure ? panZoom.measureRef : undefined}
      className={`cp-debugger-panzoom-viewport${panZoom.isDragging ? 'cp-debugger-panzoom-viewport-dragging' : ''}`}
      aria-label={label}
      {...panZoom.surfaceProps}
    >
      <div className="cp-debugger-panzoom-content" style={panZoom.contentStyle}>
        {children}
      </div>
    </div>
  )
}

function ImageFrame({ src, alt, width, height, bounds, showPatchBounds, overlaySrc, overlayOpacity = 1 }: ImageFrameProps) {
  return (
    <div className="cp-debugger-image-frame" style={{ aspectRatio: `${Math.max(1, width)} / ${Math.max(1, height)}` }}>
      <img src={src} alt={alt} className={overlaySrc ? 'cp-debugger-image cp-debugger-image-overlay-base' : 'cp-debugger-image'} />
      {overlaySrc ? (
        <img src={overlaySrc} alt="" className="cp-debugger-image cp-debugger-image-overlay-top" style={{ opacity: overlayOpacity }} />
      ) : null}
      {showPatchBounds && bounds ? (
        <div
          className="cp-debugger-patch-bounds"
          aria-hidden="true"
          style={{
            left: toPercent(bounds.x, width),
            top: toPercent(bounds.y, height),
            width: toPercent(bounds.width, width),
            height: toPercent(bounds.height, height),
          }}
        />
      ) : null}
    </div>
  )
}

export function ContentPatcherImagePreview({
  targetPath,
  imageDataUrl,
  originalImageDataUrl,
  originalImageSource,
  simulationContext,
  simulationConfigEntries,
  onSimulationContextChange,
  dynamicTokens,
}: ContentPatcherImagePreviewProps) {
  const copy = useModWorkspaceCopy().contentPatcherImagePreview
  const [compareMode, setCompareMode] = useState<CompareMode>('split')
  const [diffOnly, setDiffOnly] = useState(false)
  const [overlayOpacity, setOverlayOpacity] = useState(0.62)
  const [showPatchBounds, setShowPatchBounds] = useState(false)
  const [simulationPopupOpen, setSimulationPopupOpen] = useState(false)
  const [compareAssetState, setCompareAssetState] = useState<{
    key: string
    assets: PreparedImageCompareAssets
  } | null>(null)
  const [compareAssetsLoading, setCompareAssetsLoading] = useState(false)
  const simulationMenuRef = useRef<HTMLDivElement | null>(null)
  const compareKey = originalImageDataUrl ? `${originalImageDataUrl}::${imageDataUrl}` : null
  const compareAssets = compareAssetState?.key === compareKey ? compareAssetState.assets : null

  useEffect(() => {
    let cancelled = false

    if (!compareKey || !originalImageDataUrl) {
      setCompareAssetsLoading(false)
      return () => {
        cancelled = true
      }
    }

    setCompareAssetsLoading(true)
    void prepareImageCompareAssets(originalImageDataUrl, imageDataUrl)
      .then((next) => {
        if (!cancelled) {
          setCompareAssetState({
            key: compareKey,
            assets: next,
          })
          setCompareAssetsLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCompareAssetsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [compareKey, imageDataUrl, originalImageDataUrl])

  useEffect(() => {
    if (!simulationPopupOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (simulationMenuRef.current?.contains(event.target as Node)) {
        return
      }
      setSimulationPopupOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [simulationPopupOpen])

  const compareEnabled = Boolean(originalImageDataUrl)
  const focusedChanges = Boolean(diffOnly && compareAssets?.hasChanges && compareAssets.diffBounds)
  const originalSource = originalImageDataUrl ?? imageDataUrl
  const displaySources = focusedChanges
    ? {
        original: compareAssets?.originalDiffDataUrl ?? originalSource,
        patched: compareAssets?.patchedDiffDataUrl ?? imageDataUrl,
      }
    : {
        original: originalSource,
        patched: imageDataUrl,
      }
  const frameWidth = compareAssets?.width ?? 1
  const frameHeight = compareAssets?.height ?? 1
  const patchBounds = focusedChanges ? null : (compareAssets?.diffBounds ?? null)
  const canShowPatchBounds = Boolean(patchBounds)
  const panZoom = usePanZoomViewport({
    contentWidth: frameWidth,
    contentHeight: frameHeight,
  })

  return (
    <div className="cp-debugger-image-preview">
      <div
        className={
          focusedChanges
            ? 'cp-debugger-image-stage cp-debugger-image-stage-with-toolbar cp-debugger-image-stage-focused'
            : 'cp-debugger-image-stage cp-debugger-image-stage-with-toolbar'
        }
        aria-busy={compareAssetsLoading ? 'true' : undefined}
      >
        {compareAssetsLoading ? <ImageSkeleton overlay rounded={false} className="cp-debugger-image-stage-skeleton" /> : null}
        {compareEnabled && compareMode === 'split' ? (
          <div className="cp-debugger-compare-split">
            <figure className="cp-debugger-compare-pane">
              <figcaption className="cp-debugger-compare-label">{copy.original}</figcaption>
              <div className="cp-debugger-compare-pane-body">
                <PanZoomFrame panZoom={panZoom} measure label={copy.originalViewportLabel(targetPath)}>
                  <ImageFrame
                    src={displaySources.original}
                    alt={copy.originalAlt(targetPath)}
                    width={frameWidth}
                    height={frameHeight}
                    bounds={patchBounds}
                    showPatchBounds={showPatchBounds}
                  />
                </PanZoomFrame>
              </div>
            </figure>
            <figure className="cp-debugger-compare-pane">
              <figcaption className="cp-debugger-compare-label">{copy.patched}</figcaption>
              <div className="cp-debugger-compare-pane-body">
                <PanZoomFrame panZoom={panZoom} label={copy.patchedViewportLabel(targetPath)}>
                  <ImageFrame
                    src={displaySources.patched}
                    alt={copy.patchedAlt(targetPath)}
                    width={frameWidth}
                    height={frameHeight}
                    bounds={patchBounds}
                    showPatchBounds={showPatchBounds}
                  />
                </PanZoomFrame>
              </div>
            </figure>
          </div>
        ) : compareEnabled ? (
          <div className="cp-debugger-compare-overlay cp-debugger-compare-overlay-centered">
            <PanZoomFrame panZoom={panZoom} measure label={copy.viewportLabel(targetPath)}>
              <ImageFrame
                src={displaySources.original}
                overlaySrc={displaySources.patched}
                overlayOpacity={overlayOpacity}
                alt={targetPath}
                width={frameWidth}
                height={frameHeight}
                bounds={patchBounds}
                showPatchBounds={showPatchBounds}
              />
            </PanZoomFrame>
          </div>
        ) : (
          <div className="cp-debugger-compare-single">
            <PanZoomFrame panZoom={panZoom} measure label={copy.viewportLabel(targetPath)}>
              <ImageFrame
                src={imageDataUrl}
                alt={targetPath}
                width={frameWidth}
                height={frameHeight}
                bounds={null}
                showPatchBounds={false}
              />
            </PanZoomFrame>
          </div>
        )}

        <div className="cp-debugger-image-toolbar" role="toolbar" aria-label={copy.toolbarLabel}>
          {compareEnabled ? (
            <div className="cp-debugger-toolbar-group">
              <button
                type="button"
                className={toolbarButtonClass(compareMode === 'layers')}
                aria-pressed={compareMode === 'layers'}
                onClick={() => setCompareMode('layers')}
              >
                {copy.layers}
              </button>
              <button
                type="button"
                className={toolbarButtonClass(compareMode === 'split')}
                aria-pressed={compareMode === 'split'}
                onClick={() => setCompareMode('split')}
              >
                {copy.split}
              </button>
            </div>
          ) : null}

          <div className="cp-debugger-toolbar-group">
            <button
              type="button"
              className="cp-debugger-toolbar-icon-button"
              aria-label={copy.zoomOut}
              aria-keyshortcuts="-"
              title={`${copy.zoomOut} (-)`}
              onClick={panZoom.zoomOut}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="cp-debugger-toolbar-icon-button"
              aria-label={copy.actualSize}
              aria-keyshortcuts="1"
              title={`${copy.actualSize} (1)`}
              onClick={panZoom.setOneToOne}
            >
              <Grip className="h-4 w-4" />
            </button>
            <span className="cp-debugger-toolbar-zoom">{panZoom.zoomLabel}</span>
            <button
              type="button"
              className="cp-debugger-toolbar-icon-button"
              aria-label={copy.zoomIn}
              aria-keyshortcuts="+"
              title={`${copy.zoomIn} (+)`}
              onClick={panZoom.zoomIn}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="cp-debugger-toolbar-icon-button"
              aria-label={copy.fitToScreen}
              aria-keyshortcuts="0"
              title={`${copy.fitToScreen} (0)`}
              onClick={panZoom.fitToScreen}
            >
              <Maximize className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="cp-debugger-toolbar-icon-button"
              aria-label={copy.centerView}
              aria-keyshortcuts="C"
              title={`${copy.centerView} (C)`}
              onClick={panZoom.centerView}
            >
              <Move className="h-4 w-4" />
            </button>
          </div>

          {compareEnabled ? (
            <div className="cp-debugger-toolbar-group">
              <button
                type="button"
                className={toolbarButtonClass(diffOnly)}
                aria-pressed={diffOnly}
                onClick={() => setDiffOnly((current) => !current)}
              >
                {copy.diffOnly}
              </button>
              {focusedChanges ? <span className="cp-debugger-toolbar-badge">{copy.focusedChanges}</span> : null}
            </div>
          ) : null}

          {compareEnabled && compareMode === 'layers' ? (
            <div className="cp-debugger-toolbar-group">
              <button type="button" className={toolbarButtonClass(true)} aria-pressed="true" onClick={() => setCompareMode('layers')}>
                {copy.overlay}
              </button>
            </div>
          ) : null}

          {compareEnabled ? (
            <div className="cp-debugger-toolbar-group">
              <button
                type="button"
                className={toolbarButtonClass(showPatchBounds)}
                aria-pressed={showPatchBounds}
                disabled={!canShowPatchBounds}
                onClick={() => setShowPatchBounds((current) => !current)}
              >
                {copy.patchBounds}
              </button>
            </div>
          ) : null}

          {compareEnabled && compareMode === 'layers' ? (
            <label className="cp-debugger-toolbar-slider" htmlFor="cp-debugger-overlay-opacity">
              <span>{copy.blend}</span>
              <input
                id="cp-debugger-overlay-opacity"
                type="range"
                min="0.2"
                max="1"
                step="0.05"
                value={overlayOpacity}
                onChange={(event) => setOverlayOpacity(Number(event.target.value))}
              />
            </label>
          ) : null}

          <div ref={simulationMenuRef} className="cp-debugger-toolbar-group cp-debugger-toolbar-group-push">
            <button
              type="button"
              className={toolbarButtonClass(simulationPopupOpen)}
              aria-haspopup="dialog"
              aria-expanded={simulationPopupOpen}
              aria-controls="cp-debugger-simulation-popup"
              onClick={() => setSimulationPopupOpen((current) => !current)}
            >
              {copy.simulationContext}
            </button>

            {simulationPopupOpen ? (
              <div
                id="cp-debugger-simulation-popup"
                className="cp-debugger-toolbar-popup"
                role="dialog"
                aria-label={copy.simulationContext}
              >
                <ContentPatcherSimulationForm
                  compact
                  configEntries={simulationConfigEntries}
                  value={simulationContext}
                  onChange={onSimulationContextChange}
                  dynamicTokens={dynamicTokens}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {compareEnabled && originalImageSource ? <p className="cp-debugger-image-meta">{originalImageSource}</p> : null}
    </div>
  )
}
