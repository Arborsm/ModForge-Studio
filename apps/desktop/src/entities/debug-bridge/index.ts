export { getDebugBridgeStatus, sendDebugBridgeCommand, getDebugBridgeModState, installDebugBridgeMod } from './api/debugBridgeApi'
export {
  BRIDGE_WEATHER_IDS,
  POINTS_PER_HEART,
  buildWarpCommand,
  buildSetTimeCommand,
  buildAddMoneyCommand,
  buildSetStaminaCommand,
  buildSetHealthCommand,
  buildSetFriendshipCommand,
  buildSetWeatherTomorrowCommand,
  buildSpeechCommand,
  buildSetTempEntryCommand,
  buildClearTempEntriesCommand,
  buildPlayEventCommand,
  buildRunEventScriptCommand,
  buildDebugCommand,
  extractEventIdFromEntryKey,
  isEventAssetTarget,
  formatBridgeTime,
  type BridgeWeatherId,
} from './model/commands'
export { useBridgeCommand, type BridgeCommandOutcome } from './lib/useBridgeCommand'
export type {
  DebugBridgeHello,
  DebugBridgeStatus,
  DebugBridgeModState,
  DebugBridgeGameState,
  DebugBridgeCommandRequest,
  DebugBridgeCommandResponse,
} from './model/types'
