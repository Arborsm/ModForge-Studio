import type { EventCommand } from '@entities/event'
import { createStageEffect, EFFECT_VIEWPORT_BASE_WIDTH, parsePoint, type SpecificTemporarySpriteResolution } from '@entities/event'

const UNRESOLVED: SpecificTemporarySpriteResolution | null = null

export function resolveSpecificTemporarySpriteEffectCase2(
  command: EventCommand,
  spriteId: string,
): SpecificTemporarySpriteResolution | null {
  switch (spriteId) {
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
      return {
        effects: [],
        mode: 'update-replace-source' as const,
        effectNumericId: 777,
        sourceRect: { x: 48, y: 0, width: 24, height: 24 },
      }
    case 'BoatParrotSquawkStop':
      return {
        effects: [],
        mode: 'update-replace-source' as const,
        effectNumericId: 777,
        sourceRect: { x: 0, y: 0, width: 24, height: 24 },
      }
    default:
      return UNRESOLVED
  }
}
