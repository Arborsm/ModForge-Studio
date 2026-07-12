import { cleanup, fireEvent, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { renderWithLocale } from '@test/renderWithLocale'
import { ModDiagnosticsPanel } from '@pages/workbench/workspaces/mod/mods/content-patcher/content-view/ModDiagnosticsPanel'

afterEach(() => {
  cleanup()
})

describe('ModDiagnosticsPanel', () => {
  it('shows a concise status summary and actionable diagnostics', () => {
    renderWithLocale(
      <ModDiagnosticsPanel
        activeProject={{
          pluginKind: 'content-patcher',
          summary: {
            id: 'seasonal-garden',
            name: 'Seasonal Garden',
            author: 'Aly',
            version: '1.2.0',
            description: 'A patch-heavy content pack',
            uniqueId: 'Aly.SeasonalGarden',
            contentPackFor: 'Pathoschild.ContentPatcher',
            folderName: 'SeasonalGarden',
            pluginKind: 'content-patcher',
            absolutePath: 'E:\\Mods\\SeasonalGarden',
            manifestPath: 'E:\\Mods\\SeasonalGarden\\manifest.json',
            contentPath: 'E:\\Mods\\SeasonalGarden\\content.json',
            status: 'ready',
            missingRequiredDependencies: [],
            hasI18n: false,
            i18nEntryCount: 0,
          },
          diagnostics: [],
          contentPatcher: null,
          i18nFiles: [],
        }}
        diagnostics={[
          {
            severity: 'warning',
            message: 'One patch uses a broad target.',
            field: 'Changes[1].Target',
          },
        ]}
        statusMessage="Saved to E:\\Exports\\SeasonalGarden"
        contentSummary={{
          includeCount: 1,
          dynamicTokenCount: 2,
          configKeys: ['Season', 'Festival'],
        }}
      />,
    )

    expect(screen.getByText('Status summary')).toBeTruthy()
    expect(screen.getByText((content) => content.includes('Saved to E:'))).toBeTruthy()
    expect(screen.getByText('One patch uses a broad target.')).toBeTruthy()
  })

  it('renders selectable manifest diagnostics as buttons', () => {
    const onSelectDiagnostic = vi.fn()

    renderWithLocale(
      <ModDiagnosticsPanel
        activeProject={null}
        diagnostics={[
          {
            severity: 'error',
            message: 'Missing manifest name.',
            field: 'manifest.Name',
          },
          {
            severity: 'warning',
            message: 'One patch uses a broad target.',
            field: 'Changes[1].Target',
          },
        ]}
        statusMessage=""
        contentSummary={{
          includeCount: 0,
          dynamicTokenCount: 0,
          configKeys: [],
        }}
        onSelectDiagnostic={onSelectDiagnostic}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Missing manifest name/i }))

    expect(onSelectDiagnostic).toHaveBeenCalledWith(expect.objectContaining({ field: 'manifest.Name' }))
    expect(screen.getByRole('button', { name: /One patch uses a broad target/i })).toBeTruthy()
  })
})
