import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { editorCopy } from '@locales/editor-shell'
import { renderWithLocale } from '../renderWithLocale'
import { DiagnosticsPanel } from '@pages/workbench/ui/workspace-panels/map/DiagnosticsPanel.tsx'
import { InspectorPanel } from '@pages/workbench/ui/workspace-panels/map/InspectorPanel.tsx'
import { LayersPanel } from '@pages/workbench/ui/workspace-panels/map/LayersPanel.tsx'

describe('right panels localization ownership', () => {
  it('reads shell copy from LocaleProvider instead of requiring copy props', () => {
    const copy = editorCopy['en-US']

    renderWithLocale(
      <>
        <InspectorPanel mapDocument={null} />
        <LayersPanel mapDocument={null} visibleLayerIds={[]} onToggleLayer={vi.fn()} onShowAllLayers={vi.fn()} onHideAllLayers={vi.fn()} />
        <DiagnosticsPanel
          directoryInfo={null}
          visibleLayerIds={[]}
          visibleObjectGroupIds={[]}
          workspaceStatus={{ tone: 'idle', message: '' }}
        />
      </>,
    )

    expect(screen.getAllByText(copy.center.noSceneLoaded).length).toBeGreaterThan(0)
    expect(screen.getByText(copy.rightDock.diagnosticsPrompt)).toBeInTheDocument()
  })
})
