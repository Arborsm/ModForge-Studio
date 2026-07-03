import type { LauncherDiscoverDetail, LauncherLibraryItem } from '../../../model/types'

export type LauncherDetailMod = Partial<LauncherLibraryItem> & {
  packName?: string | null
}

export type RemoteDependencyLoadState = {
  state: 'loading' | 'ready' | 'error'
  detail?: LauncherDiscoverDetail
  error?: string
}

export type DependencyTreeCopy = {
  localRequirement: string
  remoteRequirement: string
  externalRequirement: string
  modLoaderRequirement: string
  missing: string
  satisfied: string
  optional: string
  disabled: string
  dependencyIssue: string
  loading: string
  loadError: string
  cycle: string
}
