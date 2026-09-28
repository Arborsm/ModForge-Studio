import { describe, expect, it } from 'vite-plus/test'
import { selectEditorKind } from '@pages/workbench/model/editorRouting'

describe('selectEditorKind', () => {
  it('routes EditData targets by exact asset id', () => {
    expect(selectEditorKind({ action: 'EditData', target: 'Data/Characters' })).toBe('character-data')
    expect(selectEditorKind({ action: 'EditData', target: 'data\\characters' })).toBe('character-data')
  })

  it('does not spill an exact route onto neighbouring asset ids', () => {
    expect(selectEditorKind({ action: 'EditData', target: 'Data/CharactersExtra' })).toBe('raw')
    expect(selectEditorKind({ action: 'EditData', target: 'Data/Characters/Aspen' })).toBe('raw')
  })

  it('routes the per-location event asset family by prefix', () => {
    expect(selectEditorKind({ action: 'EditData', target: 'Data/Events/Farm' })).toBe('events')
    expect(selectEditorKind({ action: 'EditData', target: 'Data/Events/Town' })).toBe('events')
  })

  it('routes the building data asset to its own editor', () => {
    expect(selectEditorKind({ action: 'EditData', target: 'Data/Buildings' })).toBe('building-data')
    expect(selectEditorKind({ action: 'EditData', target: 'data\\buildings' })).toBe('building-data')
  })

  it('falls back to the raw escape hatch for data assets without an editor', () => {
    for (const target of ['Data/mail', 'Strings/StringsFromCSFiles']) {
      expect(selectEditorKind({ action: 'EditData', target })).toBe('raw')
    }
  })

  it('routes map changes and image patches by action regardless of target', () => {
    expect(selectEditorKind({ action: 'EditMap', target: 'Maps/Town' })).toBe('map-patch')
    expect(selectEditorKind({ action: 'EditMap', target: 'Data/Characters' })).toBe('map-patch')
    expect(selectEditorKind({ action: 'EditImage', target: 'Portraits/Abigail' })).toBe('image')
    expect(selectEditorKind({ action: 'EditImage', target: 'Data/Characters' })).toBe('image')
  })

  it('routes every whole-file Load patch to the read-only binding summary', () => {
    expect(selectEditorKind({ action: 'Load', target: 'Portraits/{{ModId}}_Aspen' })).toBe('load-summary')
    expect(selectEditorKind({ action: 'Load', target: 'Characters/{{ModId}}_Aspen' })).toBe('load-summary')
    expect(selectEditorKind({ action: 'Load', target: 'Data/Characters' })).toBe('load-summary')
    expect(selectEditorKind({ action: 'Load', target: 'Maps/Custom_Shop' })).toBe('load-summary')
    expect(selectEditorKind({ action: 'Load', target: 'maps\\springobjects' })).toBe('load-summary')
    expect(selectEditorKind({ action: 'Load', target: 'Maps/Town, Maps/Forest' })).toBe('load-summary')
    expect(selectEditorKind({ action: 'Load', target: 'Maps/{{ModId}}_Tiles' })).toBe('load-summary')
    expect(selectEditorKind({ action: 'Load', target: 'Audio/NewCue' })).toBe('load-summary')
    expect(selectEditorKind({ action: 'Load', target: '' })).toBe('load-summary')
  })

  it('sends Include patches to the raw escape hatch', () => {
    expect(selectEditorKind({ action: 'Include', target: '' })).toBe('raw')
  })
})
