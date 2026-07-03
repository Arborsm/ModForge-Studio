import { describe, expect, it, vi } from 'vite-plus/test'
import { renderWithLocale } from '@test/renderWithLocale'
import { ContentPatcherImagePreview } from '@pages/workbench/workspaces/mod/mods/content-patcher/content-view/ContentPatcherImagePreview'
import type { ContentPatcherBackendSimulationContext } from '@pages/workbench/workspaces/mod/mods/content-patcher/content-model/contentPatcher'

vi.mock('../content-model/imageCompare', () => ({
  prepareImageCompareAssets: vi.fn(() => new Promise(() => {})),
}))

describe('ContentPatcherImagePreview loading skeleton', () => {
  it('renders a full-cover skeleton while compare assets are being prepared', () => {
    const { container } = renderWithLocale(
      <ContentPatcherImagePreview
        targetPath="Characters/Abigail"
        imageDataUrl="patched-url"
        originalImageDataUrl="original-url"
        originalImageSource="Content/Characters/Abigail.png"
        simulationContext={{} as ContentPatcherBackendSimulationContext}
        simulationConfigEntries={[]}
        onSimulationContextChange={() => {}}
      />,
    )

    expect(container.querySelector('.cp-debugger-image-stage-skeleton')).toBeTruthy()
    expect(container.querySelector('.image-skeleton')).toBeTruthy()
    expect(container.querySelector('.cp-debugger-image-stage')).toHaveAttribute('aria-busy', 'true')
  })
})
