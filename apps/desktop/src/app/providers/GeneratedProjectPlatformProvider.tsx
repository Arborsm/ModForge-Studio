import { useMemo, type ReactNode } from 'react'
import { usePlatformPorts } from './usePlatformPorts'
import { createGeneratedProjectPortAdapter } from './generatedProjectPortAdapter'
import { GeneratedProjectProvider } from '@features/generated-project'

export type GeneratedProjectPlatformProviderProps = {
  children: ReactNode
}

export function GeneratedProjectPlatformProvider({ children }: GeneratedProjectPlatformProviderProps) {
  const platformPorts = usePlatformPorts()

  const port = useMemo(
    () => createGeneratedProjectPortAdapter(platformPorts),
    [platformPorts],
  )

  return <GeneratedProjectProvider port={port}>{children}</GeneratedProjectProvider>
}
