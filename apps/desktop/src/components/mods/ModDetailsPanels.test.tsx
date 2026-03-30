import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getModWorkspaceCopy } from '../../lib/plugins/copy'
import { ModDiagnosticsPanel } from './ModDiagnosticsPanel'
import { PatchInspectorPanel } from './PatchInspectorPanel'

const copy = getModWorkspaceCopy('en-US')

afterEach(() => {
  cleanup()
})

describe('PatchInspectorPanel', () => {
  it('shows an explicit empty state before a patch is selected', () => {
    render(
      <PatchInspectorPanel
        copy={copy}
        selectedPatch={null}
        patchWhenError={null}
        onPatchFieldChange={vi.fn()}
        onPatchWhenChange={vi.fn()}
        selectedNode={null}
      />,
    )

    expect(screen.getByText(copy.noPatch)).toBeTruthy()
    expect(screen.getByText('Select a node on the canvas to inspect its parameters.')).toBeTruthy()
  })

  it('edits patch fields through the structured form', () => {
    const onPatchFieldChange = vi.fn()

    render(
      <PatchInspectorPanel
        copy={copy}
        selectedPatch={{
          Action: 'EditImage',
          Target: 'Maps/spring_town',
          FromFile: 'assets/spring-town.png',
          LogName: 'Spring town',
          When: { Season: 'spring' },
        }}
        patchWhenError={null}
        onPatchFieldChange={onPatchFieldChange}
        onPatchWhenChange={vi.fn()}
        selectedNode={{
          id: 'action:patch:0',
          kind: 'action',
          position: { x: 0, y: 0 },
          data: {
            label: 'Spring town',
            patchId: 'patch:0',
            action: 'EditImage',
            target: 'Maps/spring_town',
            simulation: { isActive: true, hasUnknownConditions: false },
          },
        }}
      />,
    )

    fireEvent.change(screen.getByDisplayValue('Spring town'), {
      target: { value: 'Festival town' },
    })

    expect(onPatchFieldChange).toHaveBeenCalledWith('LogName', 'Festival town')
  })

  it('shows ToArea details when present on the patch', () => {
    render(
      <PatchInspectorPanel
        copy={copy}
        selectedPatch={{
          Action: 'EditImage',
          Target: 'Portraits/Abigail',
          FromFile: 'assets/abby.png',
          LogName: 'Abigail portrait',
          When: { Season: 'spring' },
          ToArea: { X: 0, Y: 0, Width: 16, Height: 16 },
        }}
        patchWhenError={null}
        onPatchFieldChange={vi.fn()}
        onPatchWhenChange={vi.fn()}
        selectedNode={{
          id: 'action:patch:1',
          kind: 'action',
          position: { x: 0, y: 0 },
          data: {
            label: 'Abigail portrait',
            patchId: 'patch:1',
            action: 'EditImage',
            target: 'Portraits/Abigail',
            simulation: { isActive: true, hasUnknownConditions: false },
          },
        }}
        patchPreview={JSON.stringify({
          Action: 'EditImage',
          Target: 'Portraits/Abigail',
          FromFile: 'assets/abby.png',
          LogName: 'Abigail portrait',
          When: { Season: 'spring' },
          ToArea: { X: 0, Y: 0, Width: 16, Height: 16 },
        }, null, 2)}
      />,
    )

    expect(screen.getByText('ToArea')).toBeTruthy()
    expect(screen.getByText('X')).toBeTruthy()
    expect(screen.getByText('Y')).toBeTruthy()
    expect(screen.getByText('W')).toBeTruthy()
    expect(screen.getByText('H')).toBeTruthy()
  })
})

describe('ModDiagnosticsPanel', () => {
  it('shows a concise status summary and actionable diagnostics', () => {
    render(
      <ModDiagnosticsPanel
        copy={copy}
        pluginDefinition={{
          id: 'content-patcher',
          pluginKind: 'content-patcher',
          capabilities: ['edit', 'save', 'export', 'validate'],
          futureScopes: ['wizard'],
          getDisplayName: () => 'Content Patcher',
          getDescription: () => 'Plugin',
        }}
        activeProject={{
          pluginKind: 'content-patcher',
          capabilities: ['edit', 'save', 'export', 'validate'],
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
          },
          diagnostics: [],
          contentPatcher: null,
        }}
        diagnostics={[
          {
            severity: 'warning',
            message: 'One patch uses a broad target.',
            field: 'Changes[1].Target',
          },
        ]}
        hasUnsavedChanges
        lastSaveResult={{
          pluginKind: 'content-patcher',
          targetPath: 'E:\\Exports\\SeasonalGarden',
          manifestPath: 'E:\\Exports\\SeasonalGarden\\manifest.json',
          contentPath: 'E:\\Exports\\SeasonalGarden\\content.json',
          diagnostics: [],
        }}
        statusMessage="Saved to E:\\Exports\\SeasonalGarden"
        contentSummary={{
          includeCount: 1,
          dynamicTokenCount: 2,
          configKeys: ['Season', 'Festival'],
        }}
      />,
    )

    expect(screen.getByText('Status Summary')).toBeTruthy()
    expect(screen.getByText((content) => content.includes('Saved to E:'))).toBeTruthy()
    expect(screen.getByText('One patch uses a broad target.')).toBeTruthy()
  })

  it('renders selectable manifest diagnostics as buttons', () => {
    const onSelectDiagnostic = vi.fn()

    render(
      <ModDiagnosticsPanel
        copy={copy}
        pluginDefinition={null}
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
        hasUnsavedChanges={false}
        lastSaveResult={null}
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

    expect(onSelectDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'manifest.Name' }),
    )
    expect(screen.getByRole('button', { name: /One patch uses a broad target/i })).toBeTruthy()
  })
})
