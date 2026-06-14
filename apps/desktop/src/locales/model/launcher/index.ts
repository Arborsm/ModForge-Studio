import type { LauncherSharedCopy } from './shared'
import type { LauncherLibraryCopy } from './library'
import type { LauncherDiscoverCopy } from './discover'
import type { LauncherUpdatesCopy } from './updates'
import type { LauncherConfigurationCopy } from './configuration'

export type { LauncherSharedCopy, LauncherLibraryCopy, LauncherDiscoverCopy, LauncherUpdatesCopy, LauncherConfigurationCopy }

export type LauncherCopy = LauncherSharedCopy & {
  library: LauncherLibraryCopy
  discover: LauncherDiscoverCopy
  updates: LauncherUpdatesCopy
} & LauncherConfigurationCopy
