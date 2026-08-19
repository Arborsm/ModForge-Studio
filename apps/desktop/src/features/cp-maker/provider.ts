/**
 * @file Lightweight cp-maker provider entry for app-level platform DI, kept
 * separate from the slice root so launcher startup does not pull the workbench graph.
 * @module features/cp-maker
 */
export type { CpMakerProviderProps } from './model/cpMakerProvider'
export { CpMakerProvider } from './model/cpMakerProvider'
export { useCpMakerPort } from './model/useCpMakerPort'
export type { CpMakerDraftRecord, CpMakerPort } from './model/cpMakerPort'
