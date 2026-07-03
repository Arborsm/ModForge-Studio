import { describe, expect, it } from 'vite-plus/test'
import {
  deriveScaleUpDraft,
  findScaleUpEntry,
  getScaleUpEditorState,
  getScaleUpFrameBounds,
  getScaleUpFrameCount,
  getScaleUpFramePreviewMetrics,
  getScaleUpFramePreviewScale,
  upsertScaleUpEntry,
} from '@pages/workbench/workspaces/mod/state/scaleup/scaleup'

function buildContentWithExistingScaleUp() {
  return {
    Format: '2.0.0',
    Changes: [
      {
        Action: 'Load',
        Target: 'Characters/Lewis',
        FromFile: 'assets/lewis-hd.png',
      },
      {
        Action: 'EditData',
        Target: '{{Platonymous.ScaleUp/Assets}}',
        Entries: {
          'Playtonymous.Lewis': {
            Asset: 'Characters/Lewis',
            Scale: 4,
            PaddingWidth: 0,
            PaddingHeight: 0,
            Sprite: {
              BreathType: 'Female',
              HeadShotX: 12,
              HeadShotY: 58,
              MiniMapXOffset: 0,
              MiniMapYOffset: 0,
            },
          },
        },
      },
    ],
  }
}

function buildContentWithGroupedScaleUpEntries() {
  return {
    Format: '2.0.0',
    Changes: [
      {
        Action: 'EditData',
        Target: '{{Arborsm.ScaleUpUnofficial/Assets}}',
        Entries: {
          BB1ScaleUp: [
            {
              Asset: 'bonus/Painting I reg',
              Scale: 4,
            },
            {
              Target: 'Characters',
              Assets: 'Emily, Emily_Beach, Emily_Swims, Emily_Winter',
              Sprite: {
                BreathType: 'None',
                HeadShotX: 16,
                HeadShotY: 62,
                HeadShotXRenderOffset: 0,
                HeadShotYRenderOffset: 0,
                MiniMapXOffset: 2,
                MiniMapYOffset: 0,
              },
            },
            {
              Target: 'Characters',
              Assets: 'Haley, Haley_Beach, Haley_Swims, Haley_Winter',
              Sprite: {
                BreathType: 'None',
                HeadShotX: 16,
                HeadShotY: 64,
                HeadShotXRenderOffset: 0,
                HeadShotYRenderOffset: 0,
                MiniMapXOffset: 2,
                MiniMapYOffset: 0,
              },
            },
          ],
        },
      },
    ],
  }
}

function buildSprite(overrides: Partial<import('@pages/workbench/workspaces/mod/state/scaleup/types').ScaleUpSpriteDraft>) {
  return {
    breathType: 'None' as const,
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
    ...overrides,
  }
}

describe('scaleup attachment helpers', () => {
  it('finds an existing ScaleUp entry for a target image asset', () => {
    const entry = findScaleUpEntry(buildContentWithExistingScaleUp(), 'Characters/Lewis')

    expect(entry).toMatchObject({
      key: 'Playtonymous.Lewis',
      targetPath: 'Characters/Lewis',
      targetToken: '{{Platonymous.ScaleUp/Assets}}',
      scale: 4,
      paddingWidth: 0,
      paddingHeight: 0,
      sprite: {
        breathType: 'Female',
        headShotX: 12,
        headShotY: 58,
      },
    })
  })

  it('finds an existing grouped ScaleUp entry for a target image asset', () => {
    const entry = findScaleUpEntry(buildContentWithGroupedScaleUpEntries(), 'Characters/Emily')

    expect(entry).toMatchObject({
      key: 'BB1ScaleUp',
      targetPath: 'Characters/Emily',
      targetToken: '{{Arborsm.ScaleUpUnofficial/Assets}}',
      scale: 1,
      paddingWidth: 0,
      paddingHeight: 0,
      sprite: {
        breathType: 'None',
        headShotX: 16,
        headShotY: 62,
        miniMapXOffset: 2,
        miniMapYOffset: 0,
      },
    })
  })

  it('derives a default ScaleUp draft from result and original image dimensions', () => {
    const draft = deriveScaleUpDraft('Characters/Lewis', {
      resultImage: { width: 276, height: 516 },
      originalImage: { width: 64, height: 128 },
    })

    expect(draft).toMatchObject({
      targetPath: 'Characters/Lewis',
      targetToken: '{{Arborsm.ScaleUpUnofficial/Assets}}',
      scale: 4,
      paddingWidth: 20,
      paddingHeight: 4,
    })
  })

  it('derives portrait frame counts from the original sheet dimensions when ScaleUp resized the result sheet', () => {
    const frameCount = getScaleUpFrameCount(
      {
        resultImage: { width: 512, height: 256 },
        originalImage: { width: 128, height: 64 },
      },
      {
        frameWidth: 64,
        frameHeight: 64,
      },
    )

    expect(frameCount).toBe(2)
  })

  it('returns scaled portrait frame bounds when ScaleUp resized the result sheet', () => {
    const bounds = getScaleUpFrameBounds(
      {
        resultImage: { width: 512, height: 256 },
        originalImage: { width: 128, height: 64 },
      },
      1,
      {
        frameWidth: 64,
        frameHeight: 64,
      },
    )

    expect(bounds).toEqual({
      frameWidth: 256,
      frameHeight: 256,
      frameX: 256,
      frameY: 0,
    })
  })

  it('scales oversized ScaleUp portrait frames back down for preview rendering', () => {
    const previewScale = getScaleUpFramePreviewScale(
      {
        resultImage: { width: 512, height: 256 },
        originalImage: { width: 128, height: 64 },
      },
      {
        frameWidth: 64,
        frameHeight: 64,
        previewScale: 2,
      },
    )

    expect(previewScale).toBe(0.5)
  })

  it('returns preview-space crop metrics without relying on a transform shrink step', () => {
    const metrics = getScaleUpFramePreviewMetrics(
      {
        resultImage: { width: 512, height: 256 },
        originalImage: { width: 128, height: 64 },
      },
      1,
      {
        frameWidth: 64,
        frameHeight: 64,
        previewScale: 2,
      },
    )

    expect(metrics).toEqual({
      frameWidth: 128,
      frameHeight: 128,
      frameX: 128,
      frameY: 0,
      sheetWidth: 256,
      sheetHeight: 128,
    })
  })

  it('updates an existing ScaleUp entry without changing its attached target token', () => {
    const nextContent = upsertScaleUpEntry(buildContentWithExistingScaleUp(), {
      key: 'Playtonymous.Lewis',
      targetPath: 'Characters/Lewis',
      targetToken: '{{Platonymous.ScaleUp/Assets}}',
      targetSource: {
        asset: 'Characters/Lewis',
        target: null,
        assets: [],
        assetsFormat: 'string',
      },
      scale: 5,
      paddingWidth: 8,
      paddingHeight: 2,
      sprite: buildSprite({
        breathType: 'Male',
        headShotX: 10,
        headShotY: 54,
        miniMapXOffset: 2,
        miniMapYOffset: -1,
      }),
    })

    expect(nextContent).toMatchObject({
      Changes: [
        {
          Action: 'Load',
          Target: 'Characters/Lewis',
          FromFile: 'assets/lewis-hd.png',
        },
        {
          Action: 'EditData',
          Target: '{{Platonymous.ScaleUp/Assets}}',
          Entries: {
            'Playtonymous.Lewis': {
              Asset: 'Characters/Lewis',
              Scale: 5,
              PaddingWidth: 8,
              PaddingHeight: 2,
              Sprite: {
                BreathType: 'Male',
                HeadShotX: 10,
                HeadShotY: 54,
                MiniMapXOffset: 2,
                MiniMapYOffset: -1,
              },
            },
          },
        },
      ],
    })
  })

  it('updates an existing grouped ScaleUp entry without replacing sibling entries', () => {
    const nextContent = upsertScaleUpEntry(buildContentWithGroupedScaleUpEntries(), {
      key: 'BB1ScaleUp',
      targetPath: 'Characters/Emily',
      targetToken: '{{Arborsm.ScaleUpUnofficial/Assets}}',
      targetSource: {
        asset: null,
        target: 'Characters',
        assets: ['Emily', 'Emily_Beach', 'Emily_Swims', 'Emily_Winter'],
        assetsFormat: 'string',
      },
      scale: 5,
      paddingWidth: 8,
      paddingHeight: 2,
      sprite: buildSprite({
        breathType: 'Male',
        headShotX: 10,
        headShotY: 54,
        miniMapXOffset: 3,
        miniMapYOffset: -1,
      }),
    })

    expect(nextContent).toMatchObject({
      Changes: [
        {
          Action: 'EditData',
          Target: '{{Arborsm.ScaleUpUnofficial/Assets}}',
          Entries: {
            BB1ScaleUp: [
              {
                Asset: 'bonus/Painting I reg',
                Scale: 4,
              },
              {
                Target: 'Characters',
                Assets: 'Emily, Emily_Beach, Emily_Swims, Emily_Winter',
                Scale: 5,
                PaddingWidth: 8,
                PaddingHeight: 2,
                Sprite: {
                  BreathType: 'Male',
                  HeadShotX: 10,
                  HeadShotY: 54,
                  MiniMapXOffset: 3,
                  MiniMapYOffset: -1,
                },
              },
              {
                Target: 'Characters',
                Assets: 'Haley, Haley_Beach, Haley_Swims, Haley_Winter',
                Sprite: {
                  BreathType: 'None',
                  HeadShotX: 16,
                  HeadShotY: 64,
                  MiniMapXOffset: 2,
                  MiniMapYOffset: 0,
                },
              },
            ],
          },
        },
      ],
    })
  })

  it('creates a canonical ScaleUp patch when a target needs one and none exists yet', () => {
    const nextContent = upsertScaleUpEntry(
      {
        Format: '2.0.0',
        Changes: [
          {
            Action: 'Load',
            Target: 'Portraits/Abigail',
            FromFile: 'assets/abigail-hd.png',
          },
        ],
      },
      {
        key: 'ModForge.ScaleUp.Portraits.Abigail',
        targetPath: 'Portraits/Abigail',
        targetToken: '{{Arborsm.ScaleUpUnofficial/Assets}}',
        targetSource: {
          asset: 'Portraits/Abigail',
          target: null,
          assets: [],
          assetsFormat: 'string',
        },
        scale: 4,
        paddingWidth: 0,
        paddingHeight: 0,
        sprite: null,
      },
    )

    expect(nextContent).toMatchObject({
      Changes: [
        {
          Action: 'Load',
          Target: 'Portraits/Abigail',
          FromFile: 'assets/abigail-hd.png',
        },
        {
          Action: 'EditData',
          Target: '{{Arborsm.ScaleUpUnofficial/Assets}}',
          Entries: {
            'ModForge.ScaleUp.Portraits.Abigail': {
              Asset: 'Portraits/Abigail',
              Scale: 4,
              PaddingWidth: 0,
              PaddingHeight: 0,
            },
          },
        },
      ],
    })
  })

  it('builds editor state from an existing entry before falling back to derived defaults', () => {
    const existing = getScaleUpEditorState(buildContentWithExistingScaleUp(), 'Characters/Lewis', {
      resultImage: { width: 256, height: 512 },
      originalImage: { width: 64, height: 128 },
    })
    const grouped = getScaleUpEditorState(buildContentWithGroupedScaleUpEntries(), 'Characters/Emily', {
      resultImage: { width: 276, height: 516 },
      originalImage: { width: 64, height: 128 },
    })
    const derived = getScaleUpEditorState(
      {
        Format: '2.0.0',
        Changes: [],
      },
      'Portraits/Abigail',
      {
        resultImage: { width: 256, height: 256 },
        originalImage: { width: 64, height: 64 },
      },
    )

    expect(existing.source).toBe('existing')
    expect(existing.draft.targetToken).toBe('{{Platonymous.ScaleUp/Assets}}')
    expect(grouped.source).toBe('existing')
    expect(grouped.draft.targetToken).toBe('{{Arborsm.ScaleUpUnofficial/Assets}}')
    expect(grouped.draft.sprite?.headShotX).toBe(16)
    expect(derived.source).toBe('derived')
    expect(derived.draft.targetToken).toBe('{{Arborsm.ScaleUpUnofficial/Assets}}')
  })
})
