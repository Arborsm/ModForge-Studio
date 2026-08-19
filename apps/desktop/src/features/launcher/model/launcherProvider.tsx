/**
 * @file React provider that mounts a LauncherPort instance into the launcher
 * port context.
 */
import { type ReactNode } from 'react'
import type { LauncherPort } from './launcherPort'
import { LauncherPortContext } from './launcherPortContext'

/** Props for {@link LauncherProvider}. */
export type LauncherProviderProps = {
  children: ReactNode
  port: LauncherPort
}

/** Mounts a LauncherPort into the launcher port context for child components. */
export function LauncherProvider({ children, port }: LauncherProviderProps) {
  return <LauncherPortContext.Provider value={port}>{children}</LauncherPortContext.Provider>
}
