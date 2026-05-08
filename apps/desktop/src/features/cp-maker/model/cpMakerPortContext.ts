import { createContext } from 'react'
import type { CpMakerPort } from './cpMakerPort'

export const CpMakerPortContext = createContext<CpMakerPort | null>(null)
