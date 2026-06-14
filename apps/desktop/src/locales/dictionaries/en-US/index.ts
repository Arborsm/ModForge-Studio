import type { LocaleBundle } from '../../model'
import editor from './workbench'
import { mods, modI18n, viewMenu, worldAtlasViews } from './workbench'
import notifications from './notifications'
import settingsMenu from './settings'

const localeBundle: LocaleBundle = {
  editor,
  mods,
  modI18n,
  notifications,
  worldAtlasViews,
  viewMenu,
  settingsMenu,
}

export default localeBundle
