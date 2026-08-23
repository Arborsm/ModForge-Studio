import { describe, expect, it } from 'vite-plus/test'

import { findProjectByUniqueIds } from '@features/compat-plugins/lib/resolveTargetModRoot'

const projects = [
  { uniqueId: 'PeacefulEnd.AlternativeTextures', absolutePath: '/mods/AlternativeTextures' },
  { uniqueId: 'Pathoschild.ContentPatcher', absolutePath: '/mods/ContentPatcher' },
  { uniqueId: null, absolutePath: '/mods/NoManifest' },
]

describe('findProjectByUniqueIds', () => {
  it('matches the current UniqueID', () => {
    expect(findProjectByUniqueIds(projects, ['PeacefulEnd.AlternativeTextures'])?.absolutePath).toBe('/mods/AlternativeTextures')
  })

  it('falls back to a historical UniqueID declared later in targets', () => {
    expect(
      findProjectByUniqueIds(projects, ['PeacefulAlternativeTextures.AlternativeTextures', 'PeacefulEnd.AlternativeTextures'])
        ?.absolutePath,
    ).toBe('/mods/AlternativeTextures')
  })

  it('prefers an earlier declared candidate when both match', () => {
    expect(findProjectByUniqueIds(projects, ['PeacefulEnd.AlternativeTextures', 'Pathoschild.ContentPatcher'])?.absolutePath).toBe(
      '/mods/AlternativeTextures',
    )
  })

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    expect(findProjectByUniqueIds(projects, ['  peacefulend.alternativetextures '])?.absolutePath).toBe('/mods/AlternativeTextures')
  })

  it('returns null when no candidate matches', () => {
    expect(findProjectByUniqueIds(projects, ['Missing.Mod'])).toBeNull()
  })

  it('returns null for an empty candidate list', () => {
    expect(findProjectByUniqueIds(projects, [])).toBeNull()
  })
})
