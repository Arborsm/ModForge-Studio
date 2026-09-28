/**
 * @file React provider that mounts a CpMakerPort instance into context for
 * downstream hooks and components.
 * @module features/cp-maker
 */
import { type ReactNode } from 'react'
import type { CpMakerPort } from './cpMakerPort'
import { CpMakerPortContext } from './cpMakerPortContext'

/** Props for the CpMakerProvider component. */
export type CpMakerProviderProps = {
  children: ReactNode
  port: CpMakerPort
}

/** Provides a CpMakerPort to all children via React context. */
export function CpMakerProvider({ children, port }: CpMakerProviderProps) {
  return <CpMakerPortContext.Provider value={port}>{children}</CpMakerPortContext.Provider>
}
