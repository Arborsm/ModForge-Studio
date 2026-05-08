import { type ReactNode } from 'react'
import type { LauncherPort } from './launcherPort'
import { LauncherPortContext } from './launcherPortContext'

export type LauncherProviderProps = {
  children: ReactNode
  port: LauncherPort
}

export function LauncherProvider({ children, port }: LauncherProviderProps) {
  return <LauncherPortContext.Provider value={port}>{children}</LauncherPortContext.Provider>
}
