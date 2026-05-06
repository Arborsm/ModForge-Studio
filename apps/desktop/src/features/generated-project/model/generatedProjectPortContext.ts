import { createContext } from 'react'
import type { GeneratedProjectPort } from './generatedProjectPort'

export const GeneratedProjectPortContext = createContext<GeneratedProjectPort | null>(null)
