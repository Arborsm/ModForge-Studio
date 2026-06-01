import type { EventCommand } from '@entities/event'
import { createStageEffect, parseNumber, parsePoint, type SpecificTemporarySpriteResolution, type StageEffectState } from '@entities/event'
import { resolveSpecificTemporarySpriteEffectCase } from './eventStageSpecificSpriteEffectCases'

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
    default:
      return resolveSpecificTemporarySpriteEffectCase(command, spriteId)
  }
}
