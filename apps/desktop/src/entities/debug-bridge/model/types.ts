/** Handshake payload returned by the bridge mod's `hello` command. */
export interface DebugBridgeHello {
  bridgeVersion: string
  gameVersion: string
  smapiVersion: string
  saveLoaded: boolean
}

/** Reachability probe result for the localhost bridge. */
export interface DebugBridgeStatus {
  reachable: boolean
  port: number
  hello?: DebugBridgeHello
  error?: string
}

/** Install state of the bridge mod inside the game's Mods folder. */
export interface DebugBridgeModState {
  payloadAvailable: boolean
  payloadVersion: string | null
  payloadPath: string | null
  installed: boolean
  installedVersion: string | null
  modsPath: string
}

/** Live game snapshot returned by the bridge mod's `state` command. */
export interface DebugBridgeGameState {
  saveLoaded: boolean
  playerName?: string
  farmName?: string
  money?: number
  stamina?: number
  maxStamina?: number
  health?: number
  maxHealth?: number
  location?: string
  tileX?: number
  tileY?: number
  facingDirection?: number
  day?: number
  season?: string
  year?: number
  timeOfDay?: number
  dayOfWeek?: string
  weather?: string
  weatherForTomorrow?: string
  eventUp?: boolean
  currentEventId?: string | null
}

/** Raw `{ok, result?, error?}` payload the bridge returns for one command. */
export interface DebugBridgeCommandResponse {
  ok: boolean
  result?: unknown
  error?: string
}

/** One command request forwarded to the running game. */
export interface DebugBridgeCommandRequest {
  command: string
  args?: Record<string, unknown>
  port?: number
}
