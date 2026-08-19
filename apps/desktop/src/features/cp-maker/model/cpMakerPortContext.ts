import { createContext } from 'react'
import type { CpMakerPort } from './cpMakerPort'

/** React context holding the active CpMakerPort instance, or null when no provider is mounted. */
export const CpMakerPortContext = createContext<CpMakerPort | null>(null)
