import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LoadContentPatcherResultAssetResult } from '../../../lib/desktop'
import { createDefaultContentPatcherSimulationContext } from '../../../lib/plugins/contentPatcher'
import { ContentPatcherResultPreview } from './ContentPatcherResultPreview'

afterEach(() => {
  cleanup()
})

const onePixelPngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AAAAAAAABQABZHiVOAAAAABJRU5ErkJggg=='
const onePixelRedPngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY/jPwPAfAAUAAf+mXJtdAAAAAElFTkSuQmCC'

vi.mock('./imageCompare', () => ({
  prepareImageCompareAssets: vi.fn().mockResolvedValue({
    width: 1,
    height: 1,
    hasChanges: true,
    diffBounds: { x: 0, y: 0, width: 1, height: 1 },
    originalDiffDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AAAAAAAABQABZHiVOAAAAABJRU5ErkJggg==',
    patchedDiffDataUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAANSURBVBhXY/jPwPAfAAUAAf+mXJtdAAAAAElFTkSuQmCC',
  }),
}))

type ImageResultWithOriginal = LoadContentPatcherResultAssetResult & {
  result: LoadContentPatcherResultAssetResult['result'] & {
    originalImageDataUrl: string | null
    originalImageSource: string | null
  }
}

function buildImageResult(): ImageResultWithOriginal {
  return {
    target: {
      path: 'Maps/Test',
      assetKind: 'image',
      touchedPatchCount: 1,
      resultState: 'determinate',
      patchIds: ['content.json:0#target:0#from:0'],
    },
    trace: [],
    diagnostics: [],
    exportable: true,
    result: {
      kind: 'image',
      json: null,
      imageDataUrl: onePixelRedPngDataUrl,
      originalImageDataUrl: onePixelPngDataUrl,
      originalImageSource: 'Game content -> Content/Maps/Test.png',
      mapDebug: null,
    },
  }
}

function buildSimulationContext() {
  return createDefaultContentPatcherSimulationContext()
}

describe('ContentPatcherResultPreview', () => {
  it('renders image results inside a dedicated preview stage', async () => {
    const { container } = render(
      <ContentPatcherResultPreview
        result={buildImageResult()}
        loading={false}
        error={null}
        simulationContext={buildSimulationContext()}
        simulationConfigEntries={[]}
        onSimulationContextChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Maps/Test original' }).getAttribute('src')).toBe(onePixelPngDataUrl)
      expect(screen.getByRole('img', { name: 'Maps/Test patched' }).getAttribute('src')).toBe(onePixelRedPngDataUrl)
      expect(screen.getByText('Game content -> Content/Maps/Test.png')).toBeTruthy()
      expect(container.querySelector('.cp-debugger-image-stage')).toBeTruthy()
    })
  })

  it('shows split compare by default and keeps the toolbar floating inside the stage', async () => {
    const { container } = render(
      <ContentPatcherResultPreview
        result={buildImageResult()}
        loading={false}
        error={null}
        simulationContext={{ ...buildSimulationContext(), config: { Variant: 'festive' } }}
        simulationConfigEntries={[{ key: 'Variant', defaultValue: 'festive' }]}
        onSimulationContextChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Split' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Diff Only' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Simulation Context' })).toBeTruthy()
      expect(screen.getByRole('img', { name: 'Maps/Test original' }).getAttribute('src')).toBe(onePixelPngDataUrl)
      expect(screen.getByRole('img', { name: 'Maps/Test patched' }).getAttribute('src')).toBe(onePixelRedPngDataUrl)
      expect(screen.queryByRole('button', { name: 'Original' })).toBeNull()
      expect(container.querySelector('.cp-debugger-image-stage .cp-debugger-image-toolbar')).toBeTruthy()
    })
  })

  it('switches to layers mode and reveals layer controls', async () => {
    const { container } = render(
      <ContentPatcherResultPreview
        result={buildImageResult()}
        loading={false}
        error={null}
        simulationContext={buildSimulationContext()}
        simulationConfigEntries={[]}
        onSimulationContextChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Layers' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Layers' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Overlay' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Patch Bounds' })).toBeTruthy()
      expect(screen.queryByRole('button', { name: 'Original' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Patched' })).toBeNull()
      expect(container.querySelector('.cp-debugger-compare-overlay-centered')).toBeTruthy()
    })
  })

  it('keeps correct original and patched sources when diff-only is enabled in split mode', async () => {
    render(
      <ContentPatcherResultPreview
        result={buildImageResult()}
        loading={false}
        error={null}
        simulationContext={buildSimulationContext()}
        simulationConfigEntries={[]}
        onSimulationContextChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Diff Only' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Diff Only' }))

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Overlay' })).toBeNull()
      expect(screen.getByRole('img', { name: 'Maps/Test original' }).getAttribute('src')).toBe(onePixelPngDataUrl)
      expect(screen.getByRole('img', { name: 'Maps/Test patched' }).getAttribute('src')).toBe(onePixelRedPngDataUrl)
      expect(screen.getByText('Focused changes')).toBeTruthy()
    })
  })

  it('opens simulation context as a popup from the toolbar and shows defaults', async () => {
    const onSimulationContextChange = vi.fn()

    render(
      <ContentPatcherResultPreview
        result={buildImageResult()}
        loading={false}
        error={null}
        simulationContext={buildSimulationContext()}
        simulationConfigEntries={[{ key: 'Variant', defaultValue: 'festive' }]}
        onSimulationContextChange={onSimulationContextChange}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Simulation Context' })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Simulation Context' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Simulation Season')).toBeTruthy()
      expect(screen.getByDisplayValue('festive')).toBeTruthy()
    })
  })

  it('reuses shared pan-zoom controls and keyboard shortcuts for image preview without transform scaling the image frame', async () => {
    const { container } = render(
      <ContentPatcherResultPreview
        result={buildImageResult()}
        loading={false}
        error={null}
        simulationContext={buildSimulationContext()}
        simulationConfigEntries={[]}
        onSimulationContextChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Zoom out' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Actual size' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Zoom in' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Fit to screen' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Center view' })).toBeTruthy()
      expect(screen.getByText('100%')).toBeTruthy()
    })

    const viewport = container.querySelector('.cp-debugger-panzoom-viewport') as HTMLElement | null
    const content = container.querySelector('.cp-debugger-panzoom-content') as HTMLElement | null
    expect(viewport).toBeTruthy()
    expect(content).toBeTruthy()

    const originalTransform = content?.style.transform ?? ''
    const originalWidth = content?.style.width ?? ''
    viewport?.focus()
    fireEvent.keyDown(viewport as HTMLElement, { key: '=' })

    await waitFor(() => {
      expect(screen.getByText('112%')).toBeTruthy()
    })

    await waitFor(() => {
      const nextContent = container.querySelector('.cp-debugger-panzoom-content') as HTMLElement | null
      expect(nextContent?.style.transform).not.toContain('scale(')
      expect(nextContent?.style.width).not.toBe(originalWidth)
    })

    fireEvent.keyDown(viewport as HTMLElement, { key: 'ArrowRight' })

    await waitFor(() => {
      expect((container.querySelector('.cp-debugger-panzoom-content') as HTMLElement | null)?.style.transform).not.toBe(originalTransform)
    })
  })
})
