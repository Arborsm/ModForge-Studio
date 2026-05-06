import { createContext, useContext, type ReactNode } from 'react'
import type { GeneratedProjectPort } from './generatedProjectPort'

const GeneratedProjectPortContext = createContext<GeneratedProjectPort | null>(null)

export type GeneratedProjectProviderProps = {
  children: ReactNode
  port: GeneratedProjectPort
}

export function GeneratedProjectProvider({ children, port }: GeneratedProjectProviderProps) {
  return (
    <GeneratedProjectPortContext.Provider value={port}>
      {children}
    </GeneratedProjectPortContext.Provider>
  )
}

export function useGeneratedProjectPort(): GeneratedProjectPort {
  const port = useContext(GeneratedProjectPortContext)

  if (!port) {
    throw new Error(
      'useGeneratedProjectPort must be used within a GeneratedProjectProvider. ' +
        'Ensure the app-level provider is mounted above the workbench shell.',
    )
  }

  return port
}
