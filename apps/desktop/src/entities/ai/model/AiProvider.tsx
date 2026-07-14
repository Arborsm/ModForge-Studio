import { createContext, useContext, type ReactNode } from 'react'
import type { AiPort } from '@shared/contracts'

const AiContext = createContext<AiPort | null>(null)

/** Provides the host-agnostic AI capability to launcher and workbench features. */
export function AiProvider({ port, children }: { port: AiPort; children: ReactNode }) {
  return <AiContext.Provider value={port}>{children}</AiContext.Provider>
}

/** Returns the configured AI capability for user-triggered translation workflows. */
export function useAi(): AiPort {
  const port = useContext(AiContext)
  if (!port) throw new Error('AiProvider is missing from the application provider tree.')
  return port
}
