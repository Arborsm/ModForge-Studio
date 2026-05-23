import type { EventCommand } from '@entities/event'
import { createStageEffect, parsePoint, type StageEffectState } from '@entities/event'
import { parseTemporaryAnimatedSpriteCommand, parseTemporarySpriteCommand } from './eventStageTemporarySpriteCommands'
import { buildSpecificTemporarySpriteEffects } from './eventStageSpecificSpriteEffects'

function replaceStageEffectByNumericId(
  effects: StageEffectState[],
  effectNumericId: number,
  producer: (current: StageEffectState) => StageEffectState,
) {
  let changed = false
  const nextEffects = effects.map((effect) => {
    if (effect.effectNumericId !== effectNumericId) {
      return effect
    }

    changed = true
    return producer(effect)
  })

  return changed ? nextEffects : effects
}

function removeStageEffectsByNumericId(effects: StageEffectState[], effectNumericId: number) {
  return effects.filter((effect) => effect.effectNumericId !== effectNumericId)
}

function removeStageEffectsByTile(effects: StageEffectState[], tileX: number, tileY: number) {
  return effects.filter((effect) => {
    if (effect.space !== 'world') {
      return true
    }

    return Math.floor(effect.baseX / 64) !== tileX || Math.floor(effect.baseY / 64) !== tileY
  })
}

function applyStageEffectCommand(effects: StageEffectState[], command: EventCommand) {
  switch (command.command) {
    case 'temporaryAnimatedSprite': {
      const effect = parseTemporaryAnimatedSpriteCommand(command)
      return effect ? [...effects, effect] : effects
    }
    case 'temporarySprite': {
      const effect = parseTemporarySpriteCommand(command)
      return effect ? [...effects, effect] : effects
    }
    case 'removeSprite': {
      const tile = parsePoint(command.args[1], command.args[2])
      if (tile) {
        return removeStageEffectsByTile(effects, tile.tileX, tile.tileY)
      }

      const effectNumericId = Number.parseInt(command.args[1] ?? '', 10)
      return Number.isFinite(effectNumericId) ? removeStageEffectsByNumericId(effects, effectNumericId) : effects
    }
    case 'removeTemporarySprites':
      return []
    case 'specificTemporarySprite': {
      const result = buildSpecificTemporarySpriteEffects(command)
      switch (result.mode) {
        case 'remove-by-id':
          return result.effectNumericId != null ? removeStageEffectsByNumericId(effects, result.effectNumericId) : effects
        case 'update-boombox-start':
          return replaceStageEffectByNumericId(effects, 999, (current) => ({
            ...current,
            pulse: true,
            pulseTimeMs: 420,
          }))
        case 'update-boombox-stop':
          return replaceStageEffectByNumericId(effects, 999, (current) => ({
            ...current,
            pulse: false,
            scale: 4,
            scaleChange: 0,
          }))
        case 'replace-jas-gift':
          return [
            ...effects.filter((effect) => effect.effectNumericId !== 999),
            createStageEffect(command.id, 'jasGiftOpen:gift', {
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
            ...result.effects,
          ]
        case 'update-shake':
          return result.effectNumericId != null
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                shakeIntensity: result.shakeIntensity ?? 0,
              }))
            : effects
        case 'update-replace-source':
          return result.effectNumericId != null && result.sourceRect
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                sourceX: result.sourceRect?.x ?? current.sourceX,
                sourceY: result.sourceRect?.y ?? current.sourceY,
                sourceWidth: result.sourceRect?.width ?? current.sourceWidth,
                sourceHeight: result.sourceRect?.height ?? current.sourceHeight,
                animationLength: current.animationLength > 1 ? 3 : 1,
                pingPong: command.args[1] === 'BoatParrotLeave',
                motionX: command.args[1] === 'BoatParrotLeave' ? 4 : 0,
                motionY: command.args[1] === 'BoatParrotLeave' ? -6 : 0,
              }))
            : effects
        case 'update-curtain':
          return result.effectNumericId != null && result.sourceRect
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                sourceX: result.sourceRect?.x ?? current.sourceX,
                sourceY: result.sourceRect?.y ?? current.sourceY,
                sourceWidth: result.sourceRect?.width ?? current.sourceWidth,
                sourceHeight: result.sourceRect?.height ?? current.sourceHeight,
              }))
            : effects
        case 'update-secret-gift':
          return result.effectNumericId != null
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                animationLength: 6,
                animationIntervalMs: 100,
                loops: 1,
                holdLastFrame: true,
                startedAtMs: performance.now(),
              }))
            : effects
        case 'update-grandpa-spirit':
          return result.effectNumericId != null
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                textureName: 'LooseSprites\\Cursors2',
                sourceX: 186,
                sourceY: 265,
                sourceWidth: 22,
                sourceHeight: 34,
                yPeriodic: true,
                yPeriodicLoopTimeMs: 1000,
                yPeriodicRange: 16,
                xPeriodic: true,
                xPeriodicLoopTimeMs: 2500,
                xPeriodicRange: 16,
              }))
            : effects
        case 'update-leah-painting-hold': {
          const nextEffects = effects
            .filter((effect) => effect.effectNumericId !== 777)
            .map((effect) =>
              effect.effectNumericId === 999
                ? {
                    ...effect,
                    sourceX: effect.sourceX + 15,
                  }
                : effect,
            )

          return [...nextEffects, ...result.effects]
        }
        case 'update-leah-painting-release':
          return effects
            .filter((effect) => effect.effectNumericId !== 777)
            .map((effect) =>
              effect.effectNumericId === 999
                ? {
                    ...effect,
                    sourceX: effect.sourceX - 15,
                  }
                : effect,
            )
        case 'update-farmer-hold-painting': {
          const nextEffects = effects
            .filter((effect) => effect.effectNumericId !== 444 && effect.effectNumericId !== 777)
            .map((effect) =>
              effect.effectNumericId === 888
                ? {
                    ...effect,
                    sourceX: effect.sourceX + 15,
                  }
                : effect,
            )

          return [...nextEffects, ...result.effects]
        }
        case 'update-candle-boat':
          return result.effectNumericId != null
            ? replaceStageEffectByNumericId(effects, result.effectNumericId, (current) => ({
                ...current,
                motionY: 2,
              }))
            : effects
        case 'update-remove-all-id-1':
          return removeStageEffectsByNumericId(effects, 1)
        default:
          return [...effects, ...result.effects]
      }
    }
    default:
      return effects
  }
}

export { applyStageEffectCommand, removeStageEffectsByTile }
