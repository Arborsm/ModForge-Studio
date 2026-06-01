import type { EventCommand } from '@entities/event'
import {
  createStageEffect,
  EFFECT_VIEWPORT_BASE_HEIGHT,
  EFFECT_VIEWPORT_BASE_WIDTH,
  type SpecificTemporarySpriteResolution,
} from '@entities/event'

const UNRESOLVED: SpecificTemporarySpriteResolution | null = null

export function resolveSpecificTemporarySpriteEffectCase1(
  command: EventCommand,
  spriteId: string,
): SpecificTemporarySpriteResolution | null {
  switch (spriteId) {
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
      return {
        effects: [],
        mode: 'update-replace-source' as const,
        effectNumericId: 777,
        sourceRect: { x: 144, y: 327, width: 112, height: 112 },
      }
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
    default:
      return UNRESOLVED
  }
}
