import type { EditorCopy } from '../../../model/workbench'
import launcher from '../launcher'
import shell from './shell'
import viewportLabels, { buildAssetDialog, mapPanel } from './map'
import studioDesk from './studio-desk'
import eventStage from './event-stage'
import charactersPanel from './characters'
import buildingsPanel from './buildings'
import itemsPanel from './items'
import moduleBlueprints from './module-blueprints'
import i18nGenerator from './i18n-generator'

const editor: EditorCopy = {
  ...shell,
  launcher,
  viewportLabels,
  buildAssetDialog,
  mapPanel,
  studioDesk,
  eventStage,
  charactersPanel,
  buildingsPanel,
  itemsPanel,
  moduleBlueprints,
  i18nGenerator,
}

export default editor

export { default as mods } from './mods'
export { default as modI18n } from './mod-i18n'
export { default as viewMenu } from './view-menu'
export { default as worldAtlasViews } from './world-atlas'
