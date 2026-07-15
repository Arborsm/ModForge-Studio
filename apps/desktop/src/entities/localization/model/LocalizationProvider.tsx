import { createContext, useContext, type ReactNode } from 'react'
import type { LocalizationPort } from '@shared/contracts'

const LocalizationContext = createContext<LocalizationPort | null>(null)

/** Provides localization persistence and orchestration without exposing host transport. */
export function LocalizationProvider({ port, children }: { port: LocalizationPort; children: ReactNode }) {
  return <LocalizationContext.Provider value={port}>{children}</LocalizationContext.Provider>
}

/** Returns the localization capability injected by the application shell. */
export function useLocalization(): LocalizationPort {
  const port = useContext(LocalizationContext)
  if (!port) throw new Error('LocalizationProvider is missing from the application provider tree.')
  return port
}
