import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { editorCopy } from '../../../lib/editor-shell'
import type { LauncherSettings } from '../../../lib/desktop'
import { renderWithLocale } from '../../../test/renderWithLocale'
import { LauncherDiscoverPage } from './LauncherDiscoverPage'

const copy = editorCopy['zh-CN'].launcher

function createSettings(overrides: Partial<LauncherSettings> = {}): LauncherSettings {
  return {
    gamePath: null,
    modsPath: null,
    downloadPath: null,
    nexusApiKey: null,
    nexusCookie: null,
    autoInstallDownloads: false,
    keepDownloadedArchives: false,
    ...overrides,
  }
}

describe('LauncherDiscoverPage', () => {
  afterEach(() => {
    cleanup()
  })

  it('surfaces the credentials hint when direct downloads cannot start yet', () => {
    renderWithLocale(
      <LauncherDiscoverPage settings={createSettings()} onQueueDownload={vi.fn()} />,
      'zh-CN',
    )

    expect(screen.getByText(copy.states.credentialsRequired)).toBeTruthy()
    expect(screen.getByText(copy.discover.credentialsHint)).toBeTruthy()
  })
})
