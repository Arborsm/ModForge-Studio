import type { EventCommand } from '@entities/event'
import { createObjectSheetEffect, createStageEffect, type SpecificTemporarySpriteResolution } from '@entities/event'

const UNRESOLVED: SpecificTemporarySpriteResolution | null = null

export function resolveSpecificTemporarySpriteEffectCase4(
  command: EventCommand,
  spriteId: string,
): SpecificTemporarySpriteResolution | null {
  switch (spriteId) {
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
              baseX: 64 * 64 + (-16 + ((index * 7) % 48)),
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
    default:
      return UNRESOLVED
  }
}
