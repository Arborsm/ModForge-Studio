import type { EventCommand } from '@entities/event'
import {
  createAnimationRowEffect,
  createObjectSheetEffect,
  createStageEffect,
  EFFECT_VIEWPORT_BASE_HEIGHT,
  EFFECT_VIEWPORT_BASE_WIDTH,
  type SpecificTemporarySpriteResolution,
} from '@entities/event'

const UNRESOLVED: SpecificTemporarySpriteResolution | null = null

export function resolveSpecificTemporarySpriteEffectCase3(
  command: EventCommand,
  spriteId: string,
): SpecificTemporarySpriteResolution | null {
  switch (spriteId) {
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
    default:
      return UNRESOLVED
  }
}
