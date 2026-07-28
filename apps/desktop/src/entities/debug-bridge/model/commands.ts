import type { DebugBridgeCommandRequest } from './types'

/** Weather ids accepted by the bridge's set-weather-tomorrow command (vanilla 1.6 weather ids). */
export const BRIDGE_WEATHER_IDS = ['Sun', 'Rain', 'GreenRain', 'Wind', 'Storm', 'Snow'] as const
export type BridgeWeatherId = (typeof BRIDGE_WEATHER_IDS)[number]

/** Friendship hearts are stored as 250 points per heart. */
export const POINTS_PER_HEART = 250

/** Builds a warp command; coordinates are tile coordinates. */
export function buildWarpCommand(location: string, x: number, y: number): DebugBridgeCommandRequest {
  return { command: 'warp', args: { location, x, y } }
}

/** Builds a set-time command from an in-game HHmm time (600–2600). */
export function buildSetTimeCommand(time: number): DebugBridgeCommandRequest {
  return { command: 'set-time', args: { time } }
}

/** Builds an add-money command; negative amounts deduct. */
export function buildAddMoneyCommand(amount: number): DebugBridgeCommandRequest {
  return { command: 'add-money', args: { amount } }
}

export function buildSetStaminaCommand(value: number): DebugBridgeCommandRequest {
  return { command: 'set-stamina', args: { value } }
}

export function buildSetHealthCommand(value: number): DebugBridgeCommandRequest {
  return { command: 'set-health', args: { value } }
}

/** Builds a set-friendship command from a heart level (0–14). */
export function buildSetFriendshipCommand(npc: string, hearts: number): DebugBridgeCommandRequest {
  return { command: 'set-friendship', args: { npc, points: Math.max(0, Math.round(hearts * POINTS_PER_HEART)) } }
}

export function buildSetWeatherTomorrowCommand(weather: BridgeWeatherId): DebugBridgeCommandRequest {
  return { command: 'set-weather-tomorrow', args: { weather } }
}

/** Builds a speech command showing a dialogue box for an NPC with raw dialogue text. */
export function buildSpeechCommand(npc: string, text: string): DebugBridgeCommandRequest {
  return { command: 'speech', args: { npc, text } }
}

/** Builds a temp-entry command that edits one string-dictionary entry in game memory. */
export function buildSetTempEntryCommand(target: string, key: string, value: string): DebugBridgeCommandRequest {
  return { command: 'set-temp-entry', args: { target, key, value } }
}

export function buildClearTempEntriesCommand(): DebugBridgeCommandRequest {
  return { command: 'clear-temp-entries' }
}

/** Builds a play-event-id command; precondition/seen checks default to off for debugging. */
export function buildPlayEventCommand(eventId: string): DebugBridgeCommandRequest {
  return { command: 'play-event-id', args: { eventId, checkPreconditions: false, checkSeen: false } }
}

/** Builds a run-event-script command playing a raw event script in the player's current location. */
export function buildRunEventScriptCommand(script: string, eventId?: string): DebugBridgeCommandRequest {
  return { command: 'run-event-script', args: { script, ...(eventId ? { eventId } : {}) } }
}

/** Builds a vanilla debug-command passthrough (equivalent to SMAPI's `debug <text>`). */
export function buildDebugCommand(text: string): DebugBridgeCommandRequest {
  return { command: 'debug', args: { text } }
}

/**
 * Extracts the event id from a Data/Events entry key: the id is the first
 * slash-separated segment before preconditions (`"739330/f Abigail 250"` → `"739330"`).
 */
export function extractEventIdFromEntryKey(entryKey: string): string {
  const trimmed = entryKey.trim()
  if (!trimmed) return ''
  const slash = trimmed.indexOf('/')
  return slash === -1 ? trimmed : trimmed.slice(0, slash)
}

export { isEventAssetTarget } from '@entities/event'

/** Formats an in-game HHmm time for display (e.g. 1330 → "13:30"). */
export function formatBridgeTime(time: number | undefined): string {
  if (time === undefined || Number.isNaN(time)) return '--:--'
  const hours = Math.floor(time / 100)
  const minutes = time % 100
  return `${hours}:${String(minutes).padStart(2, '0')}`
}
