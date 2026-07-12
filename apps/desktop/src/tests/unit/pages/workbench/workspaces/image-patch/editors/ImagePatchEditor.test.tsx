import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { renderWithLocale } from '@test/renderWithLocale'
import { ImagePatchEditor } from '@pages/workbench/workspaces/image-patch/editors/ImagePatchEditor'
import type { CpMakerDraft, DraftPatch } from '@features/cp-maker'

const patch: DraftPatch = {
  id: 'image-1',
  workspace: 'characters',
  action: 'EditImage',
  target: 'Characters/Abigail',
  fromFile: undefined,
  logName: 'Portrait update',
  enabled: true,
  editorState: { patchMode: 'Replace', fromArea: null, toArea: null },
}

describe('ImagePatchEditor', () => {
  it('edits image patch mode and areas through localized controls', () => {
    const onPatchChange = vi.fn()
    renderWithLocale(
      <ImagePatchEditor
        patch={patch}
        draft={{ virtualAssets: [] } as unknown as CpMakerDraft}
        onPatchChange={onPatchChange}
        onAddVirtualAsset={vi.fn()}
      />,
    )

    expect(screen.getByText('Click or drag an image here')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Overlay' } })
    expect(onPatchChange).toHaveBeenCalledWith('image-1', {
      editorState: expect.objectContaining({ patchMode: 'Overlay' }),
    })

    const areaInputs = screen.getAllByPlaceholderText('0')
    fireEvent.change(areaInputs[0]!, { target: { value: '12' } })
    expect(onPatchChange).toHaveBeenCalledWith('image-1', {
      editorState: expect.objectContaining({ fromArea: { x: 12, y: 0, width: 0, height: 0 } }),
    })
  })
})
