import type { LocaleBundle } from '../../model'
import editor from './workbench'
import { mods, translationEditor, viewMenu, worldAtlasViews } from './workbench'
import guides from './guides'
import notifications from './notifications'
import settingsMenu from './settings'

const localeBundle: LocaleBundle = {
  editor,
  mods,
  translationEditor,
  guides,
  notifications,
  worldAtlasViews,
  viewMenu,
  settingsMenu,
}

export default localeBundle
