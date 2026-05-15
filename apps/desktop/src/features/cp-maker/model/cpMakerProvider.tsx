import { type ReactNode } from 'react'
import type { CpMakerPort } from './cpMakerPort'
import { CpMakerPortContext } from './cpMakerPortContext'

export type CpMakerProviderProps = {
  children: ReactNode
  port: CpMakerPort
}

export function CpMakerProvider({ children, port }: CpMakerProviderProps) {
  return <CpMakerPortContext.Provider value={port}>{children}</CpMakerPortContext.Provider>
}
