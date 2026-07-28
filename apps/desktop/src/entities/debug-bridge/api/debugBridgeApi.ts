import { HOST_COMMANDS } from '@platform/host-commands'
import { invokeDesktop } from '@platform/host/runtime'
import type { HostCommandPolicy } from '@platform/host-command-client'
import type { DebugBridgeCommandRequest, DebugBridgeCommandResponse, DebugBridgeModState, DebugBridgeStatus } from '../model/types'

const statusPolicy = { kind: 'latest', key: 'debug-bridge-status' } satisfies HostCommandPolicy
const commandPolicy = { kind: 'parallelPool', pool: 'debug-bridge-command', limit: 1 } satisfies HostCommandPolicy
const modStatePolicy = { kind: 'parallelPool', pool: 'host-io', limit: 2 } satisfies HostCommandPolicy
const installPolicy = { kind: 'exclusiveMutation', resource: 'DebugBridgeInstall' } satisfies HostCommandPolicy

/** Probes the localhost bridge; an unreachable bridge resolves with reachable=false rather than rejecting. */
export function getDebugBridgeStatus(port?: number): Promise<DebugBridgeStatus> {
  return invokeDesktop<DebugBridgeStatus>(HOST_COMMANDS.getDebugBridgeStatus, { port }, statusPolicy)
}

/** Sends one command to the running game; bridge-level failures come back as {ok:false, error} data. */
export function sendDebugBridgeCommand(request: DebugBridgeCommandRequest): Promise<DebugBridgeCommandResponse> {
  return invokeDesktop<DebugBridgeCommandResponse>(HOST_COMMANDS.sendDebugBridgeCommand, { request }, commandPolicy)
}

/** Reads payload availability and the installed bridge mod version for a game directory. */
export function getDebugBridgeModState(gameRootPath: string): Promise<DebugBridgeModState> {
  return invokeDesktop<DebugBridgeModState>(HOST_COMMANDS.getDebugBridgeModState, { gameRootPath }, modStatePolicy)
}

/** Copies the staged bridge mod into the game's Mods folder (replacing a previous install). */
export function installDebugBridgeMod(gameRootPath: string): Promise<DebugBridgeModState> {
  return invokeDesktop<DebugBridgeModState>(HOST_COMMANDS.installDebugBridgeMod, { gameRootPath }, installPolicy)
}
