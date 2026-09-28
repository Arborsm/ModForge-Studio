/**
 * @file React context and hook for consuming the LauncherPort platform port.
 */
import { createContext, useContext } from 'react'
import type { LauncherPort } from './launcherPort'

/** React context holding the current LauncherPort instance (null when no provider is mounted). */
export const LauncherPortContext = createContext<LauncherPort | null>(null)

/** Returns the current LauncherPort, throwing when used outside a LauncherProvider. */
export function useLauncherPort(): LauncherPort {
  const port = useContext(LauncherPortContext)
  if (!port) {
    throw new Error('useLauncherPort must be used within a LauncherProvider.')
  }
  return port
}
