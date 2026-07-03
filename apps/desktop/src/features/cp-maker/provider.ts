/**
 * Lightweight cp-maker provider entry for app-level platform DI.
 * Keep UI, editor model, and registry exports in the slice root so launcher startup does not pull the workbench graph.
 */
export type { CpMakerProviderProps } from './model/cpMakerProvider'
export { CpMakerProvider } from './model/cpMakerProvider'
export { useCpMakerPort } from './model/useCpMakerPort'
export type { CpMakerDraftRecord, CpMakerPort } from './model/cpMakerPort'
