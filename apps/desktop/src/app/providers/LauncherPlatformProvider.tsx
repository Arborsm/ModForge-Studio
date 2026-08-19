/**
 * @file Launcher platform Provider: adapts host launcher commands into a LauncherPort and injects it into LauncherProvider.
 */
import { type ReactNode, useMemo } from 'react'
import { createLauncherPortAdapter } from './launcherPortAdapter'
import { LauncherProvider } from '@features/launcher/model/launcherProvider'

/** Props for LauncherPlatformProvider. */
export type LauncherPlatformProviderProps = {
  children: ReactNode
}

/** Launcher platform Provider component: creates a LauncherPort and injects it into LauncherProvider. */
export function LauncherPlatformProvider({ children }: LauncherPlatformProviderProps) {
  const port = useMemo(() => createLauncherPortAdapter(), [])
  return <LauncherProvider port={port}>{children}</LauncherProvider>
}
