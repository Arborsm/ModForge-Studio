import type { EventCommand } from '@entities/event'
import { createStageEffect, parseBoolean, parseEffectColor, parseNumber } from '@entities/event'

export function parseTemporaryAnimatedSpriteCommand(command: EventCommand) {
  const sourceX = parseNumber(command.args[2])
  const sourceY = parseNumber(command.args[3])
  const sourceWidth = parseNumber(command.args[4])
  const sourceHeight = parseNumber(command.args[5])
  const animationIntervalMs = parseNumber(command.args[6])
  const animationLength = parseNumber(command.args[7])
  const loops = parseNumber(command.args[8])
  const tileX = parseNumber(command.args[9])
  const tileY = parseNumber(command.args[10])
  const layerDepth = parseNumber(command.args[13])
  const alphaFade = parseNumber(command.args[14])
  const scale = parseNumber(command.args[15])
  const scaleChange = parseNumber(command.args[16])
  const rotation = parseNumber(command.args[17])
  const rotationChange = parseNumber(command.args[18])

  if (
    !command.args[1] ||
    sourceX == null ||
    sourceY == null ||
    sourceWidth == null ||
    sourceHeight == null ||
    animationIntervalMs == null ||
    animationLength == null ||
    loops == null ||
    tileX == null ||
    tileY == null ||
    layerDepth == null ||
    alphaFade == null ||
    scale == null ||
    scaleChange == null ||
    rotation == null ||
    rotationChange == null
  ) {
    return null
  }

  let color: string | null = null
  let holdLastFrame = false
  let pingPong = false
  let motionX = 0
  let motionY = 0
  let accelerationX = 0
  let accelerationY = 0

  for (let index = 19; index < command.args.length; index += 1) {
    switch (command.args[index]) {
      case 'color':
        color = parseEffectColor(command.args[index + 1])
        index += 1
        break
      case 'hold_last_frame':
        holdLastFrame = true
        break
      case 'ping_pong':
        pingPong = true
        break
      case 'motion':
        motionX = parseNumber(command.args[index + 1]) ?? motionX
        motionY = parseNumber(command.args[index + 2]) ?? motionY
        index += 2
        break
      case 'acceleration':
        accelerationX = parseNumber(command.args[index + 1]) ?? accelerationX
        accelerationY = parseNumber(command.args[index + 2]) ?? accelerationY
        index += 2
        break
      case 'acceleration_change':
        index += 2
        break
      default:
        break
    }
  }

  return createStageEffect(command.id, 'temporaryAnimatedSprite', {
    textureName: command.args[1],
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    baseX: tileX * 64,
    baseY: tileY * 64,
    space: 'world',
    animationIntervalMs,
    animationLength,
    loops,
    flip: parseBoolean(command.args[12]),
    layerDepth,
    alphaFade,
    scale: scale * 4,
    scaleChange,
    rotation,
    rotationChange,
    motionX,
    motionY,
    accelerationX,
    accelerationY,
    holdLastFrame,
    pingPong,
    color,
  })
}

export function parseTemporarySpriteCommand(command: EventCommand) {
  const tileX = parseNumber(command.args[1])
  const tileY = parseNumber(command.args[2])
  const rowInAnimationSheet = parseNumber(command.args[3])
  const animationLength = parseNumber(command.args[4])

  if (tileX == null || tileY == null || rowInAnimationSheet == null || animationLength == null) {
    return null
  }

  return createStageEffect(command.id, 'temporarySprite', {
    textureName: 'TileSheets\\animations',
    sourceX: 0,
    sourceY: rowInAnimationSheet * 64,
    sourceWidth: 64,
    sourceHeight: 64,
    baseX: tileX * 64,
    baseY: tileY * 64,
    space: 'world',
    animationIntervalMs: parseNumber(command.args[5]) ?? 300,
    animationLength,
    loops: 1,
    flip: parseBoolean(command.args[6]),
    layerDepth: parseNumber(command.args[7]) ?? 1,
    scale: 1,
  })
}
