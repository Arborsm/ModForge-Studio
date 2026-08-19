/**
 * @file Platform ports React Context definition.
 */
import { createContext } from 'react'
import type { PlatformPorts } from '@shared/contracts'

/** Platform ports Context, injected by PlatformProvider. */
export const PlatformContext = createContext<PlatformPorts | null>(null)
