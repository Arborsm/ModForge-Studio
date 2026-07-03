import type { LauncherCopy } from '../../../model/launcher'
import shared from './shared'
import library from './library'
import discover from './discover'
import updates from './updates'
import configuration from './configuration'

const launcher: LauncherCopy = {
  ...shared,
  library,
  discover,
  updates,
  ...configuration,
}

export default launcher
