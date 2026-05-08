import { type ReactNode } from 'react'
import type { LauncherPort } from '@features/launcher/model/launcherPort'
import { LauncherProvider } from '@features/launcher/model/launcherProvider'
import { createMockLauncherPort } from './launcherTestPort'

export type LauncherTestWrapperProps = {
  children: ReactNode
  port?: LauncherPort
}

export function LauncherTestWrapper({ children, port }: LauncherTestWrapperProps) {
  return <LauncherProvider port={port ?? createMockLauncherPort()}>{children}</LauncherProvider>
}
