// @vitest-environment jsdom

import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import CharacterWorkspace from './CharacterWorkspace'
import { createCharacterEntryIndex, type CharacterVisualAssetState } from '../lib/app/characterWorkspace'
import { editorCopy } from '../lib/editor-shell'
import { renderWithLocale } from '../test/renderWithLocale'

const copy = editorCopy['en-US'].charactersPanel

function createCharacter() {
  const [entry] = createCharacterEntryIndex(
    JSON.stringify({
      Abigail: {
        DisplayName: 'Abigail',
        TextureName: 'Abigail',
        Size: { X: 16, Y: 32 },
        Breather: true,
      },
    }),
  )

  if (!entry) {
    throw new Error('expected character fixture entry')
  }

  return entry
}

function createAssetState(): CharacterVisualAssetState {
  return {
    spritePath: 'Content\\Characters\\Abigail.xnb',
    portraitPath: null,
    spriteUrl:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABhJREFUeNrswQEBAAAAgiD/r25IQAEAAAAAAAA8Bh4AAX1DMy8AAAAASUVORK5CYII=',
    portraitUrl: null,
    springObjectsPath: null,
    springObjectsUrl: null,
    spriteSheetWidth: 64,
    spriteSheetHeight: 32,
    portraitSheetWidth: null,
    portraitSheetHeight: null,
    springObjectsSheetWidth: null,
    springObjectsSheetHeight: null,
  }
}

describe('CharacterWorkspace', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not render the breathing hint copy beneath the breathing preview', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    const character = createCharacter()
    const assetState = createAssetState()

    renderWithLocale(
      <CharacterWorkspace
        character={character}
        activeVariant={character.variants[0] ?? null}
        assetState={assetState}
      />,
    )

    expect(screen.getByText(copy.breathingTitle)).toBeInTheDocument()
    expect(screen.queryByText(copy.breathHint)).not.toBeInTheDocument()
  })

  it('uses the original portrait sheet dimensions when a ScaleUp result sheet is larger than vanilla', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    const character = createCharacter()
    const assetState = {
      ...createAssetState(),
      portraitPath: 'Portraits\\Abigail',
      portraitUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABhJREFUeNrswQEBAAAAgiD/r25IQAEAAAAAAAA8Bh4AAX1DMy8AAAAASUVORK5CYII=',
      portraitSheetWidth: 512,
      portraitSheetHeight: 256,
      portraitOriginalWidth: 128,
      portraitOriginalHeight: 64,
    } as CharacterVisualAssetState & {
      portraitOriginalWidth: number
      portraitOriginalHeight: number
    }

    renderWithLocale(
      <CharacterWorkspace
        character={character}
        activeVariant={character.variants[0] ?? null}
        assetState={assetState}
      />,
    )

    expect(screen.getByText(`${copy.expressions}: 2`)).toBeInTheDocument()
    expect(screen.queryByText(`${copy.expressions}: 32`)).not.toBeInTheDocument()
  })

  it('scales oversized ScaleUp portrait previews down to the standard preview size', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    const character = createCharacter()
    const assetState = {
      ...createAssetState(),
      portraitPath: 'Portraits\\Abigail',
      portraitUrl:
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAABhJREFUeNrswQEBAAAAgiD/r25IQAEAAAAAAAA8Bh4AAX1DMy8AAAAASUVORK5CYII=',
      portraitSheetWidth: 512,
      portraitSheetHeight: 256,
      portraitOriginalWidth: 128,
      portraitOriginalHeight: 64,
    } as CharacterVisualAssetState & {
      portraitOriginalWidth: number
      portraitOriginalHeight: number
    }

    renderWithLocale(
      <CharacterWorkspace
        character={character}
        activeVariant={character.variants[0] ?? null}
        assetState={assetState}
      />,
    )

    const header = screen.getByText('#0').parentElement
    const previewFrame = header?.nextElementSibling?.firstElementChild as HTMLElement | null
    const previewLayer = previewFrame?.firstElementChild as HTMLElement | null

    expect(previewFrame?.style.width).toBe('128px')
    expect(previewFrame?.style.height).toBe('128px')
    expect(previewLayer?.style.transform).toBe('')
    expect(previewLayer?.style.backgroundSize).toBe('256px 128px')
  })
})
