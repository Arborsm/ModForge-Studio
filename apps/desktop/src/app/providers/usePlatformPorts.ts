import { useContext } from 'react'
import { PlatformContext } from './platformContext'

export function usePlatformPorts() {
  const ports = useContext(PlatformContext)

  if (!ports) {
    throw new Error('usePlatformPorts must be used within PlatformProvider.')
  }

  return ports
}
