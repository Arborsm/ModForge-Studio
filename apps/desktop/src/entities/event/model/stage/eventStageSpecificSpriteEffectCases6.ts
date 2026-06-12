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

export function resolveSpecificTemporarySpriteEffectCase6(
  command: EventCommand,
  spriteId: string,
): SpecificTemporarySpriteResolution | null {
  switch (spriteId) {
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
        effects: Array.from({ length: 40 }, (_, index) =>
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
      }
    case 'junimoCageGone':
    case 'junimoCageGone2':
      return { effects: [], mode: 'update-remove-all-id-1' as const, effectNumericId: 1 }
    default:
      return UNRESOLVED
  }
}
