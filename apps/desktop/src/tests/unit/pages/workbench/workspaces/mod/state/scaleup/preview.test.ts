import { describe, expect, it } from 'vite-plus/test'
import { buildScaleUpPreviewModel, withBreathTypeDefaults } from '@pages/workbench/workspaces/mod/state/scaleup/preview'
import type { ScaleUpDraft } from '@pages/workbench/workspaces/mod/state/scaleup/types'

function buildCharacterDraft(overrides: Partial<ScaleUpDraft> = {}): ScaleUpDraft {
  return {
    key: 'ModForge.ScaleUp.Characters.Lewis',
    targetPath: 'Characters/Lewis',
    targetToken: '{{Arborsm.ScaleUpUnofficial/Assets}}',
    targetSource: {
      asset: 'Characters/Lewis',
      target: null,
      assets: [],
      assetsFormat: 'string',
    },
    scale: 4,
    paddingWidth: 20,
    paddingHeight: 4,
    sprite: {
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
    },
    ...overrides,
  }
}

describe('scaleup preview helpers', () => {
  it('builds overlay and crop rectangles for character sprite previews', () => {
    const preview = buildScaleUpPreviewModel(buildCharacterDraft(), {
      resultImage: { width: 276, height: 516 },
      originalImage: { width: 64, height: 128 },
    })

    expect(preview.sheet.width).toBe(276)
    expect(preview.sheet.height).toBe(516)
    expect(preview.headshot).toMatchObject({
      sourceRect: {
        x: 48,
        y: 232,
        width: 160,
        height: 240,
      },
      renderOffset: {
        x: 0,
        y: 0,
      },
    })
    expect(preview.miniMap).toMatchObject({
      sourceRect: {
        x: 56,
        y: 280,
        width: 128,
        height: 128,
      },
    })
    expect(preview.chestOverlay).toBeNull()
  })

  it('applies breath presets and exposes the chest overlay for animated sprites', () => {
    const draft = buildCharacterDraft({
      sprite: withBreathTypeDefaults(buildCharacterDraft().sprite!, 'Female'),
    })

    const preview = buildScaleUpPreviewModel(draft, {
      resultImage: { width: 256, height: 512 },
      originalImage: { width: 64, height: 128 },
    })

    expect(draft.sprite).toMatchObject({
      breathType: 'Female',
      chestSourceX: 24,
      chestSourceY: 100,
      chestSourceWidth: 16,
      chestSourceHeight: 8,
      chestAdjustX: 0,
      chestAdjustY: -4,
    })
    expect(preview.chestOverlay).toMatchObject({
      sourceRect: {
        x: 96,
        y: 400,
        width: 64,
        height: 32,
      },
      adjust: {
        x: 0,
        y: -4,
      },
    })
  })
})
