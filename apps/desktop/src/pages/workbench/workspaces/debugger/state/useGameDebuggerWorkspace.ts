import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDebugBridgeModState,
  getDebugBridgeStatus,
  installDebugBridgeMod,
  sendDebugBridgeCommand,
  type DebugBridgeCommandRequest,
  type DebugBridgeCommandResponse,
  type DebugBridgeGameState,
  type DebugBridgeModState,
  type DebugBridgeStatus,
} from '@entities/debug-bridge'
import { useGameDebuggerCopy } from '@locales/provider'
import { useOptionalWorkbenchProject, useWorkbenchEnvironment } from '../../../model/workbenchModuleContexts'

const STATUS_POLL_INTERVAL_MS = 5000
const CONNECTION_LOG_LIMIT = 60

export type DebuggerLogTone = 'info' | 'success' | 'error'

export interface DebuggerLogEntry {
  id: number
  time: string
  text: string
  tone: DebuggerLogTone
}

function formatLogTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/**
 * Owns debug-bridge connectivity for the debugger module: status polling with
 * transition logging, live game state, bridge-mod install state, and a command
 * runner that reports transport failures as data instead of throwing.
 */
export function useGameDebuggerWorkspace() {
  const copy = useGameDebuggerCopy()
  const environment = useWorkbenchEnvironment()
  const project = useOptionalWorkbenchProject()
  const gameRootPath = environment.directoryInfo?.rootPath ?? null

  const [status, setStatus] = useState<DebugBridgeStatus | null>(null)
  const [gameState, setGameState] = useState<DebugBridgeGameState | null>(null)
  const [modState, setModState] = useState<DebugBridgeModState | null>(null)
  const [modStateError, setModStateError] = useState<string | null>(null)
  const [installing, setInstalling] = useState(false)
  const [log, setLog] = useState<DebuggerLogEntry[]>([])

  const logIdRef = useRef(0)
  const lastReachableRef = useRef<boolean | null>(null)

  const appendLog = useCallback((text: string, tone: DebuggerLogTone = 'info') => {
    setLog((previous) => {
      logIdRef.current += 1
      const entry: DebuggerLogEntry = { id: logIdRef.current, time: formatLogTime(new Date()), text, tone }
      const next = [entry, ...previous]
      return next.length > CONNECTION_LOG_LIMIT ? next.slice(0, CONNECTION_LOG_LIMIT) : next
    })
  }, [])

  const clearLog = useCallback(() => setLog([]), [])

  const refreshGameState = useCallback(async () => {
    try {
      const response = await sendDebugBridgeCommand({ command: 'state' })
      if (response.ok && response.result && typeof response.result === 'object') {
        setGameState(response.result as DebugBridgeGameState)
      }
    } catch {
      // state refresh rides on the status poll; connection failures are reported there
      setGameState(null)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const poll = async () => {
      let next: DebugBridgeStatus | null = null
      try {
        next = await getDebugBridgeStatus()
      } catch (error) {
        next = { reachable: false, port: 0, error: error instanceof Error ? error.message : String(error) }
      }
      if (cancelled) return
      setStatus(next)

      const wasReachable = lastReachableRef.current
      if (next.reachable && wasReachable !== true) {
        appendLog(copy.connectionLog.connected, 'success')
      } else if (!next.reachable && wasReachable === true) {
        appendLog(copy.connectionLog.reconnecting, 'error')
      } else if (!next.reachable && wasReachable === null) {
        appendLog(copy.connectionLog.disconnectedTemplate(next.error ?? ''), 'error')
      }
      lastReachableRef.current = next.reachable

      if (next.reachable) {
        await refreshGameState()
      } else {
        setGameState(null)
      }
      if (!cancelled) {
        timer = setTimeout(poll, STATUS_POLL_INTERVAL_MS)
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer !== null) clearTimeout(timer)
    }
  }, [appendLog, copy.connectionLog, refreshGameState])

  const refreshModState = useCallback(async () => {
    if (!gameRootPath) {
      setModState(null)
      setModStateError(null)
      return
    }
    try {
      const state = await getDebugBridgeModState(gameRootPath)
      setModState(state)
      setModStateError(null)
    } catch (error) {
      setModState(null)
      setModStateError(error instanceof Error ? error.message : String(error))
    }
  }, [gameRootPath])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (!cancelled) await refreshModState()
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [refreshModState])

  const installBridgeMod = useCallback(async () => {
    if (!gameRootPath || installing) return
    setInstalling(true)
    appendLog(copy.connectionLog.installStarted, 'info')
    try {
      const state = await installDebugBridgeMod(gameRootPath)
      setModState(state)
      setModStateError(null)
      appendLog(copy.connectionLog.installFinishedTemplate(state.installedVersion ?? ''), 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setModStateError(message)
      appendLog(copy.bridgeMod.installFailedTemplate(message), 'error')
    } finally {
      setInstalling(false)
    }
  }, [appendLog, copy.bridgeMod, copy.connectionLog, gameRootPath, installing])

  /** Sends one bridge command; transport failures resolve as {ok:false} so callers render inline errors. */
  const runCommand = useCallback(
    async (request: DebugBridgeCommandRequest): Promise<DebugBridgeCommandResponse> => {
      let response: DebugBridgeCommandResponse
      try {
        response = await sendDebugBridgeCommand(request)
      } catch (error) {
        response = { ok: false, error: error instanceof Error ? error.message : String(error) }
      }
      if (response.ok) {
        appendLog(copy.connectionLog.commandSentTemplate(request.command), 'info')
      } else {
        appendLog(copy.connectionLog.commandFailedTemplate(request.command, response.error ?? ''), 'error')
      }
      void refreshGameState()
      return response
    },
    [appendLog, copy.connectionLog, refreshGameState],
  )

  return {
    environment,
    project,
    gameRootPath,
    status,
    gameState,
    modState,
    modStateError,
    installing,
    log,
    appendLog,
    clearLog,
    installBridgeMod,
    refreshModState,
    refreshGameState,
    runCommand,
  }
}

export type GameDebuggerWorkspaceState = ReturnType<typeof useGameDebuggerWorkspace>
