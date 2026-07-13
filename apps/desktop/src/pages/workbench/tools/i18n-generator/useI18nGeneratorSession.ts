import { useEffect, useRef, useState } from 'react'
import type { AppUiI18nGeneratorSession } from '@shared/contracts'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'

const SAVE_DELAY_MS = 600

function serializeSession(session: AppUiI18nGeneratorSession) {
  return JSON.stringify({
    ...session,
    targetPrefixes: Object.fromEntries(Object.entries(session.targetPrefixes).sort(([left], [right]) => left.localeCompare(right))),
    enabledTargets: [...session.enabledTargets].sort(),
    expandedPaths: [...session.expandedPaths].sort(),
  })
}

function readSession(): AppUiI18nGeneratorSession {
  const state = getAppUiStateSnapshot().workspace.modules['i18n-generator']
  return {
    prefix: typeof state?.prefix === 'string' ? state.prefix : 'Author.ModName',
    targetPrefixes: isStringRecord(state?.targetPrefixes) ? state.targetPrefixes : {},
    enabledTargets: isStringList(state?.enabledTargets) ? state.enabledTargets : [],
    expandedPaths: isStringList(state?.expandedPaths) ? state.expandedPaths : [],
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((entry) => typeof entry === 'string')
  )
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
}

/** Owns lightweight generator configuration and batches persistence writes. */
export function useI18nGeneratorSession() {
  const [initialSession] = useState(readSession)
  const [prefix, setPrefix] = useState(initialSession.prefix)
  const [targetPrefixes, setTargetPrefixes] = useState<Record<string, string>>(initialSession.targetPrefixes)
  const [enabledTargets, setEnabledTargets] = useState(() => new Set(initialSession.enabledTargets))
  const [expandedPaths, setExpandedPaths] = useState(() => new Set(initialSession.expandedPaths))
  const sessionRef = useRef(initialSession)
  const savedSessionRef = useRef(serializeSession(initialSession))

  sessionRef.current = {
    prefix,
    targetPrefixes,
    enabledTargets: Array.from(enabledTargets).sort(),
    expandedPaths: Array.from(expandedPaths).sort(),
  }

  useEffect(() => {
    if (serializeSession(sessionRef.current) === savedSessionRef.current) return
    const timer = window.setTimeout(() => {
      savedSessionRef.current = serializeSession(sessionRef.current)
      void applyAppUiStatePatch({ workspace: { modules: { 'i18n-generator': sessionRef.current } } })
    }, SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [prefix, targetPrefixes, enabledTargets, expandedPaths])

  useEffect(
    () => () => {
      if (serializeSession(sessionRef.current) !== savedSessionRef.current) {
        void applyAppUiStatePatch({ workspace: { modules: { 'i18n-generator': sessionRef.current } } })
      }
    },
    [],
  )

  return { prefix, setPrefix, targetPrefixes, setTargetPrefixes, enabledTargets, setEnabledTargets, expandedPaths, setExpandedPaths }
}
