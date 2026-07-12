import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { GenericPatchEditor } from '@features/cp-maker/ui/GenericPatchEditor'
import { renderWithLocale } from '@test/renderWithLocale.tsx'
import type { CpMakerDraft, DraftPatch } from '@features/cp-maker'

const patch: DraftPatch = {
  id: 'generic',
  workspace: 'mods',
  target: 'Data/Objects',
  action: 'EditData',
  logName: 'Objects',
  enabled: true,
  editorState: { Entries: { Example: { Name: 'Example' } } },
}

const draft = { patches: [patch] } as CpMakerDraft

describe('GenericPatchEditor', () => {
  it('edits core fields and only commits valid JSON objects', () => {
    const onPatchChange = vi.fn()
    renderWithLocale(<GenericPatchEditor patch={patch} draft={draft} onPatchChange={onPatchChange} onAddVirtualAsset={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Patch name'), { target: { value: 'Renamed' } })
    expect(onPatchChange).toHaveBeenCalledWith('generic', { logName: 'Renamed' })

    const json = screen.getByLabelText('Patch fields (JSON)')
    fireEvent.change(json, { target: { value: '{' } })
    expect(screen.getByText('Enter a valid JSON object before saving.')).toBeInTheDocument()
    fireEvent.change(json, { target: { value: '{"Entries":{}}' } })
    expect(onPatchChange).toHaveBeenCalledWith('generic', { editorState: { Entries: {} } })
  })
})
