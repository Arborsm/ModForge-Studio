import { describe, expect, it } from 'vite-plus/test'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { localeBundles } from '@locales/dictionaries'
import { getEditorCopy, getLauncherCopy, getModWorkspaceCopy, getSettingsMenuCopy, getViewMenuCopy } from '@locales/api/editor-shell'
import { LOADING_MOTION_INTENSITY_IDS, LOADING_MOTION_SPEED_IDS, LOADING_MOTION_STYLE_IDS } from '@shared/lib/loading-motion'

const localeDir = resolve(process.cwd(), 'src/locales')

/** All valid LocaleCode values, kept in sync with model/core.ts */
const ALL_LOCALE_CODES = ['zh-CN', 'en-US'] as const

/** Domain files that exist per language directory */
const DOMAIN_FILES = [
  'index.ts',
  'notifications.ts',
  'settings.ts',
  'launcher/index.ts',
  'launcher/shared.ts',
  'launcher/library.ts',
  'launcher/discover.ts',
  'launcher/updates.ts',
  'launcher/configuration.ts',
  'workbench/index.ts',
  'workbench/shell.ts',
  'workbench/map.ts',
  'workbench/studio-desk.ts',
  'workbench/mods.ts',
  'workbench/translation-editor.ts',
  'workbench/event-stage.ts',
  'workbench/characters.ts',
  'workbench/buildings.ts',
  'workbench/items.ts',
  'workbench/view-menu.ts',
  'workbench/world-atlas.ts',
]

describe('typed locale bundles', () => {
  it('registers a bundle for every LocaleCode', () => {
    const registered = Object.keys(localeBundles).sort()
    const expected = [...ALL_LOCALE_CODES].sort()
    expect(registered).toEqual(expected)
  })

  it('exposes locale copy through typed bundle accessors', () => {
    expect(getEditorCopy('en-US').messages.loadedMapAssets(3, 'xnb')).toBe('Loaded 3 XNB map assets.')
    expect(getEditorCopy('en-US').viewportLabels.zoomLabel(1.25)).toBe('Zoom 125%')
    expect(getModWorkspaceCopy('en-US').scanStatus(2)).toBe('2 mod projects detected.')
    expect(getModWorkspaceCopy('en-US').diagnosticsTitle).toBe('Project inspection')
    expect(getSettingsMenuCopy('en-US').languageLabel).toBe('Language')
    expect(getViewMenuCopy('en-US').resetLabel).toBe('Reset Default Layout')
    expect(getEditorCopy('en-US').shell.launcher).toBeTruthy()
    expect(getEditorCopy('en-US').launcher.pages.library).toBeTruthy()
    expect(getEditorCopy('zh-CN').launcher.pages.configuration).toBe('配置')
    expect(getEditorCopy('zh-CN').launcher.configuration.title).toBe('配置')
    expect(getEditorCopy('en-US').launcher.pages.configuration).toBe('Configuration')
    expect(getEditorCopy('en-US').launcher.configuration.title).toBe('Configuration')
    expect(getEditorCopy('zh-CN').launcher.diagnostics.apiKeySubtitle).toContain('API Key')
    expect(getEditorCopy('en-US').launcher.diagnostics.apiKeySubtitle).toContain('Nexus login')
  })

  it('keeps localized toolbar labels and panel titles inside the locale bundles', () => {
    const zhCN = getEditorCopy('zh-CN') as typeof getEditorCopy extends (...args: never[]) => infer T ? T : never

    expect(typeof (zhCN.center as Record<string, unknown>).previewGameWorldAdditions).toBe('string')
    expect(typeof (zhCN.center as Record<string, unknown>).hideGameWorldAdditions).toBe('string')
    expect(typeof (zhCN.center as Record<string, unknown>).showGrid).toBe('string')
    expect(typeof (zhCN.center as Record<string, unknown>).hideGrid).toBe('string')
    expect(typeof (zhCN.rightDock as Record<string, unknown>).objectGroupSummary).toBe('function')
    expect(typeof (zhCN.rightDock as Record<string, unknown>).objectGroupCollectionSummary).toBe('function')
    expect(typeof (zhCN.itemsPanel as Record<string, unknown>).filtersTitle).toBe('string')
  })

  it('keeps loading motion labels in settings locale bundles', () => {
    for (const locale of ALL_LOCALE_CODES) {
      const settings = getSettingsMenuCopy(locale)
      for (const id of LOADING_MOTION_STYLE_IDS) {
        expect(settings.loadingMotionStyleLabels[id]).toBeTruthy()
      }
      for (const id of LOADING_MOTION_INTENSITY_IDS) {
        expect(settings.loadingMotionIntensityLabels[id]).toBeTruthy()
      }
      for (const id of LOADING_MOTION_SPEED_IDS) {
        expect(settings.loadingMotionSpeedLabels[id]).toBeTruthy()
      }
    }

    expect(getSettingsMenuCopy('zh-CN').loadingMotionStyleLabels.bounceIn).toBe('跳动出现')
    expect(getSettingsMenuCopy('en-US').loadingMotionStyleLabels.bounceIn).toBe('Bounce In')
  })

  it('exposes Studio Desk copy in both locales', () => {
    expect(localeBundles['zh-CN'].editor.studioDesk.title).toBe('工作室桌面')
    expect(localeBundles['en-US'].editor.studioDesk.title).toBe('Studio Desk')
  })

  it('exposes runtime locale bundle formatter functions and mods copy without source inspection', () => {
    const enUS = localeBundles['en-US']
    const zhCN = localeBundles['zh-CN']

    expect(typeof enUS.editor.common.objectLabel).toBe('function')
    expect(typeof enUS.editor.messages.loadedMapAssets).toBe('function')
    expect(typeof enUS.editor.messages.loadedMapAssetsWithActiveMap).toBe('function')
    expect(typeof enUS.editor.viewportLabels.zoomLabel).toBe('function')
    expect(typeof enUS.editor.eventStage.cueLabel).toBe('function')
    expect(typeof enUS.mods.scanStatus).toBe('function')

    expect(enUS.editor.common.objectLabel(7)).toBe('Object 7')
    expect(enUS.editor.messages.loadedMapAssetsWithActiveMap(2, 'xnb', 'Town')).toBe('Loaded 2 XNB map assets. Town is active.')
    expect(enUS.editor.viewportLabels.zoomLabel(0.875)).toBe('Zoom 88%')
    expect(enUS.editor.eventStage.cueLabel('rain')).toBe('Cue: rain')
    expect(enUS.mods.scanStatus(4)).toBe('4 mod projects detected.')

    expect(typeof zhCN.editor.messages.detectedKnownPath).toBe('function')
    expect(typeof zhCN.editor.viewportLabels.failedToLoadTilesetImage).toBe('function')
    expect(typeof zhCN.editor.eventStage.stopCueLabel).toBe('function')
    expect(typeof zhCN.mods.saveSuccess).toBe('function')

    expect(zhCN.editor.messages.detectedKnownPath('D:/Games/SDV')).toContain('D:/Games/SDV')
    expect(zhCN.editor.viewportLabels.failedToLoadTilesetImage('Maps/farm')).toContain('Maps/farm')
    expect(zhCN.editor.eventStage.stopCueLabel('wind')).toContain('wind')
    expect(zhCN.mods.saveSuccess('D:/Mods/Example')).toContain('D:/Mods/Example')
  })

  it('exposes launcher library cover notifications and gallery copy in zh-CN', () => {
    const launcher = getLauncherCopy('zh-CN')

    expect(typeof launcher.actions.chooseGalleryCover).toBe('string')
    expect(typeof launcher.library.loadingMissingCoversTitle).toBe('string')
    expect(typeof launcher.library.loadingMissingCoversCurrentMod).toBe('function')
    expect(typeof launcher.library.loadingMissingCoversProgress).toBe('function')
    expect(typeof launcher.library.loadingMissingCoversStageProgress).toBe('function')
    expect(typeof launcher.library.loadingMissingCoversStages.local).toBe('string')
    expect(typeof launcher.library.galleryCoverTitle).toBe('string')
    expect(typeof launcher.library.galleryCoverSubtitle).toBe('string')
    expect(typeof launcher.library.galleryCoverEmpty).toBe('string')
    expect(typeof launcher.library.galleryCoverLoading).toBe('string')
    expect(typeof launcher.library.galleryCoverImageLabel).toBe('function')

    expect(launcher.library.loadingMissingCoversCurrentMod('Vanilla Plus Professions')).toContain('Vanilla Plus Professions')
    expect(launcher.library.loadingMissingCoversProgress(1, 3)).toContain('1')
    expect(launcher.library.loadingMissingCoversProgress(1, 3)).toContain('3')
    expect(launcher.library.loadingMissingCoversStageProgress(launcher.library.loadingMissingCoversStages.apiCover, 1, 3)).toContain('1')
    expect(launcher.library.galleryCoverImageLabel(2)).toContain('2')
  })

  it('keeps english auto-cover stage progress punctuation readable', () => {
    const launcher = getLauncherCopy('en-US')

    expect(launcher.library.loadingMissingCoversStageProgress(launcher.library.loadingMissingCoversStages.apiCover, 1, 3)).toBe(
      'API Cover · 1 / 3',
    )
  })

  it('keeps all domain locale files typechecked without ts-nocheck', async () => {
    for (const code of ALL_LOCALE_CODES) {
      for (const file of DOMAIN_FILES) {
        const filePath = join(localeDir, 'dictionaries', code, file)
        await expect(readFile(filePath, 'utf8')).resolves.not.toContain('@ts-nocheck')
      }
    }
  })
})
