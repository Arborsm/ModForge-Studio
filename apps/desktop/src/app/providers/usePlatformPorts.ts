/**
 * @file Platform ports consumer hook: reads the current platform ports from PlatformContext.
 */
import { useContext } from 'react'
import { PlatformContext } from './platformContext'

/** Reads the current platform ports; throws when used outside PlatformProvider. */
export function usePlatformPorts() {
  const ports = useContext(PlatformContext)

  if (!ports) {
    throw new Error('usePlatformPorts must be used within PlatformProvider.')
  }

  return ports
}
