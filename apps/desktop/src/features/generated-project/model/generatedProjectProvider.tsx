import { type ReactNode } from 'react'
import type { GeneratedProjectPort } from './generatedProjectPort'
import { GeneratedProjectPortContext } from './generatedProjectPortContext'

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
