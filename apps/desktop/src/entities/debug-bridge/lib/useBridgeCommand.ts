import { useEffect, useRef, useState } from 'react'
import { getDebugBridgeStatus, sendDebugBridgeCommand } from '../api/debugBridgeApi'
import type { DebugBridgeCommandRequest } from '../model/types'

/**
 * Outcome of the last command sent through {@link useBridgeCommand}.
 * `unreachable` separates "game is not running" from a bridge-side rejection so
 * callers can tell the author which of the two to fix.
 */
export type BridgeCommandOutcome =
  | { status: 'idle' }
  | { status: 'sent' }
  | { status: 'unreachable'; error: string }
  | { status: 'failed'; error: string }

/**
 * One-shot bridge command sender for authoring surfaces that want a "try it in
 * the running game" action without owning the debugger workspace's polling.
 * Probes reachability first, then sends; transport failures resolve as outcome
 * data instead of throwing. Results of commands that finish after unmount are
 * dropped.
 */
export function useBridgeCommand() {
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<BridgeCommandOutcome>({ status: 'idle' })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  async function send(request: DebugBridgeCommandRequest): Promise<BridgeCommandOutcome> {
    setPending(true)
    let next: BridgeCommandOutcome
    try {
      const status = await getDebugBridgeStatus()
      if (!status.reachable) {
        next = { status: 'unreachable', error: status.error ?? '' }
      } else {
        const response = await sendDebugBridgeCommand(request)
        next = response.ok ? { status: 'sent' } : { status: 'failed', error: response.error ?? '' }
      }
    } catch (error) {
      next = { status: 'failed', error: error instanceof Error ? error.message : String(error) }
    }
    if (mountedRef.current) {
      setPending(false)
      setOutcome(next)
    }
    return next
  }

  function reset() {
    setOutcome({ status: 'idle' })
  }

  return { pending, outcome, send, reset }
}
