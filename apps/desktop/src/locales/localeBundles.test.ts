import { describe, expect, it } from 'vitest'
import { localeBundles } from '.'
import {
  getEditorCopy,
  getLauncherCopy,
  getModWorkspaceCopy,
  getSettingsMenuCopy,
  getViewMenuCopy,
  getWorkspaceModeLabel,
} from '@locales/editor-shell'

describe('typed locale bundles', () => {
  it('exposes locale copy through typed bundle accessors', () => {
    expect(getEditorCopy('en-US').messages.loadedMapAssets(3, 'xnb')).toBe('Loaded 3 XNB map assets.')
    expect(getEditorCopy('en-US').viewportLabels.zoomLabel(1.25)).toBe('Zoom 125%')
    expect(getModWorkspaceCopy('en-US').scanStatus(2)).toBe('2 mod projects detected.')
    expect(getModWorkspaceCopy('en-US').targetDiagnosticsTitle).toBe('Target Diagnostics')
    expect(getModWorkspaceCopy('en-US').exportResultTitle).toBe('Export Result')
    expect(getSettingsMenuCopy('en-US').languageLabel).toBe('Language')
    expect(getViewMenuCopy('en-US').deletePresetConfirm('Alpha')).toContain('Alpha')
    expect(getViewMenuCopy('en-US').panelVisibleLabel).toBe('Visible')
    expect(getViewMenuCopy('en-US').deletePresetLabel).toBe('Delete preset')
    expect(getWorkspaceModeLabel('zh-CN', getEditorCopy('zh-CN'), 'mods')).toBe(
      getModWorkspaceCopy('zh-CN').workspaceLabel,
    )
    expect(getEditorCopy('en-US').shell.launcher).toBeTruthy()
    expect(getEditorCopy('en-US').launcher.pages.library).toBeTruthy()
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
    expect(typeof enUS.viewMenu.deletePresetConfirm).toBe('function')
    expect(typeof enUS.mods.scanStatus).toBe('function')

    expect(enUS.editor.common.objectLabel(7)).toBe('Object 7')
    expect(enUS.editor.messages.loadedMapAssetsWithActiveMap(2, 'xnb', 'Town')).toBe(
      'Loaded 2 XNB map assets. Town is active.',
    )
    expect(enUS.editor.viewportLabels.zoomLabel(0.875)).toBe('Zoom 88%')
    expect(enUS.editor.eventStage.cueLabel('rain')).toBe('Cue: rain')
    expect(enUS.viewMenu.deletePresetConfirm('Preset A')).toContain('Preset A')
    expect(enUS.mods.scanStatus(4)).toBe('4 mod projects detected.')

    expect(typeof zhCN.editor.messages.detectedKnownPath).toBe('function')
    expect(typeof zhCN.editor.viewportLabels.failedToLoadTilesetImage).toBe('function')
    expect(typeof zhCN.editor.eventStage.stopCueLabel).toBe('function')
    expect(typeof zhCN.mods.importedFrom).toBe('function')

    expect(zhCN.editor.messages.detectedKnownPath('D:/Games/SDV')).toContain('D:/Games/SDV')
    expect(zhCN.editor.viewportLabels.failedToLoadTilesetImage('Maps/farm')).toContain('Maps/farm')
    expect(zhCN.editor.eventStage.stopCueLabel('wind')).toContain('wind')
    expect(zhCN.mods.importedFrom('D:/Mods/Example')).toContain('D:/Mods/Example')
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

    expect(
      launcher.library.loadingMissingCoversStageProgress(launcher.library.loadingMissingCoversStages.apiCover, 1, 3),
    ).toBe('API Cover · 1 / 3')
  })
})
