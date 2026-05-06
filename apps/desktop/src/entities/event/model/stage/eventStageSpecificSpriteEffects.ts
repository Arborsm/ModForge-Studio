import type { EventCommand } from '@entities/event'
import {
  createAnimationRowEffect,
  createObjectSheetEffect,
  createStageEffect,
  EFFECT_VIEWPORT_BASE_HEIGHT,
  EFFECT_VIEWPORT_BASE_WIDTH,
  parseNumber,
  parsePoint,
  type SpecificTemporarySpriteResolution,
  type StageEffectState,
} from '@entities/event'

export function buildSpecificTemporarySpriteEffects(command: EventCommand): SpecificTemporarySpriteResolution {
  const spriteId = command.args[1]
  if (!spriteId) {
    return { effects: [] as StageEffectState[], mode: 'append' as const }
  }

  if (spriteId === 'removeSprite') {
    const effectNumericId = Number.parseInt(command.args[2] ?? '', 10)
    return {
      effects: [] as StageEffectState[],
      mode: Number.isFinite(effectNumericId) ? ('remove-by-id' as const) : ('append' as const),
      effectNumericId: Number.isFinite(effectNumericId) ? effectNumericId : null,
    }
  }

  if (spriteId === 'staticSprite') {
    const sourceX = parseNumber(command.args[3])
    const sourceY = parseNumber(command.args[4])
    const sourceWidth = parseNumber(command.args[5])
    const sourceHeight = parseNumber(command.args[6])
    const tileX = parseNumber(command.args[7])
    const tileY = parseNumber(command.args[8])
    const effectNumericId = parseNumber(command.args[9])
    const layerDepth = parseNumber(command.args[10])

    return {
      mode: 'append' as const,
      effects:
        command.args[2] &&
        sourceX != null &&
        sourceY != null &&
        sourceWidth != null &&
        sourceHeight != null &&
        tileX != null &&
        tileY != null
          ? [
              createStageEffect(command.id, 'staticSprite', {
                textureName: command.args[2],
                sourceX,
                sourceY,
                sourceWidth,
                sourceHeight,
                baseX: tileX * 64,
                baseY: tileY * 64,
                space: 'world',
                animationIntervalMs: 999999,
                animationLength: 1,
                loops: 999,
                scale: 4,
                layerDepth: layerDepth ?? 1,
                effectNumericId: effectNumericId == null ? 999 : effectNumericId,
              }),
            ]
          : [],
    }
  }

  switch (spriteId) {
    case 'heart': {
      const tile = parsePoint(command.args[2], command.args[3])
      return {
        mode: 'append' as const,
        effects: tile
          ? [
              createStageEffect(command.id, 'heart', {
                textureName: 'LooseSprites\\Cursors',
                sourceX: 211,
                sourceY: 428,
                sourceWidth: 7,
                sourceHeight: 6,
                baseX: tile.tileX * 64 - 16,
                baseY: tile.tileY * 64 - 16,
                space: 'world',
                animationIntervalMs: 2000,
                animationLength: 1,
                loops: 0,
                motionY: -0.5,
                alphaFade: 0.01,
                scale: 4,
              }),
            ]
          : [],
      }
    }
    case 'EmilyBoomBox':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'EmilyBoomBox', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 586,
            sourceY: 1871,
            sourceWidth: 24,
            sourceHeight: 14,
            baseX: 15 * 64,
            baseY: 4 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            layerDepth: 0.01,
            scale: 4,
          }),
        ],
      }
    case 'EmilyBoomBoxStart':
      return { effects: [], mode: 'update-boombox-start' as const }
    case 'EmilyBoomBoxStop':
      return { effects: [], mode: 'update-boombox-stop' as const }
    case 'EmilySleeping':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'EmilySleeping', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 574,
            sourceY: 1892,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: 20 * 64 + 8,
            baseY: 3 * 64 + 32,
            space: 'world',
            animationIntervalMs: 1000,
            animationLength: 2,
            loops: 99999,
            layerDepth: 1,
            scale: 4,
          }),
        ],
      }
    case 'EmilyCamping':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'EmilyCamping:tent', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 644,
            sourceY: 1578,
            sourceWidth: 59,
            sourceHeight: 53,
            baseX: 26 * 64 - 16,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0788,
          }),
          createStageEffect(command.id, 'EmilyCamping:pillow', {
            effectNumericId: 99,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 675,
            sourceY: 1299,
            sourceWidth: 29,
            sourceHeight: 24,
            baseX: 27 * 64,
            baseY: 14 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.001,
          }),
          createStageEffect(command.id, 'EmilyCamping:fire', {
            effectNumericId: 666,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1985,
            sourceWidth: 12,
            sourceHeight: 11,
            baseX: 27 * 64 + 8 * 4,
            baseY: 14 * 64 + 4 * 4,
            space: 'world',
            animationIntervalMs: 50,
            animationLength: 4,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
        ],
      }
    case 'shakeTent':
      return { effects: [], mode: 'update-shake' as const, effectNumericId: 999, shakeIntensity: 1 }
    case 'stopShakeTent':
      return { effects: [], mode: 'update-shake' as const, effectNumericId: 999, shakeIntensity: 0 }
    case 'EmilySongBackLights':
      return {
        mode: 'append' as const,
        effects: [
          ...Array.from({ length: 5 }, (_, index) =>
            createStageEffect(command.id, `EmilySongBackLights:bar:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 681,
              sourceY: 1890,
              sourceWidth: 18,
              sourceHeight: 12,
              baseX: 180 + index * 190,
              baseY: -24,
              space: 'screen',
              animationIntervalMs: 42241,
              animationLength: 1,
              loops: 1,
              scale: 4,
              xPeriodic: true,
              xPeriodicLoopTimeMs: 1760,
              xPeriodicRange: 96 + index * 12,
              delayBeforeStartMs: index * 120,
              layerDepth: 0.01,
            }),
          ),
          ...Array.from({ length: 6 }, (_, index) =>
            createStageEffect(command.id, `EmilySongBackLights:flare:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 616 + (index % 2) * 10,
              sourceY: 1891,
              sourceWidth: 10,
              sourceHeight: 10,
              baseX: 1240,
              baseY: 120 + index * 76,
              space: 'screen',
              animationIntervalMs: 42241,
              animationLength: 1,
              loops: 1,
              scale: 4,
              motionX: -4.5,
              yPeriodic: true,
              yPeriodicLoopTimeMs: 1800 + index * 120,
              yPeriodicRange: 32 + index * 6,
              delayBeforeStartMs: 900 + index * 160,
              layerDepth: 0.02,
              pulse: true,
              pulseTimeMs: 440,
              pulseAmount: 1.22,
            }),
          ),
        ],
      }
    case 'EmilySign':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 6 }, (_, index) =>
          createStageEffect(command.id, `EmilySign:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 597,
            sourceY: 1888,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 1280 - index * 96,
            baseY: 80 + index * 72,
            space: 'screen',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            delayBeforeStartMs: index * 180,
            layerDepth: 0.02,
          }),
        ),
      }
    case 'junimoSpotlight':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'junimoSpotlight', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 316,
            sourceY: 123,
            sourceWidth: 67,
            sourceHeight: 43,
            baseX: 506,
            baseY: 254,
            space: 'screen',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.0001,
          }),
        ],
      }
    case 'missingJunimoStars':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 8 }, (_, index) =>
          createStageEffect(command.id, `missingJunimoStars:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: 620 + (index % 4) * 26,
            baseY: 260 + Math.floor(index / 4) * 28,
            space: 'screen',
            animationIntervalMs: 999,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.04,
            motionX: (index % 2 === 0 ? -0.5 : 0.5) * (1 + index * 0.05),
            motionY: -1.8 - index * 0.18,
            accelerationY: 0.07,
            rotationChange: 0.02 + index * 0.004,
            alphaFade: 0.005,
            color: '#a6ff77',
          }),
        ),
      }
    case 'shanePassedOut':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'shanePassedOut:body', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 533,
            sourceY: 1864,
            sourceWidth: 19,
            sourceHeight: 27,
            baseX: 25 * 64,
            baseY: 7 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            layerDepth: 0.01,
            scale: 4,
          }),
          createStageEffect(command.id, 'shanePassedOut:shadow', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 552,
            sourceY: 1862,
            sourceWidth: 31,
            sourceHeight: 21,
            baseX: 25 * 64 - 16,
            baseY: 7 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            layerDepth: 0.0001,
            scale: 4,
          }),
        ],
      }
    case 'waterShane':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'waterShane', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 533,
            sourceY: 1864,
            sourceWidth: 19,
            sourceHeight: 10,
            baseX: 20 * 64 + 16,
            baseY: 3 * 64 + 12,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
        ],
      }
    case 'waterShaneDone':
      return { effects: [], mode: 'remove-by-id' as const, effectNumericId: 999 }
    case 'jasGift':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'jasGift', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 288,
            sourceY: 1231,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 22 * 64,
            baseY: 16 * 64,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 6,
            loops: 1,
            holdLastFrame: true,
            scale: 4,
            layerDepth: 0.01,
          }),
        ],
      }
    case 'jasGiftOpen':
      return {
        mode: 'replace-jas-gift' as const,
        effects: [
          createStageEffect(command.id, 'jasGiftOpen:star', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 537,
            sourceY: 1850,
            sourceWidth: 11,
            sourceHeight: 10,
            baseX: 23 * 64 + 16,
            baseY: 16 * 64 - 48,
            space: 'world',
            animationIntervalMs: 1500,
            animationLength: 1,
            loops: 1,
            motionY: -0.25,
            delayBeforeStartMs: 500,
            layerDepth: 0.99,
            scale: 4,
          }),
        ],
      }
    case 'umbrella':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'umbrella', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 324,
            sourceY: 1843,
            sourceWidth: 27,
            sourceHeight: 23,
            baseX: 12 * 64 - 20,
            baseY: 39 * 64 - 104,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 3,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'elliottBoat':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'elliottBoat', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 461,
            sourceY: 1843,
            sourceWidth: 32,
            sourceHeight: 51,
            baseX: 15 * 64 - 28,
            baseY: 26 * 64,
            space: 'world',
            animationIntervalMs: 1000,
            animationLength: 2,
            loops: 9999,
            scale: 4,
            layerDepth: 0.1664,
          }),
        ],
      }
    case 'leahTree':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'leahTree', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 1677,
            sourceWidth: 16,
            sourceHeight: 21,
            baseX: 42 * 64,
            baseY: 8 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'leahPicnic':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'leahPicnic', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 96,
            sourceY: 1808,
            sourceWidth: 32,
            sourceHeight: 48,
            baseX: 75 * 64,
            baseY: 37 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 0.2496,
          }),
        ],
      }
    case 'leahLaptop':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'leahLaptop', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 130,
            sourceY: 1849,
            sourceWidth: 19,
            sourceHeight: 19,
            baseX: 12 * 64,
            baseY: 10 * 64 + 24,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 0.1856,
          }),
        ],
      }
    case 'JoshMom':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'JoshMom', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 416,
            sourceY: 1931,
            sourceWidth: 58,
            sourceHeight: 65,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH / 2,
            baseY: EFFECT_VIEWPORT_BASE_HEIGHT,
            space: 'screen',
            animationIntervalMs: 750,
            animationLength: 2,
            loops: 99999,
            scale: 4,
            alpha: 0.6,
            layerDepth: 1,
            xPeriodic: true,
            xPeriodicLoopTimeMs: 2000,
            xPeriodicRange: 32,
            motionY: -1.25,
          }),
          ...Array.from({ length: 4 }, (_, index) =>
            createStageEffect(command.id, `JoshMom:leaf:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 516,
              sourceY: 1916,
              sourceWidth: 7,
              sourceHeight: 10,
              baseX: EFFECT_VIEWPORT_BASE_WIDTH / 2 + 8 + index * 10,
              baseY: EFFECT_VIEWPORT_BASE_HEIGHT - 110 + index * 6,
              space: 'screen',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 99999,
              scale: 4,
              alphaFade: 0.01,
              motionX: -1,
              motionY: -1,
              delayBeforeStartMs: (index + 1) * 320,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'willyCrabExperiment':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'willyCrabExperiment:1', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 259,
            sourceY: 146,
            sourceWidth: 18,
            sourceHeight: 18,
            baseX: 2 * 64,
            baseY: 6 * 64,
            space: 'world',
            animationIntervalMs: 200,
            animationLength: 3,
            loops: 99999,
            pingPong: true,
            scale: 4,
            yPeriodic: true,
            yPeriodicLoopTimeMs: 8000,
            yPeriodicRange: 32,
          }),
          createStageEffect(command.id, 'willyCrabExperiment:2', {
            effectNumericId: 2,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 259,
            sourceY: 146,
            sourceWidth: 18,
            sourceHeight: 18,
            baseX: 4 * 64,
            baseY: 7 * 64,
            space: 'world',
            animationIntervalMs: 200,
            animationLength: 3,
            loops: 99999,
            pingPong: true,
            scale: 4,
          }),
          createStageEffect(command.id, 'willyCrabExperiment:3', {
            effectNumericId: 3,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 259,
            sourceY: 127,
            sourceWidth: 18,
            sourceHeight: 18,
            baseX: 8 * 64,
            baseY: 6 * 64,
            space: 'world',
            animationIntervalMs: 180,
            animationLength: 3,
            loops: 99999,
            pingPong: true,
            scale: 4,
            yPeriodic: true,
            yPeriodicLoopTimeMs: 10000,
            yPeriodicRange: 32,
          }),
        ],
      }
    case 'beachStuff':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'beachStuff', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 324,
            sourceY: 1887,
            sourceWidth: 47,
            sourceHeight: 29,
            baseX: 44 * 64,
            baseY: 21 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 0.00001,
          }),
        ],
      }
    case 'springOnion':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'springOnion', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 1,
            sourceY: 129,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 84 * 64,
            baseY: 39 * 64,
            space: 'world',
            animationIntervalMs: 200,
            animationLength: 8,
            loops: 999999,
            scale: 4,
            layerDepth: 0.4736,
          }),
        ],
      }
    case 'springOnionDemo':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'springOnionDemo', {
            effectNumericId: 777,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 144,
            sourceY: 215,
            sourceWidth: 112,
            sourceHeight: 112,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH / 2 - 264,
            baseY: EFFECT_VIEWPORT_BASE_HEIGHT / 3 - 264,
            space: 'screen',
            animationIntervalMs: 200,
            animationLength: 2,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'springOnionPeel':
      return { effects: [], mode: 'update-replace-source' as const, effectNumericId: 777, sourceRect: { x: 144, y: 327, width: 112, height: 112 } }
    case 'springOnionRemove':
      return { effects: [], mode: 'remove-by-id' as const, effectNumericId: 777 }
    case 'joshDog':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'joshDog', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 324,
            sourceY: 1916,
            sourceWidth: 12,
            sourceHeight: 20,
            baseX: 53 * 64 + 12,
            baseY: 67 * 64 + 12,
            space: 'world',
            animationIntervalMs: 500,
            animationLength: 6,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'joshSteak':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'joshSteak:dog', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 324,
            sourceY: 1936,
            sourceWidth: 12,
            sourceHeight: 20,
            baseX: 53 * 64 + 12,
            baseY: 67 * 64 + 12,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 4,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
          createStageEffect(command.id, 'joshSteak:meat', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: 50 * 64 + 32,
            baseY: 68 * 64 - 8,
            space: 'world',
            animationIntervalMs: 999,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'WillyWad':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'WillyWad:wad', {
            effectNumericId: 996,
            textureName: 'LooseSprites\\Cursors2',
            sourceX: 192,
            sourceY: 61,
            sourceWidth: 32,
            sourceHeight: 32,
            baseX: 50 * 64,
            baseY: 23 * 64,
            space: 'world',
            animationIntervalMs: 400,
            animationLength: 2,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1536,
          }),
          createStageEffect(command.id, 'WillyWad:flameA', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 53 * 64,
            baseY: 24 * 64,
            space: 'world',
            animationIntervalMs: 500,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1984,
          }),
          createStageEffect(command.id, 'WillyWad:flameB', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 54 * 64,
            baseY: 23 * 64,
            space: 'world',
            animationIntervalMs: 510,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1984,
          }),
        ],
      }
    case 'pennyCook':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 4 }, (_, index) =>
          createStageEffect(command.id, `pennyCook:${index}`, {
            textureName: 'TileSheets\\animations',
            sourceX: 256,
            sourceY: 1856,
            sourceWidth: 64,
            sourceHeight: 128,
            baseX: 10 * 64 + (index === 1 ? 16 : index === 2 ? -16 : 0),
            baseY: 6 * 64,
            space: 'world',
            animationIntervalMs: 75,
            animationLength: 6,
            loops: 99999,
            scale: 1,
            layerDepth: index % 2 === 0 ? 1 : 0.1,
            motionY: -0.5,
            delayBeforeStartMs: index === 1 ? 500 : index === 2 ? 750 : index === 3 ? 1000 : 0,
          }),
        ),
      }
    case 'abbyOneBat':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'abbyOneBat', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 640,
            sourceY: 1664,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 23 * 64,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 4,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
            xPeriodic: true,
            xPeriodicLoopTimeMs: 2000,
            xPeriodicRange: 128,
            motionY: -8,
          }),
        ],
      }
    case 'abbyManyBats':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 24 }, (_, index) =>
          createStageEffect(command.id, `abbyManyBats:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 640,
            sourceY: 1664,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 23 * 64,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 4,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
            motionX: (index % 5) - 2,
            motionY: -4 - (index % 4),
            xPeriodic: index % 2 === 0,
            xPeriodicLoopTimeMs: 1500 + index * 40,
            xPeriodicRange: 64 + index * 2,
            delayBeforeStartMs: index * 60,
            alphaFade: 0.003,
          }),
        ),
      }
    case 'abbyOuija':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'abbyOuija', {
            textureName: 'TileSheets\\animations',
            sourceX: 0,
            sourceY: 960,
            sourceWidth: 128,
            sourceHeight: 128,
            baseX: 6 * 64,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 60,
            animationLength: 4,
            loops: 0,
            scale: 1,
            layerDepth: 1,
          }),
        ],
      }
    case 'witchFlyby':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'witchFlyby', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1886,
            sourceWidth: 35,
            sourceHeight: 29,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH,
            baseY: 192,
            space: 'screen',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: 4,
            motionX: -4,
            accelerationX: -0.025,
            yPeriodic: true,
            yPeriodicLoopTimeMs: 2000,
            yPeriodicRange: 64,
            layerDepth: 1,
          }),
        ],
      }
    case 'morrisFlying':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'morrisFlying', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 105,
            sourceY: 1318,
            sourceWidth: 13,
            sourceHeight: 31,
            baseX: 32 * 64,
            baseY: 13 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            motionX: 4,
            motionY: -8,
            rotationChange: Math.PI / 16,
            shakeIntensity: 1,
          }),
        ],
      }
    case 'golemDie':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'golemDie', {
            textureName: 'Characters\\Monsters\\Wilderness Golem',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 16,
            sourceHeight: 24,
            baseX: 40 * 64 + 8,
            baseY: 11 * 64 - 32,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.01,
            rotation: Math.PI / 2,
            motionY: 4,
          }),
        ],
      }
    case 'swordswipe': {
      const tile = parsePoint(command.args[2], command.args[3])
      return {
        mode: 'append' as const,
        effects: tile
          ? [
              createStageEffect(command.id, 'swordswipe', {
                textureName: 'TileSheets\\animations',
                sourceX: 0,
                sourceY: 960,
                sourceWidth: 128,
                sourceHeight: 128,
                baseX: tile.tileX * 64,
                baseY: tile.tileY * 64 - 32,
                space: 'world',
                animationIntervalMs: 60,
                animationLength: 4,
                loops: 0,
                scale: 1,
                layerDepth: 1,
              }),
            ]
          : [],
      }
    }
    case 'farmerForestVision':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'farmerForestVision:veil', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 393,
            sourceY: 1973,
            sourceWidth: 1,
            sourceHeight: 1,
            baseX: 0,
            baseY: 0,
            space: 'screen',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: EFFECT_VIEWPORT_BASE_WIDTH * 2,
            alpha: 0,
            alphaFade: -0.002,
            color: '#8cff69',
            layerDepth: 1,
          }),
          ...Array.from({ length: 12 }, (_, index) =>
            createStageEffect(command.id, `farmerForestVision:motif:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 367 + (index % 2 === 0 ? 8 : 0),
              sourceY: 1969,
              sourceWidth: 8,
              sourceHeight: 8,
              baseX: -64 + (index % 4) * 340,
              baseY: -64 + Math.floor(index / 4) * 220,
              space: 'screen',
              animationIntervalMs: 9999,
              animationLength: 1,
              loops: 999999,
              scale: 4,
              alpha: 0,
              alphaFade: -0.0015,
              xPeriodic: true,
              xPeriodicLoopTimeMs: 4000,
              xPeriodicRange: 64,
              yPeriodic: true,
              yPeriodicLoopTimeMs: 5000,
              yPeriodicRange: 96,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'arcaneBook':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 10 }, (_, index) =>
          createStageEffect(command.id, `arcaneBook:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 536,
            sourceY: 1945,
            sourceWidth: 8,
            sourceHeight: 8,
            baseX: 128 + (index % 4) * 10,
            baseY: 792 - index * 6,
            space: 'screen',
            animationIntervalMs: 50,
            animationLength: 7,
            loops: 99999,
            scale: 4,
            alphaFade: 0.008,
            layerDepth: 1,
          }),
        ),
      }
    case 'wizardWarp':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'wizardWarp', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 387,
            sourceY: 1965,
            sourceWidth: 16,
            sourceHeight: 31,
            baseX: 8 * 64,
            baseY: 16 * 64 + 4,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: 4,
            motionX: 2,
            motionY: -2,
            accelerationX: 0.1,
            scaleChange: -0.02,
            alphaFade: 0.001,
          }),
        ],
      }
    case 'wizardWarp2':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'wizardWarp2', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 387,
            sourceY: 1965,
            sourceWidth: 16,
            sourceHeight: 31,
            baseX: 54 * 64,
            baseY: 34 * 64 + 4,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: 4,
            motionX: -1,
            motionY: 2,
            accelerationX: -0.1,
            accelerationY: 0.2,
            scaleChange: 0.03,
            alphaFade: 0.001,
          }),
        ],
      }
    case 'haleyRoomDark':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'haleyRoomDark', {
            textureName: 'TileSheets\\animations',
            sourceX: 448,
            sourceY: 512,
            sourceWidth: 64,
            sourceHeight: 64,
            baseX: 4 * 64,
            baseY: 1 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 1,
            layerDepth: 1,
          }),
        ],
      }
    case 'shaneSaloonCola':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'shaneSaloonCola', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 552,
            sourceY: 1862,
            sourceWidth: 31,
            sourceHeight: 21,
            baseX: 32 * 64 + 40,
            baseY: 17 * 64 + 12,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0000001,
          }),
        ],
      }
    case 'parrotSlide':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'parrotSlide', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 165,
            sourceWidth: 24,
            sourceHeight: 22,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH,
            baseY: 256,
            space: 'screen',
            animationIntervalMs: 100,
            animationLength: 6,
            loops: 9999,
            scale: 4,
            motionX: -3,
            yPeriodic: true,
            yPeriodicLoopTimeMs: 2000,
            yPeriodicRange: 32,
          }),
        ],
      }
    case 'parrotSplat':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'parrotSplat', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 165,
            sourceWidth: 24,
            sourceHeight: 22,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH,
            baseY: 64,
            space: 'screen',
            animationIntervalMs: 100,
            animationLength: 6,
            loops: 9999,
            scale: 4,
            motionX: -2,
            motionY: 4,
            accelerationX: -0.1,
            layerDepth: 1,
          }),
        ],
      }
    case 'parrots1':
      return {
        mode: 'append' as const,
        effects: [256, 192, 320].map((y, index) =>
          createStageEffect(command.id, `parrots1:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 165,
            sourceWidth: 24,
            sourceHeight: 22,
            baseX: EFFECT_VIEWPORT_BASE_WIDTH,
            baseY: y,
            space: 'screen',
            animationIntervalMs: 100,
            animationLength: 6,
            loops: 9999,
            scale: 4,
            motionX: -3,
            yPeriodic: true,
            yPeriodicLoopTimeMs: 2000,
            yPeriodicRange: 32,
            delayBeforeStartMs: index * 600,
          }),
        ),
      }
    case 'BoatParrot':
    case 'BoatParrotSquawk':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'BoatParrot', {
            effectNumericId: 777,
            textureName: 'LooseSprites\\parrots',
            sourceX: spriteId === 'BoatParrotSquawk' ? 24 : 0,
            sourceY: 0,
            sourceWidth: 24,
            sourceHeight: 24,
            baseX: 1120,
            baseY: 150,
            space: 'screen',
            animationIntervalMs: 120,
            animationLength: spriteId === 'BoatParrotSquawk' ? 3 : 1,
            loops: 9999,
            pingPong: spriteId === 'BoatParrotSquawk',
            scale: 4,
          }),
        ],
      }
    case 'BoatParrotLeave':
      return { effects: [], mode: 'update-replace-source' as const, effectNumericId: 777, sourceRect: { x: 48, y: 0, width: 24, height: 24 } }
    case 'BoatParrotSquawkStop':
      return { effects: [], mode: 'update-replace-source' as const, effectNumericId: 777, sourceRect: { x: 0, y: 0, width: 24, height: 24 } }
    case 'grandpaNight':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'grandpaNight:top', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 1453,
            sourceWidth: 639,
            sourceHeight: 176,
            baseX: 0,
            baseY: 64,
            space: 'screen',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: 4,
            alpha: 0.01,
            alphaFade: -0.002,
            layerDepth: 1,
          }),
          createStageEffect(command.id, 'grandpaNight:bottom', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 1453,
            sourceWidth: 639,
            sourceHeight: 176,
            baseX: 0,
            baseY: 768,
            space: 'screen',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999999,
            scale: 4,
            alpha: 0.01,
            alphaFade: -0.002,
            layerDepth: 1,
            flip: true,
          }),
        ],
      }
    case 'grandpaSpirit':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'grandpaSpirit', {
            effectNumericId: 77777,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 555,
            sourceY: 1956,
            sourceWidth: 18,
            sourceHeight: 35,
            baseX: -1000 * 64,
            baseY: -1010 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
            motionY: 1,
            xPeriodic: true,
            xPeriodicLoopTimeMs: 3000,
            xPeriodicRange: 16,
          }),
        ],
      }
    case 'junimoCage':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'junimoCage:core', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 325,
            sourceY: 1977,
            sourceWidth: 18,
            sourceHeight: 19,
            baseX: 10 * 64,
            baseY: 17 * 64 - 4,
            space: 'world',
            animationIntervalMs: 60,
            animationLength: 3,
            loops: 999999,
            scale: 4,
            shakeIntensity: 0,
          }),
          ...[
            { x: 0, y: -4, px: 24, py: 24, delay: 0 },
            { x: 72, y: -4, px: -24, py: 24, delay: 250 },
            { x: 0, y: 52, px: -24, py: 24, delay: 450 },
            { x: 72, y: 52, px: 24, py: 24, delay: 650 },
          ].map((entry, index) =>
            createStageEffect(command.id, `junimoCage:orb:${index}`, {
              effectNumericId: 1,
              textureName: 'LooseSprites\\Cursors',
              sourceX: 379,
              sourceY: 1991,
              sourceWidth: 5,
              sourceHeight: 5,
              baseX: 10 * 64 + entry.x,
              baseY: 17 * 64 + entry.y,
              space: 'world',
              animationIntervalMs: 9999,
              animationLength: 1,
              loops: 999999,
              scale: 4,
              xPeriodic: true,
              xPeriodicLoopTimeMs: 2000,
              xPeriodicRange: entry.px,
              yPeriodic: true,
              yPeriodicLoopTimeMs: 2000,
              yPeriodicRange: entry.py,
              delayBeforeStartMs: entry.delay,
            }),
          ),
        ],
      }
    case 'linusCampfire':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'linusCampfire', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1985,
            sourceWidth: 12,
            sourceHeight: 11,
            baseX: 29 * 64 + 8,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 50,
            animationLength: 4,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0576,
            pulse: true,
            pulseTimeMs: 680,
            pulseAmount: 1.08,
          }),
        ],
      }
    case 'ccCelebration':
      return {
        mode: 'append' as const,
        effects: [
          ...Array.from({ length: 32 }, (_, index) => {
            const baseX = 24 + ((index * 137) % (EFFECT_VIEWPORT_BASE_WIDTH - 160))
            const baseY = EFFECT_VIEWPORT_BASE_HEIGHT + index * 48
            const color = ['#ff5a5a', '#ffb347', '#ffe066', '#74e26b', '#58d3ff', '#7f88ff', '#d98cff', '#ff7ecf'][index % 8]

            return [
              createStageEffect(command.id, `ccCelebration:streamer:${index}`, {
                textureName: 'LooseSprites\\Cursors',
                sourceX: 534,
                sourceY: 1413,
                sourceWidth: 11,
                sourceHeight: 16,
                baseX,
                baseY,
                space: 'screen',
                animationIntervalMs: 99999,
                animationLength: 1,
                loops: 99999,
                scale: 4,
                motionX: 0.25,
                motionY: -1.5,
                accelerationY: -0.001,
                color,
                layerDepth: 1,
              }),
              createStageEffect(command.id, `ccCelebration:tail:${index}`, {
                textureName: 'LooseSprites\\Cursors',
                sourceX: 545,
                sourceY: 1413,
                sourceWidth: 11,
                sourceHeight: 34,
                baseX,
                baseY,
                space: 'screen',
                animationIntervalMs: 99999,
                animationLength: 1,
                loops: 99999,
                scale: 4,
                motionX: 0.25,
                motionY: -1.5,
                accelerationY: -0.001,
                layerDepth: 1,
              }),
            ]
          }).flat(),
          createStageEffect(command.id, 'ccCelebration:host', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 558,
            sourceY: 1425,
            sourceWidth: 20,
            sourceHeight: 26,
            baseX: 53 * 64,
            baseY: 21 * 64,
            space: 'world',
            animationIntervalMs: 400,
            animationLength: 3,
            loops: 99999,
            pingPong: true,
            scale: 4,
            layerDepth: 0.5,
          }),
        ],
      }
    case 'alexDiningDog':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'alexDiningDog', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 324,
            sourceY: 1936,
            sourceWidth: 12,
            sourceHeight: 20,
            baseX: 7 * 64 + 8,
            baseY: 2 * 64 - 32,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 4,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'skateboardFly':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'skateboardFly', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 388,
            sourceY: 1875,
            sourceWidth: 16,
            sourceHeight: 6,
            baseX: 26 * 64,
            baseY: 90 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 1,
            motionX: -8,
            motionY: -10,
            accelerationX: 0.02,
            accelerationY: 0.3,
            rotationChange: Math.PI / 24,
          }),
        ],
      }
    case 'sebastianRide':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sebastianRide', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 405,
            sourceY: 1843,
            sourceWidth: 14,
            sourceHeight: 9,
            baseX: 19 * 64,
            baseY: 8 * 64 + 28,
            space: 'world',
            animationIntervalMs: 40,
            animationLength: 4,
            loops: 999,
            scale: 4,
            motionX: -2,
            layerDepth: 0.1792,
          }),
        ],
      }
    case 'maruTelescope':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 9 }, (_, index) =>
          createStageEffect(command.id, `maruTelescope:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 256,
            sourceY: 1680,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: (2 + ((index * 11) % 26)) * 64,
            baseY: (2 + ((index * 7) % 18)) * 64,
            space: 'world',
            animationIntervalMs: 80,
            animationLength: 5,
            loops: 1,
            scale: 4,
            motionX: 4,
            motionY: 4,
            delayBeforeStartMs: 8000 + index * 750,
            layerDepth: 1,
          }),
        ),
      }
    case 'abbyGraveyard':
      return {
        mode: 'append' as const,
        effects: [
          createObjectSheetEffect(command.id, 'abbyGraveyard', 736, {
            baseX: 48 * 64,
            baseY: 86 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'abbyOuijaCandles':
      return {
        mode: 'append' as const,
        effects: [
          createObjectSheetEffect(command.id, 'abbyOuijaCandles:0', 737, {
            baseX: 5 * 64,
            baseY: 9 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
          createObjectSheetEffect(command.id, 'abbyOuijaCandles:1', 737, {
            baseX: 7 * 64,
            baseY: 8 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'gridballGameTV':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'gridballGameTV', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 368,
            sourceY: 336,
            sourceWidth: 19,
            sourceHeight: 14,
            baseX: 34 * 64 + 28,
            baseY: 3 * 64 + 52,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 7,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'secretGift':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'secretGift', {
            effectNumericId: 666,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 288,
            sourceY: 1231,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 30 * 64,
            baseY: 70 * 64 - 21,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'secretGiftOpen':
      return { effects: [], mode: 'update-secret-gift' as const, effectNumericId: 666 }
    case 'curtainOpen':
      return { effects: [], mode: 'update-curtain' as const, effectNumericId: 999, sourceRect: { x: 672, y: 1578, width: 59, height: 53 } }
    case 'curtainClose':
      return { effects: [], mode: 'update-curtain' as const, effectNumericId: 999, sourceRect: { x: 644, y: 1578, width: 59, height: 53 } }
    case 'linusLights':
      return {
        mode: 'append' as const,
        effects: [
          ...[
            { x: 55, y: 62, scale: 1.8, delay: 0 },
            { x: 60, y: 62, scale: 1.8, delay: 120 },
            { x: 57, y: 60, scale: 2.2, delay: 240 },
            { x: 57, y: 60, scale: 1.6, delay: 360 },
            { x: 47, y: 70, scale: 1.8, delay: 480 },
            { x: 52, y: 63, scale: 1.8, delay: 600 },
          ].map((entry, index) =>
            createStageEffect(command.id, `linusLights:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 497,
              sourceY: 1918,
              sourceWidth: 11,
              sourceHeight: 11,
              baseX: entry.x * 64,
              baseY: entry.y * 64,
              space: 'world',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 99999,
              scale: entry.scale,
              alpha: 0.7,
              pulse: true,
              pulseTimeMs: 900 + index * 120,
              pulseAmount: 1.18,
              color: '#ffd784',
              delayBeforeStartMs: entry.delay,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'LeoWillyFishing':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 20 }, (_, index) =>
          createAnimationRowEffect(command.id, `LeoWillyFishing:${index}`, 0, {
            baseX: 42.5 * 64 + ((index * 19) % 64),
            baseY: 38 * 64 + ((index * 37) % 64),
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 8,
            loops: 1,
            alpha: 0.7,
            delayBeforeStartMs: index * 150,
            layerDepth: (1280 + index) / 10000,
          }),
        ),
      }
    case 'LeoLinusCooking':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'LeoLinusCooking:food', {
            textureName: 'Maps\\springobjects',
            sourceX: 240,
            sourceY: 128,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 29 * 64,
            baseY: 8.5 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
          ...Array.from({ length: 10 }, (_, index) =>
            createStageEffect(command.id, `LeoLinusCooking:smoke:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 372,
              sourceY: 1956,
              sourceWidth: 10,
              sourceHeight: 10,
              baseX: 29.5 * 64,
              baseY: 8.6 * 64,
              space: 'world',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 1,
              scale: 3,
              alpha: 0.75,
              alphaFade: 0.01,
              motionX: ((index % 3) - 1) * 0.18,
              motionY: -0.9 - index * 0.04,
              scaleChange: 0.008,
              rotationChange: ((index % 2 === 0 ? -1 : 1) * Math.PI) / 256,
              delayBeforeStartMs: index * 500,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'coldstarMiracle':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'coldstarMiracle', {
            effectNumericId: 989,
            textureName: 'LooseSprites\\Movies',
            sourceX: 400,
            sourceY: 704,
            sourceWidth: 90,
            sourceHeight: 61,
            baseX: 4 * 64 + 12,
            baseY: 1 * 64 + 28,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            alpha: 0.01,
            alphaFade: -0.01,
            scale: 4,
            layerDepth: 0.8535,
          }),
        ],
      }
    case 'harveyKitchenSetup':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'harveyKitchenSetup:pan', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 379,
            sourceY: 251,
            sourceWidth: 31,
            sourceHeight: 13,
            baseX: 22 * 64 - 8,
            baseY: 22 * 64 + 24,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.15551999,
          }),
          createStageEffect(command.id, 'harveyKitchenSetup:bottle', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 391,
            sourceY: 235,
            sourceWidth: 5,
            sourceHeight: 13,
            baseX: 21 * 64 + 32,
            baseY: 22 * 64 + 16,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.15551999,
          }),
          createStageEffect(command.id, 'harveyKitchenSetup:board', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 399,
            sourceY: 229,
            sourceWidth: 11,
            sourceHeight: 21,
            baseX: 19 * 64 + 32,
            baseY: 22 * 64 - 20,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.15551999,
          }),
          createAnimationRowEffect(command.id, 'harveyKitchenSetup:flameA', 27, {
            baseX: 21 * 64,
            baseY: 22 * 64 - 20,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 10,
            loops: 999,
            layerDepth: 0.15616,
          }),
          createAnimationRowEffect(command.id, 'harveyKitchenSetup:flameB', 27, {
            baseX: 21 * 64 + 24,
            baseY: 22 * 64 - 20,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 10,
            loops: 999,
            flip: true,
            delayBeforeStartMs: 400,
            layerDepth: 0.15616,
          }),
        ],
      }
    case 'harveyDinnerSet':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'harveyDinnerSet', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 385,
            sourceY: 423,
            sourceWidth: 48,
            sourceHeight: 32,
            baseX: 5 * 64 - 32,
            baseY: 16 * 64 - 64,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: (16.2 * 64) / 10000,
          }),
        ],
      }
    case 'shaneCliffProps':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'shaneCliffProps', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 549,
            sourceY: 1891,
            sourceWidth: 19,
            sourceHeight: 12,
            baseX: 104 * 64,
            baseY: 96 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
        ],
      }
    case 'grandpaThumbsUp':
      return { effects: [], mode: 'update-grandpa-spirit' as const, effectNumericId: 77777 }
    case 'leahPaintingSetup':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'leahPaintingSetup:canvas', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 368,
            sourceY: 393,
            sourceWidth: 15,
            sourceHeight: 28,
            baseX: 72 * 64 + 12,
            baseY: 38 * 64 - 52,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1,
          }),
          createStageEffect(command.id, 'leahPaintingSetup:easel', {
            effectNumericId: 888,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 368,
            sourceY: 393,
            sourceWidth: 15,
            sourceHeight: 28,
            baseX: 74 * 64 + 12,
            baseY: 40 * 64 - 68,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1,
          }),
          createStageEffect(command.id, 'leahPaintingSetup:painting', {
            effectNumericId: 444,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 369,
            sourceY: 424,
            sourceWidth: 11,
            sourceHeight: 15,
            baseX: 75 * 64 - 8,
            baseY: 40 * 64 - 44,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
          createStageEffect(command.id, 'leahPaintingSetup:stand', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 96,
            sourceY: 1822,
            sourceWidth: 32,
            sourceHeight: 34,
            baseX: 79 * 64,
            baseY: 36 * 64,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1,
          }),
        ],
      }
    case 'leahHoldPainting':
      return {
        mode: 'update-leah-painting-hold' as const,
        effects: [
          createStageEffect(command.id, 'leahHoldPainting:item', {
            effectNumericId: 777,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 400,
            sourceY: 394,
            sourceWidth: 25,
            sourceHeight: 23,
            baseX: 73 * 64 - 8,
            baseY: 38 * 64 - 64,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'leahStopHoldingPainting':
      return { effects: [], mode: 'update-leah-painting-release' as const }
    case 'farmerHoldPainting':
      return {
        mode: 'update-farmer-hold-painting' as const,
        effects: [
          createStageEffect(command.id, 'farmerHoldPainting:item', {
            effectNumericId: 777,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 476,
            sourceY: 394,
            sourceWidth: 25,
            sourceHeight: 22,
            baseX: 75 * 64 - 16,
            baseY: 40 * 64 - 132,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'wedding':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'wedding:arch', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 540,
            sourceY: 1196,
            sourceWidth: 98,
            sourceHeight: 54,
            baseX: 25 * 64,
            baseY: 60 * 64 - 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
          createStageEffect(command.id, 'wedding:carpet', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 540,
            sourceY: 1250,
            sourceWidth: 98,
            sourceHeight: 25,
            baseX: 25 * 64,
            baseY: 60 * 64 + 152,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
          ...[
            { x: 24, y: 62, depth: 0.01 },
            { x: 32, y: 62, depth: 0.01 },
            { x: 24, y: 69, depth: 1 },
            { x: 32, y: 69, depth: 1 },
          ].map((entry, index) =>
            createStageEffect(command.id, `wedding:flower:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 527,
              sourceY: 1249,
              sourceWidth: 12,
              sourceHeight: 25,
              baseX: entry.x * 64,
              baseY: entry.y * 64,
              space: 'world',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 99999,
              scale: 4,
              layerDepth: entry.depth,
            }),
          ),
        ],
      }
    case 'dickBag':
    case 'dickGlitter':
      return {
        mode: 'append' as const,
        effects: [
          ...(spriteId === 'dickBag'
            ? [
                createStageEffect(command.id, 'dickBag', {
                  textureName: 'LooseSprites\\Cursors',
                  sourceX: 528,
                  sourceY: 1435,
                  sourceWidth: 16,
                  sourceHeight: 16,
                  baseX: 48 * 64,
                  baseY: 7 * 64,
                  space: 'world',
                  animationIntervalMs: 99999,
                  animationLength: 1,
                  loops: 99999,
                  scale: 4,
                  layerDepth: 1,
                }),
              ]
            : []),
          ...[
            { x: 47 * 64, y: 8 * 64, delay: 0 },
            { x: 47 * 64 + 32, y: 8 * 64, delay: 200 },
            { x: 47 * 64 + 32, y: 8 * 64 + 32, delay: 300 },
            { x: 47 * 64, y: 8 * 64 + 32, delay: 100 },
            { x: 47 * 64 + 16, y: 8 * 64 + 16, delay: 400 },
          ].map((entry, index) =>
            createStageEffect(command.id, `dickBag:glitter:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 432,
              sourceY: 1435,
              sourceWidth: 16,
              sourceHeight: 16,
              baseX: entry.x,
              baseY: entry.y,
              space: 'world',
              animationIntervalMs: 100,
              animationLength: 6,
              loops: 99999,
              scale: 2,
              delayBeforeStartMs: entry.delay,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'dropEgg':
      return {
        mode: 'append' as const,
        effects: [
          createObjectSheetEffect(command.id, 'dropEgg', 176, {
            baseX: 6 * 64,
            baseY: 4 * 64 + 32,
            space: 'world',
            animationIntervalMs: 800,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
            motionY: -7,
            accelerationY: 0.3,
            rotationChange: Math.PI / 24,
          }),
        ],
      }
    case 'sauceFire':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sauceFire:flame', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1985,
            sourceWidth: 12,
            sourceHeight: 11,
            baseX: 64 * 64 + 12,
            baseY: 16 * 64 - 16,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 4,
            loops: 5,
            scale: 4,
            layerDepth: 1,
          }),
          ...Array.from({ length: 8 }, (_, index) =>
            createStageEffect(command.id, `sauceFire:smoke:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 372,
              sourceY: 1956,
              sourceWidth: 10,
              sourceHeight: 10,
              baseX: 64 * 64 + (-16 + (index * 7) % 48),
              baseY: 16 * 64,
              space: 'world',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 1,
              scale: 3,
              alpha: 0.75,
              motionX: 1 + ((index % 5) - 2) * 0.12,
              motionY: -1 + ((index % 3) - 1) * 0.08,
              scaleChange: 0.01,
              rotationChange: ((index % 2 === 0 ? -1 : 1) * Math.PI) / 256,
              delayBeforeStartMs: index * 25,
              layerDepth: 0.0384 + index / 10000,
            }),
          ),
        ],
      }
    case 'maruElectrocution':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'maruElectrocution', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 432,
            sourceY: 1664,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 7 * 64 + 4,
            baseY: 5 * 64 + 8,
            space: 'world',
            animationIntervalMs: 40,
            animationLength: 1,
            loops: 20,
            scale: 4,
            layerDepth: 1,
            pulse: true,
            pulseTimeMs: 80,
            pulseAmount: 1.2,
          }),
        ],
      }
    case 'samTV':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'samTV', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 368,
            sourceY: 350,
            sourceWidth: 25,
            sourceHeight: 29,
            baseX: 52 * 64 + 16,
            baseY: 24 * 64 - 48,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.9,
          }),
        ],
      }
    case 'shaneThrowCan':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'shaneThrowCan', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 542,
            sourceY: 1893,
            sourceWidth: 4,
            sourceHeight: 6,
            baseX: 103 * 64,
            baseY: 95 * 64 + 16,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
            motionY: -4,
            accelerationY: 0.25,
            rotationChange: Math.PI / 128,
          }),
        ],
      }
    case 'sebastianFrog':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sebastianFrog', {
            effectNumericId: 777,
            textureName: 'TileSheets\\critters',
            sourceX: 0,
            sourceY: 224,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 45 * 64,
            baseY: 36 * 64,
            space: 'world',
            animationIntervalMs: 120,
            animationLength: 4,
            loops: 9999,
            scale: 4,
            layerDepth: 0.00064,
            motionX: 2,
          }),
        ],
      }
    case 'haleyCakeWalk':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'haleyCakeWalk', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 0,
            sourceY: 400,
            sourceWidth: 144,
            sourceHeight: 112,
            baseX: 26 * 64,
            baseY: 65 * 64,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.00064,
          }),
        ],
      }
    case 'shakeBushStop':
      return { effects: [], mode: 'update-shake' as const, effectNumericId: 777, shakeIntensity: 0 }
    case 'pennyFieldTrip':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'pennyFieldTrip', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 1813,
            sourceWidth: 86,
            sourceHeight: 54,
            baseX: 68 * 64,
            baseY: 44 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 0.0001,
          }),
        ],
      }
    case 'parrotPerchHut':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'parrotPerchHut', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\parrots',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 24,
            sourceHeight: 24,
            baseX: 7 * 64,
            baseY: 4 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'iceFishingCatch':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'iceFishingCatch:0', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 68 * 64,
            baseY: 30 * 64,
            space: 'world',
            animationIntervalMs: 500,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1984,
          }),
          createStageEffect(command.id, 'iceFishingCatch:1', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 74 * 64,
            baseY: 30 * 64,
            space: 'world',
            animationIntervalMs: 510,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.1984,
          }),
          createStageEffect(command.id, 'iceFishingCatch:2', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 67 * 64,
            baseY: 36 * 64,
            space: 'world',
            animationIntervalMs: 490,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.2368,
          }),
          createStageEffect(command.id, 'iceFishingCatch:3', {
            textureName: 'Maps\\Festivals',
            sourceX: 160,
            sourceY: 368,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 76 * 64,
            baseY: 35 * 64,
            space: 'world',
            animationIntervalMs: 500,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            layerDepth: 0.2304,
          }),
        ],
      }
    case 'WizardPromise':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 50 }, (_, index) =>
          createStageEffect(command.id, `WizardPromise:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: (16 + (index % 9)) * 64 + ((index * 11) % 36),
            baseY: (15 + Math.floor(index / 9)) * 64 + ((index * 17) % 36),
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 2 + (index % 3) * 0.5,
            motionY: -0.8 - (index % 4) * 0.08,
            alphaFade: 0.01,
            delayBeforeStartMs: index * 40,
            color: '#ffffff',
            layerDepth: 1,
          }),
        ),
      }
    case 'sauceGood':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 24 }, (_, index) =>
          createStageEffect(command.id, `sauceGood:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: (64 + (index % 3)) * 64 + ((index * 7) % 20),
            baseY: 16 * 64 + ((index * 13) % 20),
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 2.5,
            motionX: ((index % 5) - 2) * 0.15,
            motionY: -0.8 - (index % 3) * 0.1,
            alphaFade: 0.01,
            delayBeforeStartMs: index * 35,
            color: '#ffffff',
            layerDepth: 1,
          }),
        ),
      }
    case 'sebastianFrogHouse':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sebastianFrogHouse:terrarium', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 641,
            sourceY: 1534,
            sourceWidth: 48,
            sourceHeight: 37,
            baseX: 1 * 64,
            baseY: 6 * 64 - 20,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.1,
          }),
          createStageEffect(command.id, 'sebastianFrogHouse:frog', {
            effectNumericId: 777,
            textureName: 'TileSheets\\critters',
            sourceX: 0,
            sourceY: 224,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 1 * 64 + 100,
            baseY: 6 * 64 + 8,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            flip: true,
            layerDepth: 0.11,
          }),
        ],
      }
    case 'qiCave':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'qiCave:portal', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 415,
            sourceY: 216,
            sourceWidth: 96,
            sourceHeight: 89,
            baseX: 2 * 64 + 448,
            baseY: 2 * 64 + 100,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0000001,
          }),
          createStageEffect(command.id, 'qiCave:floor', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 370,
            sourceY: 272,
            sourceWidth: 107,
            sourceHeight: 64,
            baseX: 2 * 64 + 268,
            baseY: 2 * 64 + 324,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.00000011,
          }),
          createObjectSheetEffect(command.id, 'qiCave:item', 803, {
            effectNumericId: 803,
            baseX: 13 * 64 + 4,
            baseY: 7 * 64 + 36,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0000021,
          }),
          ...[
            { x: 8, y: 6, interval: 100, depth: 0.0000022 },
            { x: 5, y: 7, interval: 90, depth: 0.0000023 },
            { x: 7, y: 10, interval: 120, depth: 1 },
            { x: 15, y: 7, interval: 80, depth: 0.0000024 },
            { x: 12, y: 11, interval: 100, depth: 0.0000025 },
            { x: 16, y: 10, interval: 105, depth: 0.0000026 },
            { x: 3, y: 9, interval: 85, depth: 0.0000027 },
          ].map((entry, index) =>
            createStageEffect(command.id, `qiCave:pillar:${index}`, {
              effectNumericId: 11,
              textureName: 'LooseSprites\\temporary_sprites_1',
              sourceX: 432,
              sourceY: 171,
              sourceWidth: 16,
              sourceHeight: 30,
              baseX: entry.x * 64,
              baseY: entry.y * 64,
              space: 'world',
              animationIntervalMs: entry.interval,
              animationLength: 5,
              loops: 99999,
              pingPong: true,
              scale: 4,
              layerDepth: entry.depth,
            }),
          ),
        ],
      }
    case 'robot':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'robot:core', {
            textureName: 'Characters\\robot',
            sourceX: 35,
            sourceY: 42,
            sourceWidth: 35,
            sourceHeight: 42,
            baseX: 13 * 64,
            baseY: 27 * 64 - 32,
            space: 'world',
            animationIntervalMs: 50,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            layerDepth: 0.98,
            accelerationY: -0.01,
          }),
          ...Array.from({ length: 64 }, (_, index) =>
            createStageEffect(command.id, `robot:spark:${index}`, {
              textureName: 'TileSheets\\animations',
              sourceX: (index % 4) * 64,
              sourceY: 320,
              sourceWidth: 64,
              sourceHeight: 64,
              baseX: 13 * 64 + ((index * 17) % 96),
              baseY: 136,
              space: 'screen',
              animationIntervalMs: 9999,
              animationLength: 1,
              loops: 1,
              scale: 1,
              alpha: 0.75,
              motionX: ((index % 9) - 4) / (index + 20),
              motionY: 0.25 + index / 100,
              delayBeforeStartMs: index * 10,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'maruTrapdoor':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'maruTrapdoor:open', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 640,
            sourceY: 1632,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 1 * 64,
            baseY: 5 * 64,
            space: 'world',
            animationIntervalMs: 150,
            animationLength: 4,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
          createStageEffect(command.id, 'maruTrapdoor:shadow', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 688,
            sourceY: 1632,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 1 * 64,
            baseY: 5 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            delayBeforeStartMs: 500,
            layerDepth: 0.99,
          }),
        ],
      }
    case 'shaneCliffs':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'shaneCliffs:body', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 533,
            sourceY: 1864,
            sourceWidth: 19,
            sourceHeight: 27,
            baseX: 83 * 64,
            baseY: 98 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
          createStageEffect(command.id, 'shaneCliffs:shadow', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 552,
            sourceY: 1862,
            sourceWidth: 31,
            sourceHeight: 21,
            baseX: 83 * 64 - 16,
            baseY: 98 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.0001,
          }),
          createStageEffect(command.id, 'shaneCliffs:propA', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 549,
            sourceY: 1891,
            sourceWidth: 19,
            sourceHeight: 12,
            baseX: 84 * 64,
            baseY: 99 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
          createStageEffect(command.id, 'shaneCliffs:propB', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 549,
            sourceY: 1891,
            sourceWidth: 19,
            sourceHeight: 12,
            baseX: 82 * 64,
            baseY: 98 * 64,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 0.01,
          }),
          createStageEffect(command.id, 'shaneCliffs:can', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 542,
            sourceY: 1893,
            sourceWidth: 4,
            sourceHeight: 6,
            baseX: 83 * 64 - 32,
            baseY: 99 * 64 + 16,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'candleBoat':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'candleBoat', {
            effectNumericId: 1,
            textureName: 'Maps\\Festivals',
            sourceX: 240,
            sourceY: 112,
            sourceWidth: 16,
            sourceHeight: 32,
            baseX: 22 * 64,
            baseY: 36 * 64,
            space: 'world',
            animationIntervalMs: 1000,
            animationLength: 2,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
          }),
        ],
      }
    case 'candleBoatMove':
      return { effects: [], mode: 'update-candle-boat' as const, effectNumericId: 1 }
    case 'abbyvideoscreen':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'abbyvideoscreen', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 167,
            sourceY: 1714,
            sourceWidth: 19,
            sourceHeight: 14,
            baseX: 2 * 64 + 28,
            baseY: 3 * 64 + 48,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 3,
            loops: 9999,
            scale: 4,
            layerDepth: 0.0002,
          }),
        ],
      }
    case 'islandFishSplash':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'islandFishSplash', {
            effectNumericId: 9999,
            textureName: 'Maps\\springobjects',
            sourceX: 336,
            sourceY: 544,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 81 * 64,
            baseY: 92 * 64,
            space: 'world',
            animationIntervalMs: 100000,
            animationLength: 1,
            loops: 1,
            flip: true,
            scale: 4,
            layerDepth: 0.99,
            motionX: -2,
            motionY: -8,
            accelerationY: 0.2,
            rotationChange: -0.02,
          }),
        ],
      }
    case 'sebastianGarage':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sebastianGarage', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1843,
            sourceWidth: 48,
            sourceHeight: 42,
            baseX: 17 * 64,
            baseY: 23 * 64 + 8,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 0.1472,
          }),
        ],
      }
    case 'sunroom':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'sunroom', {
            effectNumericId: 996,
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 304,
            sourceY: 486,
            sourceWidth: 24,
            sourceHeight: 26,
            baseX: 4 * 64 + 32,
            baseY: 8 * 64 - 32,
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 997,
            scale: 4,
            layerDepth: 0.0512,
          }),
        ],
      }
    case 'shakeBush':
      return { effects: [], mode: 'update-shake' as const, effectNumericId: 777, shakeIntensity: 1 }
    case 'parrotHutSquawk':
      return { effects: [], mode: 'update-parrot-perch-squawk' as const, effectNumericId: 999 }
    case 'frogJump':
      return { effects: [], mode: 'update-frog-jump' as const, effectNumericId: 777 }
    case 'raccoonCircle':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'raccoonCircle:raccoon', {
            effectNumericId: 9786,
            textureName: 'Characters\\raccoon',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 32,
            sourceHeight: 32,
            baseX: 54.5 * 64,
            baseY: 7 * 64,
            space: 'world',
            animationIntervalMs: 148,
            animationLength: 8,
            loops: 999,
            scale: 4,
            layerDepth: 0.051840004,
          }),
          createStageEffect(command.id, 'raccoonCircle:mrs', {
            effectNumericId: 9785,
            textureName: 'Characters\\mrs_raccoon',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 32,
            sourceHeight: 32,
            baseX: 56.5 * 64,
            baseY: 7 * 64,
            space: 'world',
            animationIntervalMs: 148,
            animationLength: 8,
            loops: 999,
            scale: 4,
            layerDepth: 0.0512,
          }),
          createStageEffect(command.id, 'raccoonCircle:cutout', {
            effectNumericId: 997799,
            textureName: 'LooseSprites\\raccoon_circle_cutout',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 263,
            sourceHeight: 263,
            baseX: 2750,
            baseY: 0,
            space: 'screen',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
            alpha: 0.88,
          }),
        ],
      }
    case 'raccoondance1':
      return { effects: [], mode: 'update-raccoon-dance' as const, effectNumericId: 9786 }
    case 'raccoondance2':
      return { effects: [], mode: 'update-raccoon-dance' as const, effectNumericId: 9785 }
    case 'raccoonCircle2':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'raccoonCircle2', {
            effectNumericId: 997797,
            textureName: 'LooseSprites\\raccoon_circle_cutout',
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 263,
            sourceHeight: 263,
            baseX: 3080,
            baseY: 0,
            space: 'screen',
            animationIntervalMs: 297,
            animationLength: 3,
            loops: 99999,
            scale: 4,
            alpha: 0.01,
            alphaFade: -0.003,
            layerDepth: 0.8,
          }),
        ],
      }
    case 'raccoonbutterflies':
      return {
        mode: 'append' as const,
        effects: [
          ...[
            { x: 52.5 * 64 - 131.5 * 4, y: 60 * 4, sx: 128, sy: 336, px: 32, py: 8, loopX: 2800, loopY: 3800 },
            { x: 56.5 * 64 - 131.5 * 4, y: 0, sx: 192, sy: 336, px: 32, py: 4, loopX: 2600, loopY: 2900 },
            { x: 53.5 * 64 + 263 * 4, y: 24 * 4, sx: 128, sy: 288, px: 32, py: 6, loopX: 3000, loopY: 3100 },
            { x: 52.5 * 64 + 131.5 * 4, y: 220 * 4, sx: 192, sy: 288, px: 32, py: 12, loopX: 2400, loopY: 2800 },
            { x: 52.5 * 64 + 186.5 * 4, y: 150 * 4, sx: 64, sy: 288, px: 32, py: 4, loopX: 3400, loopY: 3200 },
            { x: 52.5 * 64 + 211.5 * 4, y: 180 * 4, sx: 128, sy: 96, px: 32, py: 4, loopX: 3500, loopY: 2700 },
            { x: 52.5 * 64 - 126.5 * 4, y: -120 * 4, sx: 192, sy: 112, px: 16, py: 4, loopX: 2500, loopY: 3300 },
            { x: 49.5 * 64 - 126.5 * 4, y: -100 * 4, sx: 128, sy: 288, px: 16, py: 4, loopX: 2200, loopY: 3400 },
          ].map((entry, index) =>
            createStageEffect(command.id, `raccoonbutterflies:${index}`, {
              effectNumericId: 997799,
              textureName: 'TileSheets\\critters',
              sourceX: entry.sx,
              sourceY: entry.sy,
              sourceWidth: 16,
              sourceHeight: 16,
              baseX: entry.x,
              baseY: entry.y,
              space: 'screen',
              animationIntervalMs: 148,
              animationLength: 4,
              loops: 99999,
              pingPong: true,
              scale: 4,
              xPeriodic: true,
              xPeriodicLoopTimeMs: entry.loopX,
              xPeriodicRange: entry.px,
              yPeriodic: true,
              yPeriodicLoopTimeMs: entry.loopY,
              yPeriodicRange: entry.py,
              alpha: 0.01,
              alphaFade: -0.01,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'raccoonSong':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'raccoonSong:noteA', {
            textureName: 'LooseSprites\\Cursors_1_6',
            sourceX: 279,
            sourceY: 55,
            sourceWidth: 12,
            sourceHeight: 15,
            baseX: 3706 - 26,
            baseY: 340 - 48,
            space: 'screen',
            animationIntervalMs: 297,
            animationLength: 8,
            loops: 999,
            scale: 4,
            layerDepth: 0.044809997,
          }),
          createStageEffect(command.id, 'raccoonSong:noteB', {
            textureName: 'LooseSprites\\Cursors_1_6',
            sourceX: 374,
            sourceY: 55,
            sourceWidth: 12,
            sourceHeight: 15,
            baseX: 54 * 64,
            baseY: 4 * 64 - 16,
            space: 'world',
            animationIntervalMs: 297,
            animationLength: 8,
            loops: 999,
            flip: true,
            scale: 4,
            delayBeforeStartMs: 297,
            layerDepth: 0.044809997,
          }),
          ...Array.from({ length: 8 }, (_, index) => [
            createStageEffect(command.id, `raccoonSong:petal:${index}`, {
              textureName: 'LooseSprites\\Cursors_1_6',
              sourceX: 304,
              sourceY: 397,
              sourceWidth: 11,
              sourceHeight: 11,
              baseX: 3706 + 56,
              baseY: 340 - 48,
              space: 'screen',
              animationIntervalMs: 49,
              animationLength: 12,
              loops: 1,
              scale: 4,
              motionX: 1,
              accelerationY: 0.001,
              rotationChange: ((index % 5) - 2) / 100,
              color: '#ffc8c8',
              delayBeforeStartMs: 2376 * index,
              layerDepth: 0.05057,
            }),
            createStageEffect(command.id, `raccoonSong:flash:${index}`, {
              textureName: 'LooseSprites\\Cursors_1_6',
              sourceX: 455,
              sourceY: 414,
              sourceWidth: 14,
              sourceHeight: 17,
              baseX: 3706 + 28,
              baseY: 340 - 48,
              space: 'screen',
              animationIntervalMs: 2376,
              animationLength: 1,
              loops: 999,
              scale: 4,
              alphaFade: 0.02,
              delayBeforeStartMs: 2376 * index,
              layerDepth: 0.051209997,
            }),
          ]).flat(),
        ],
      }
    case 'georgeLeekGift':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'georgeLeekGift', {
            effectNumericId: 999,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 288,
            sourceY: 1231,
            sourceWidth: 16,
            sourceHeight: 16,
            baseX: 17 * 64,
            baseY: 19 * 64,
            space: 'world',
            animationIntervalMs: 100,
            animationLength: 6,
            loops: 1,
            holdLastFrame: true,
            scale: 4,
            layerDepth: 0.01,
          }),
        ],
      }
    case 'trashBearMagic':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 32 }, (_, index) =>
          createStageEffect(command.id, `trashBearMagic:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: (95 + (index % 6)) * 64 + ((index * 17) % 48),
            baseY: (103 + Math.floor(index / 6)) * 64 + ((index * 11) % 32),
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 2.5,
            motionX: ((index % 5) - 2) * 0.18,
            motionY: -1 - (index % 4) * 0.08,
            alphaFade: 0.008,
            color: '#7cff6a',
            delayBeforeStartMs: index * 40,
            layerDepth: 1,
          }),
        ),
      }
    case 'trashBearPrelude':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 40 }, (_, index) =>
          createStageEffect(command.id, `trashBearPrelude:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 497,
            sourceY: 1918,
            sourceWidth: 11,
            sourceHeight: 11,
            baseX: (95 + (index % 5)) * 64 + ((index * 13) % 44),
            baseY: (106 + Math.floor(index / 5)) * 64 + ((index * 19) % 24),
            space: 'world',
            animationIntervalMs: 99999,
            animationLength: 1,
            loops: 1,
            scale: 2.3,
            motionX: ((index % 7) - 3) * 0.16,
            motionY: -0.9 - (index % 3) * 0.06,
            alphaFade: 0.006,
            color: '#7cff6a',
            delayBeforeStartMs: index * 30,
            layerDepth: 1,
          }),
        ),
      }
    case 'trashBearUmbrella1':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'trashBearUmbrella1', {
            effectNumericId: 777,
            textureName: 'LooseSprites\\Cursors2',
            sourceX: 0,
            sourceY: 80,
            sourceWidth: 46,
            sourceHeight: 56,
            baseX: 102 * 64,
            baseY: 94.5 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            layerDepth: 1,
            motionY: -9,
            accelerationY: 0.4,
          }),
        ],
      }
    case 'movieTheater_setup':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'movieTheater_setup', {
            effectNumericId: 999,
            textureName: 'Maps\\MovieTheaterScreen_TileSheet',
            sourceX: 224,
            sourceY: 0,
            sourceWidth: 96,
            sourceHeight: 112,
            baseX: 4 * 64,
            baseY: 4 * 64,
            space: 'world',
            animationIntervalMs: 5000,
            animationLength: 1,
            loops: 9999,
            scale: 4,
            delayBeforeStartMs: 7950,
            layerDepth: 1,
          }),
        ],
      }
    case 'wizardSewerMagic':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'wizardSewerMagic:0', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1985,
            sourceWidth: 12,
            sourceHeight: 11,
            baseX: 15 * 64 + 8,
            baseY: 13 * 64,
            space: 'world',
            animationIntervalMs: 50,
            animationLength: 4,
            loops: 20,
            scale: 4,
            alphaFade: 0.005,
            layerDepth: 1,
          }),
          createStageEffect(command.id, 'wizardSewerMagic:1', {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 276,
            sourceY: 1985,
            sourceWidth: 12,
            sourceHeight: 11,
            baseX: 17 * 64 + 8,
            baseY: 13 * 64,
            space: 'world',
            animationIntervalMs: 50,
            animationLength: 4,
            loops: 20,
            scale: 4,
            alphaFade: 0.005,
            layerDepth: 1,
          }),
        ],
      }
    case 'woodswalker':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'woodswalker', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 448,
            sourceY: 419,
            sourceWidth: 16,
            sourceHeight: 21,
            baseX: 4 * 64 + 20,
            baseY: 1 * 64 + 88,
            space: 'world',
            animationIntervalMs: 150,
            animationLength: 4,
            loops: 7,
            scale: 4,
            shakeIntensity: 1,
            motionX: 1,
            layerDepth: 1,
          }),
        ],
      }
    case 'evilRabbit':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'evilRabbit', {
            effectNumericId: 778,
            textureName: 'TileSheets\\critters',
            sourceX: 264,
            sourceY: 209,
            sourceWidth: 19,
            sourceHeight: 16,
            baseX: 4 * 64 + 152,
            baseY: 1 * 64 + 92,
            space: 'world',
            animationIntervalMs: 999,
            animationLength: 1,
            loops: 999,
            flip: true,
            scale: 4,
            motionX: -2,
            motionY: -2,
            accelerationY: 0.1,
            layerDepth: 1,
          }),
        ],
      }
    case 'junimoShow':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'junimoShow:0', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 393,
            sourceY: 350,
            sourceWidth: 19,
            sourceHeight: 14,
            baseX: 52 * 64 + 28,
            baseY: 24 * 64 - 8,
            space: 'world',
            animationIntervalMs: 90,
            animationLength: 6,
            loops: 86,
            scale: 4,
            layerDepth: 0.95,
          }),
          createStageEffect(command.id, 'junimoShow:1', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 393,
            sourceY: 364,
            sourceWidth: 19,
            sourceHeight: 14,
            baseX: 52 * 64 + 28,
            baseY: 24 * 64 - 8,
            space: 'world',
            animationIntervalMs: 90,
            animationLength: 4,
            loops: 31,
            scale: 4,
            delayBeforeStartMs: 11034,
            layerDepth: 0.97,
          }),
          createStageEffect(command.id, 'junimoShow:2', {
            textureName: 'LooseSprites\\temporary_sprites_1',
            sourceX: 393,
            sourceY: 378,
            sourceWidth: 19,
            sourceHeight: 14,
            baseX: 52 * 64 + 28,
            baseY: 24 * 64 - 8,
            space: 'world',
            animationIntervalMs: 90,
            animationLength: 6,
            loops: 21,
            scale: 4,
            delayBeforeStartMs: 22069,
            layerDepth: 1,
          }),
        ],
      }
    case 'linusMoney':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 8 }, (_, index) =>
          createStageEffect(command.id, `linusMoney:${index}`, {
            textureName: 'LooseSprites\\Cursors',
            sourceX: 397,
            sourceY: 1941,
            sourceWidth: 19,
            sourceHeight: 20,
            baseX: 520 + (index % 4) * 36,
            baseY: 260 + Math.floor(index / 4) * 40,
            space: 'screen',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            motionY: -1.6 - index * 0.08,
            motionX: ((index % 3) - 1) * 0.4,
            alphaFade: 0.01,
            delayBeforeStartMs: 10 + index * 90,
            layerDepth: 1,
          }),
        ),
      }
    case 'joshDinner':
      return {
        mode: 'append' as const,
        effects: [
          createAnimationRowEffect(command.id, 'joshDinner:0', 649, {
            baseX: 6 * 64 + 8,
            baseY: 4 * 64 + 32,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 9999,
            layerDepth: 0.0256,
          }),
          createAnimationRowEffect(command.id, 'joshDinner:1', 664, {
            baseX: 8 * 64 - 8,
            baseY: 4 * 64 + 32,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 9999,
            layerDepth: 0.0256,
          }),
        ],
      }
    case 'maruBeaker':
      return {
        mode: 'append' as const,
        effects: [
          createAnimationRowEffect(command.id, 'maruBeaker', 738, {
            baseX: 9 * 64,
            baseY: 14 * 64 + 32,
            space: 'world',
            animationIntervalMs: 1380,
            animationLength: 1,
            loops: 1,
            scale: 1,
            rotationChange: Math.PI / 24,
            motionY: -7,
            accelerationY: 0.2,
            layerDepth: 1,
          }),
        ],
      }
    case 'abbyAtLake':
      return {
        mode: 'append' as const,
        effects: [
          createObjectSheetEffect(command.id, 'abbyAtLake:anchor', 735, {
            baseX: 48 * 64,
            baseY: 30 * 64,
            space: 'world',
            animationIntervalMs: 999999,
            animationLength: 1,
            loops: 1,
            scale: 4,
            layerDepth: 1,
          }),
          ...[
            { x: 48 * 64 + 32, y: 30 * 64, px: 32, py: 21, lx: 2000, ly: 1600, color: null },
            { x: 48 * 64 + 32, y: 30 * 64, px: 16, py: 21, lx: 1000, ly: 1600, color: null },
            { x: 48 * 64 + 32, y: 30 * 64, px: 21, py: 32, lx: 2400, ly: 2800, color: null },
            { x: 48 * 64 + 32, y: 30 * 64, px: 16, py: 16, lx: 2000, ly: 2400, color: null },
            { x: 66 * 64 - 32, y: 34 * 64, px: 21, py: 48, lx: 2000, ly: 2600, color: '#ffa64d' },
            { x: 66 * 64 + 32, y: 34 * 64, px: 32, py: 21, lx: 2000, ly: 2600, color: '#ffa64d' },
            { x: 66 * 64 + 32, y: 34 * 64 + 32, px: 42, py: 32, lx: 4000, ly: 5000, color: '#ffa64d' },
            { x: 66 * 64, y: 34 * 64 - 32, px: 32, py: 32, lx: 4000, ly: 5500, color: '#ffa64d' },
            { x: 69 * 64 - 32, y: 28 * 64, px: 32, py: 21, lx: 2400, ly: 3600, color: '#ffa64d' },
            { x: 69 * 64 + 32, y: 28 * 64, px: 42, py: 51, lx: 2500, ly: 3600, color: '#ffa64d' },
            { x: 69 * 64 + 32, y: 28 * 64 + 32, px: 21, py: 32, lx: 4500, ly: 3000, color: '#ffa64d' },
            { x: 69 * 64, y: 28 * 64 - 32, px: 64, py: 48, lx: 5000, ly: 4500, color: '#ffa64d' },
            { x: 72 * 64 - 32, y: 33 * 64, px: 32, py: 21, lx: 2000, ly: 3000, color: '#ffa64d' },
            { x: 72 * 64 + 32, y: 33 * 64, px: 21, py: 32, lx: 2900, ly: 3200, color: '#ffa64d' },
            { x: 72 * 64 + 32, y: 33 * 64 + 32, px: 16, py: 32, lx: 4200, ly: 3300, color: '#ffa64d' },
            { x: 72 * 64, y: 33 * 64 - 32, px: 32, py: 16, lx: 5100, ly: 4000, color: '#ffa64d' },
          ].map((entry, index) =>
            createStageEffect(command.id, `abbyAtLake:orb:${index}`, {
              textureName: 'TileSheets\\animations',
              sourceX: 232,
              sourceY: 328,
              sourceWidth: 4,
              sourceHeight: 4,
              baseX: entry.x,
              baseY: entry.y,
              space: 'world',
              animationIntervalMs: 9999999,
              animationLength: 1,
              loops: 1,
              scale: 1,
              xPeriodic: true,
              yPeriodic: true,
              xPeriodicLoopTimeMs: entry.lx,
              yPeriodicLoopTimeMs: entry.ly,
              xPeriodicRange: entry.px,
              yPeriodicRange: entry.py,
              color: entry.color,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'jojaCeremony':
      return {
        mode: 'append' as const,
        effects: Array.from({ length: 16 }, (_, index) => {
          const baseX = 30 + ((index * 143) % (EFFECT_VIEWPORT_BASE_WIDTH - 160))
          const baseY = EFFECT_VIEWPORT_BASE_HEIGHT + index * 64
          return [
            createStageEffect(command.id, `jojaCeremony:streamer:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 534,
              sourceY: 1413,
              sourceWidth: 11,
              sourceHeight: 16,
              baseX,
              baseY,
              space: 'screen',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 99999,
              scale: 4,
              motionX: 0.25,
              motionY: -1.5,
              accelerationY: -0.001,
              color: '#00bfff',
              layerDepth: 1,
            }),
            createStageEffect(command.id, `jojaCeremony:tail:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 545,
              sourceY: 1413,
              sourceWidth: 11,
              sourceHeight: 34,
              baseX,
              baseY,
              space: 'screen',
              animationIntervalMs: 99999,
              animationLength: 1,
              loops: 99999,
              scale: 4,
              motionX: 0.25,
              motionY: -1.5,
              accelerationY: -0.001,
              layerDepth: 1,
            }),
          ]
        }).flat(),
      }
    case 'balloonBirds':
      return {
        mode: 'append' as const,
        effects: [
          ...[
            { x: 48, y: 12, delay: 1500, motionX: -3, scale: 4 },
            { x: 47, y: 13, delay: 1250, motionX: -3, scale: 4 },
            { x: 46, y: 14, delay: 1100, motionX: -3, scale: 4 },
            { x: 45, y: 15, delay: 1000, motionX: -3, scale: 4 },
            { x: 46, y: 16, delay: 1080, motionX: -3, scale: 4 },
            { x: 47, y: 17, delay: 1300, motionX: -3, scale: 4 },
            { x: 48, y: 18, delay: 1450, motionX: -3, scale: 4 },
            { x: 46, y: 15, delay: 5450, motionX: -4, scale: 4 },
            { x: 48, y: 10, delay: 500, motionX: -2, scale: 2 },
            { x: 47, y: 11, delay: 250, motionX: -2, scale: 2 },
            { x: 46, y: 12, delay: 100, motionX: -2, scale: 2 },
            { x: 45, y: 13, delay: 0, motionX: -2, scale: 2 },
            { x: 46, y: 14, delay: 80, motionX: -2, scale: 2 },
            { x: 47, y: 15, delay: 300, motionX: -2, scale: 2 },
            { x: 48, y: 16, delay: 450, motionX: -2, scale: 2 },
          ].map((entry, index) =>
            createStageEffect(command.id, `balloonBirds:${index}`, {
              textureName: 'LooseSprites\\Cursors',
              sourceX: 388,
              sourceY: 1894,
              sourceWidth: 24,
              sourceHeight: 22,
              baseX: entry.x * 64,
              baseY: entry.y * 64,
              space: 'world',
              animationIntervalMs: 100,
              animationLength: 6,
              loops: 9999,
              scale: entry.scale,
              motionX: entry.motionX,
              delayBeforeStartMs: entry.delay,
              layerDepth: 1,
            }),
          ),
        ],
      }
    case 'marcelloLand':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'marcelloLand:balloon', {
            effectNumericId: 1,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 0,
            sourceY: 1183,
            sourceWidth: 84,
            sourceHeight: 160,
            baseX: 25 * 64 - 92,
            baseY: 19 * 64,
            space: 'world',
            animationIntervalMs: 10000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            motionY: 2,
            layerDepth: 0.00002,
          }),
          createStageEffect(command.id, 'marcelloLand:basket', {
            effectNumericId: 2,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 84,
            sourceY: 1205,
            sourceWidth: 38,
            sourceHeight: 26,
            baseX: 25 * 64,
            baseY: 19 * 64 + 536,
            space: 'world',
            animationIntervalMs: 10000,
            animationLength: 1,
            loops: 99999,
            scale: 4,
            motionY: 2,
            layerDepth: 0.2625,
          }),
          createStageEffect(command.id, 'marcelloLand:shine', {
            effectNumericId: 3,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 24,
            sourceY: 1343,
            sourceWidth: 36,
            sourceHeight: 19,
            baseX: 25 * 64,
            baseY: 40 * 64,
            space: 'world',
            animationIntervalMs: 7000,
            animationLength: 1,
            loops: 99999,
            scale: 0.1,
            scaleChange: 0.01,
            layerDepth: 0.00001,
          }),
        ],
      }
    case 'movieBush':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'movieBush', {
            effectNumericId: 777,
            textureName: 'TileSheets\\bushes',
            sourceX: 65,
            sourceY: 58,
            sourceWidth: 30,
            sourceHeight: 35,
            baseX: 4 * 64 + 132,
            baseY: 1 * 64 + 52,
            space: 'world',
            animationIntervalMs: 999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            layerDepth: 0.99,
          }),
        ],
      }
    case 'samSkate1':
      return {
        mode: 'append' as const,
        effects: [
          createStageEffect(command.id, 'samSkate1', {
            effectNumericId: 92473,
            textureName: 'LooseSprites\\Cursors',
            sourceX: 388,
            sourceY: 1875,
            sourceWidth: 16,
            sourceHeight: 6,
            baseX: 12 * 64,
            baseY: 90 * 64,
            space: 'world',
            animationIntervalMs: 9999,
            animationLength: 1,
            loops: 999,
            scale: 4,
            motionX: 4,
            accelerationX: -0.008,
            layerDepth: 0.00001,
          }),
        ],
      }
    case 'moonlightJellies':
      return {
        mode: 'append' as const,
        effects: [
          ...Array.from({ length: 40 }, (_, index) =>
            createStageEffect(command.id, `moonlightJellies:${index}`, {
              textureName: 'Maps\\Festivals',
              sourceX: 256,
              sourceY: 16,
              sourceWidth: 16,
              sourceHeight: 16,
              baseX: (46 + (index % 12)) * 64,
              baseY: 49 * 64,
              space: 'world',
              animationIntervalMs: 250,
              animationLength: 3,
              loops: 9999,
              pingPong: true,
              scale: 4,
              motionY: -1,
              xPeriodic: true,
              xPeriodicLoopTimeMs: 3000,
              xPeriodicRange: 16,
              delayBeforeStartMs: 14000 + index * 900,
              layerDepth: 0.1,
            }),
          ),
        ],
      }
    case 'junimoCageGone':
    case 'junimoCageGone2':
      return { effects: [], mode: 'update-remove-all-id-1' as const, effectNumericId: 1 }
    default:
      return { effects: [], mode: 'append' as const }
  }
}
