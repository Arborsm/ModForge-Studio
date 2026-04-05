import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { editorCopy } from '../../lib/editor-shell'
import { renderWithLocale } from '../renderWithLocale'
import { DiagnosticsPanel } from '../../components/panels/right/DiagnosticsPanel'
import { InspectorPanel } from '../../components/panels/right/InspectorPanel'
import { LayersPanel } from '../../components/panels/right/LayersPanel'

describe('right panels localization ownership', () => {
  it('reads shell copy from LocaleProvider instead of requiring copy props', () => {
    const copy = editorCopy['en-US']

    renderWithLocale(
      <>
        <InspectorPanel mapDocument={null} />
        <LayersPanel
          mapDocument={null}
          visibleLayerIds={[]}
          onToggleLayer={vi.fn()}
          onShowAllLayers={vi.fn()}
          onHideAllLayers={vi.fn()}
        />
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
