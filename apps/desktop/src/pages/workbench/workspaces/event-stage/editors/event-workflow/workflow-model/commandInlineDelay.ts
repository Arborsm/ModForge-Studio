import type { EventCommand } from '@entities/event'

type InlineDelayKind = 'after' | 'step' | 'hold'

type InlineDelayPolicy = {
  defaultMs: number
  stepMs: number
  kind: InlineDelayKind
  quickValues: number[]
}

const MICRO_QUICK_VALUES = [10, 25, 30, 50, 100]
const SHORT_QUICK_VALUES = [300, 400, 500, 800, 1000]
const HOLD_QUICK_VALUES = [1000, 1500, 2000, 3000, 5000]

type InlineDelayPolicyEntry = InlineDelayPolicy | number

const DEFAULT_INLINE_DELAY_POLICIES: Record<string, InlineDelayPolicyEntry> = {
  speak: {
    defaultMs: 500,
    stepMs: 100,
    kind: 'after',
    quickValues: SHORT_QUICK_VALUES,
  },
  faceDirection: {
    defaultMs: 500,
    stepMs: 100,
    kind: 'after',
    quickValues: SHORT_QUICK_VALUES,
  },
  positionOffset: {
    defaultMs: 50,
    stepMs: 5,
    kind: 'step',
    quickValues: MICRO_QUICK_VALUES,
  },
  playSound: {
    defaultMs: 500,
    stepMs: 100,
    kind: 'after',
    quickValues: SHORT_QUICK_VALUES,
  },
  showFrame: {
    defaultMs: 500,
    stepMs: 100,
    kind: 'after',
    quickValues: SHORT_QUICK_VALUES,
  },
  move: {
    defaultMs: 500,
    stepMs: 100,
    kind: 'after',
    quickValues: [500, 800, 1000, 1500, 2000],
  },
  emote: {
    defaultMs: 500,
    stepMs: 100,
    kind: 'after',
    quickValues: SHORT_QUICK_VALUES,
  },
  viewport: {
    defaultMs: 2000,
    stepMs: 250,
    kind: 'hold',
    quickValues: HOLD_QUICK_VALUES,
  },
  animate: {
    defaultMs: 1000,
    stepMs: 100,
    kind: 'hold',
    quickValues: HOLD_QUICK_VALUES,
  },
  jump: 300,
  screenFlash: 350,
  shake: 500,
  itemAboveHead: 800,
  textAboveHead: {
    defaultMs: 1500,
    stepMs: 250,
    kind: 'hold',
    quickValues: HOLD_QUICK_VALUES,
  },
  farmerAnimation: 900,
  playMusic: {
    defaultMs: 1000,
    stepMs: 250,
    kind: 'hold',
    quickValues: HOLD_QUICK_VALUES,
  },
  specificTemporarySprite: {
    defaultMs: 1000,
    stepMs: 250,
    kind: 'hold',
    quickValues: HOLD_QUICK_VALUES,
  },
  addObject: 300,
  removeObject: 300,
  addTemporaryActor: 500,
  warp: 250,
}

const INLINE_DELAY_HOSTS = new Set(Object.keys(DEFAULT_INLINE_DELAY_POLICIES))

export type InlineDelayCandidate = {
  hostCommandIndex: number
  pauseCommandIndex: number | null
  valueMs: number
  defaultMs: number
  stepMs: number
  kind: InlineDelayKind
  quickValues: number[]
}

export function isPauseCommand(command: EventCommand | undefined) {
  return command?.command === 'pause'
}

export function getDefaultInlineDelayMs(command: EventCommand) {
  return getInlineDelayPolicy(command)?.defaultMs ?? null
}

export function getInlineDelayPolicy(command: EventCommand): InlineDelayPolicy | null {
  const policy = DEFAULT_INLINE_DELAY_POLICIES[command.command]
  if (policy == null) {
    return null
  }
  if (typeof policy === 'number') {
    return {
      defaultMs: policy,
      stepMs: 100,
      kind: 'after',
      quickValues: SHORT_QUICK_VALUES,
    }
  }
  return policy
}

export function canHostInlineDelay(command: EventCommand) {
  return INLINE_DELAY_HOSTS.has(command.command)
}

export function getInlineDelayCandidate(commands: EventCommand[], hostCommandIndex: number): InlineDelayCandidate | null {
  const command = commands[hostCommandIndex]
  if (!command || !canHostInlineDelay(command)) {
    return null
  }

  const policy = getInlineDelayPolicy(command)
  if (policy == null) {
    return null
  }

  const nextCommand = commands[hostCommandIndex + 1]
  if (isPauseCommand(nextCommand)) {
    const parsedMs = Number.parseInt(nextCommand.args[1] ?? '', 10)
    return {
      hostCommandIndex,
      pauseCommandIndex: hostCommandIndex + 1,
      valueMs: Number.isFinite(parsedMs) ? parsedMs : policy.defaultMs,
      defaultMs: policy.defaultMs,
      stepMs: policy.stepMs,
      kind: policy.kind,
      quickValues: policy.quickValues,
    }
  }

  return {
    hostCommandIndex,
    pauseCommandIndex: null,
    valueMs: policy.defaultMs,
    defaultMs: policy.defaultMs,
    stepMs: policy.stepMs,
    kind: policy.kind,
    quickValues: policy.quickValues,
  }
}

export function shouldFoldPauseIntoPrevious(commands: EventCommand[], pauseCommandIndex: number) {
  const command = commands[pauseCommandIndex]
  if (!isPauseCommand(command)) {
    return false
  }

  const previous = commands[pauseCommandIndex - 1]
  return previous ? canHostInlineDelay(previous) : false
}

export function getVisiblePlaybackCommandIndex(commands: EventCommand[], currentCommandId: string | null | undefined) {
  if (!currentCommandId) {
    return null
  }

  const commandIndex = commands.findIndex((command) => command.id === currentCommandId)
  if (commandIndex < 0) {
    return null
  }

  return shouldFoldPauseIntoPrevious(commands, commandIndex) ? commandIndex - 1 : commandIndex
}

export function formatInlineDelay(ms: number) {
  if (ms >= 1000 && ms % 1000 === 0) {
    return `${ms / 1000}s`
  }
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`
  }
  return `${ms}ms`
}
