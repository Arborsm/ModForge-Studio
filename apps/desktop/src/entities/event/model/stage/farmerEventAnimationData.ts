import type { ActorAnimationFrameState } from '@entities/event'

const PRIMARY_ARM_OFFSET = 6
const SECONDARY_ARM_OFFSET = 12

type FarmerAnimationVisualState = {
  usingTool: boolean
  toolKind: 'none' | 'fishingRod' | 'slingshot' | 'other'
  fishingRodIsCasting: boolean
  slingshotAimRadians: number | null
  slingshotBackArmDistance: number
}

type FarmerAnimationFrameOptions = {
  armOffset?: number
  flip?: boolean
  hideArms?: boolean
  positionOffset?: number
  secondaryArm?: boolean
  xOffset?: number
}

function createAnimationFrameState(frame: number, durationMs: number, options: FarmerAnimationFrameOptions = {}): ActorAnimationFrameState {
  return {
    frame,
    durationMs,
    flip: options.flip ?? false,
    positionOffset: options.positionOffset ?? 0,
    xOffset: options.xOffset ?? 0,
    armOffset: options.hideArms ? -1 : (options.armOffset ?? (options.secondaryArm ? SECONDARY_ARM_OFFSET : PRIMARY_ARM_OFFSET)),
  }
}

function buildEventAnimationFrames(frames: number[], durationMs: number, flip: boolean) {
  return frames.map((frame) => createAnimationFrameState(frame, durationMs, { flip }))
}

function buildFarmerSingleAnimationFrames(animationId: number, facingDirection: number) {
  switch (animationId) {
    case 97:
      return [createAnimationFrameState(97, 800, { flip: facingDirection === 3 })]
    case 216:
      return [
        createAnimationFrameState(0, 0),
        createAnimationFrameState(84, 250),
        createAnimationFrameState(85, 400),
        createAnimationFrameState(86, 1),
        createAnimationFrameState(86, 400),
        createAnimationFrameState(87, 250),
        createAnimationFrameState(88, 250),
        createAnimationFrameState(87, 250),
        createAnimationFrameState(88, 250),
        createAnimationFrameState(87, 250),
        createAnimationFrameState(0, 250),
      ]
    case 294:
      return [
        createAnimationFrameState(0, 1),
        createAnimationFrameState(90, 250),
        createAnimationFrameState(91, 150),
        createAnimationFrameState(92, 250),
        createAnimationFrameState(93, 200),
        createAnimationFrameState(92, 250),
        createAnimationFrameState(93, 200),
        createAnimationFrameState(92, 250),
        createAnimationFrameState(93, 200),
        createAnimationFrameState(91, 250),
        createAnimationFrameState(90, 50),
      ]
    case 304:
      return [createAnimationFrameState(84, 99999999)]
    default:
      return null
  }
}

function getFarmerEatAnimationId(isDrink: boolean) {
  return isDrink ? 294 : 216
}

function createDefaultFarmerAnimationVisualState(): FarmerAnimationVisualState {
  return {
    usingTool: false,
    toolKind: 'none',
    fishingRodIsCasting: true,
    slingshotAimRadians: null,
    slingshotBackArmDistance: 8,
  }
}

function inferFarmerFrameVisualState(frame: number): FarmerAnimationVisualState {
  if ([295, 296, 297, 298, 299, 300, 301, 302].includes(frame)) {
    return {
      usingTool: true,
      toolKind: 'fishingRod',
      fishingRodIsCasting: true,
      slingshotAimRadians: null,
      slingshotBackArmDistance: 8,
    }
  }

  if ((frame >= 160 && frame < 192) || (frame >= 232 && frame < 264) || (frame >= 272 && frame < 280) || frame === 303) {
    return {
      usingTool: true,
      toolKind: 'other',
      fishingRodIsCasting: true,
      slingshotAimRadians: null,
      slingshotBackArmDistance: 8,
    }
  }

  return createDefaultFarmerAnimationVisualState()
}

function inferFarmerAnimationFramesVisualState(frames: number[]) {
  for (const frame of frames) {
    const visualState = inferFarmerFrameVisualState(frame)
    if (visualState.usingTool) {
      return visualState
    }
  }

  return createDefaultFarmerAnimationVisualState()
}

function inferFarmerSingleAnimationVisualState(animationId: number) {
  return inferFarmerFrameVisualState(animationId)
}

export {
  PRIMARY_ARM_OFFSET,
  buildEventAnimationFrames,
  buildFarmerSingleAnimationFrames,
  createAnimationFrameState,
  getFarmerEatAnimationId,
  inferFarmerAnimationFramesVisualState,
  inferFarmerFrameVisualState,
  inferFarmerSingleAnimationVisualState,
}
