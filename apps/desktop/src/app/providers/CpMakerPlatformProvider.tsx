/**
 * @file CP Maker platform Provider: adapts platform ports into a CpMakerPort and injects it into CpMakerProvider.
 */
import { type ReactNode, useMemo } from 'react'
import { createCpMakerPortAdapter } from './cpMakerPortAdapter'
import { CpMakerProvider } from '@features/cp-maker/provider'
import { usePlatformPorts } from './usePlatformPorts'

/** Props for CpMakerPlatformProvider. */
export type CpMakerPlatformProviderProps = {
  children: ReactNode
}

/** CP Maker platform Provider component: creates a CpMakerPort and injects it into CpMakerProvider. */
export function CpMakerPlatformProvider({ children }: CpMakerPlatformProviderProps) {
  const platformPorts = usePlatformPorts()
  const port = useMemo(() => createCpMakerPortAdapter(platformPorts), [platformPorts])

  return <CpMakerProvider port={port}>{children}</CpMakerProvider>
}
