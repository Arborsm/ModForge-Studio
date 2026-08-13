import type { EditorCopy } from '../../../model/workbench'
import launcher from '../launcher'
import shell from './shell'
import viewportLabels, { buildAssetDialog, mapAuthoring, mapPanel } from './map'
import studioDesk from './studio-desk'
import eventStage from './event-stage'
import charactersPanel from './characters'
import buildingDataEditor from './building-data'
import characterDataEditor from './character-data'
import itemDataEditor from './item-data'
import assetAuthoring from './asset-authoring'
import buildingsPanel from './buildings'
import itemsPanel from './items'
import i18nGenerator from './i18n-generator'
import aiLocalization from './ai-localization'
import dialogueEditor from './dialogue'
import dialogueScriptField from './dialogue-script'
import scheduleEditor from './schedule'
import mailEditor from './mail'
import gameDebugger from './debugger'
import { authoringShell } from './authoring-shell'
import assetLibrary from './asset-library'
import resourceBrowser from './resource-browser'
import audioPanel from './audio'

const editor: EditorCopy = {
  ...shell,
  launcher,
  viewportLabels,
  buildAssetDialog,
  mapPanel,
  mapAuthoring,
  studioDesk,
  eventStage,
  charactersPanel,
  characterDataEditor,
  buildingDataEditor,
  itemDataEditor,
  assetAuthoring,
  buildingsPanel,
  itemsPanel,
  i18nGenerator,
  aiLocalization,
  dialogueEditor,
  dialogueScriptField,
  scheduleEditor,
  mailEditor,
  gameDebugger,
  authoringShell,
  assetLibrary,
  resourceBrowser,
  audioPanel,
}

export default editor

export { default as mods } from './mods'
export { default as translationEditor } from './translation-editor'
export { default as viewMenu } from './view-menu'
export { default as worldAtlasViews } from './world-atlas'
