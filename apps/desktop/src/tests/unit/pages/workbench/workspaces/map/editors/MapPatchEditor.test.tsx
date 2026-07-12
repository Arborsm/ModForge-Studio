import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { CpMakerDraft, DraftPatch } from '@features/cp-maker'
import { MapPatchEditor } from '@pages/workbench/workspaces/map/editors/MapPatchEditor'
import { renderWithLocale } from '@test/renderWithLocale'

const patch: DraftPatch = {
  id: 'map-1',
  workspace: 'map',
  action: 'EditMap',
  target: 'Maps/Town',
  logName: 'Town update',
  enabled: true,
  editorState: {},
}

const draft = {
  projectMetadata: { gameRootPath: null },
  virtualAssets: [],
} as unknown as CpMakerDraft

describe('MapPatchEditor', () => {
  it('uses localized controls and writes map property edits to the draft patch', () => {
    const onPatchChange = vi.fn()
    renderWithLocale(<MapPatchEditor patch={patch} draft={draft} onPatchChange={onPatchChange} onAddVirtualAsset={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Map properties' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Source file' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add property' }))
    fireEvent.change(screen.getByPlaceholderText('Property'), { target: { value: 'Music' } })

    expect(onPatchChange).toHaveBeenCalledWith('map-1', {
      editorState: { properties: { Music: '' } },
    })
  })
})
