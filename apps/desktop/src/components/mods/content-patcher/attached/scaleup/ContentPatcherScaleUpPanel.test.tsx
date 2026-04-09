import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderWithLocale } from '../../../../../test/renderWithLocale'
import { ContentPatcherScaleUpPanel } from './ContentPatcherScaleUpPanel'

vi.mock('../../../../../lib/imageMetrics', () => ({
  measureImageDimensions: vi.fn(async (url: string) => {
    if (url === 'result-url') {
      return { width: 276, height: 516 }
    }

    if (url === 'original-url') {
      return { width: 64, height: 128 }
    }

    return { width: 256, height: 512 }
  }),
}))

afterEach(() => {
  cleanup()
})

describe('ContentPatcherScaleUpPanel', () => {
  it('derives ScaleUp defaults, renders preview tabs, and writes content updates from settings', async () => {
    const onContentChange = vi.fn()

    renderWithLocale(
      <ContentPatcherScaleUpPanel
        targetPath="Characters/Lewis"
        focusSection="settings"
        content={{
          Format: '2.0.0',
          Changes: [],
        }}
        resultImageDataUrl="result-url"
        originalImageDataUrl="original-url"
        onContentChange={onContentChange}
        onClose={vi.fn()}
      />,
    )

    expect((await screen.findByRole('button', { name: 'Parameter Settings' })).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Headshot Preview')).toBeTruthy()
    expect(screen.getByText('Minimap Preview')).toBeTruthy()

    const scaleInput = await screen.findByLabelText('Scale')
    await waitFor(() => {
      expect((scaleInput as HTMLInputElement).value).toBe('4')
    })

    fireEvent.change(scaleInput, { target: { value: '5' } })

    await waitFor(() => {
      expect(onContentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          Changes: expect.arrayContaining([
            expect.objectContaining({
              Target: '{{Arborsm.ScaleUpUnofficial/Assets}}',
              Entries: expect.objectContaining({
                'ModForge.ScaleUp.Characters.Lewis': expect.objectContaining({
                  Asset: 'Characters/Lewis',
                  Scale: 5,
                  PaddingWidth: 20,
                  PaddingHeight: 4,
                }),
              }),
            }),
          ]),
        }),
      )
    })
  })

  it('loads existing alias-backed entries and applies breath presets from the settings form', async () => {
    const onContentChange = vi.fn()

    renderWithLocale(
      <ContentPatcherScaleUpPanel
        targetPath="Characters/Lewis"
        focusSection="settings"
        content={{
          Format: '2.0.0',
          Changes: [
            {
              Action: 'EditData',
              Target: '{{Platonymous.ScaleUp/Assets}}',
              Entries: {
                'Playtonymous.Lewis': {
                  Asset: 'Characters/Lewis',
                  Scale: 4,
                  PaddingWidth: 0,
                  PaddingHeight: 0,
                  Sprite: {
                    BreathType: 'None',
                    HeadShotX: 12,
                    HeadShotY: 58,
                  },
                },
              },
            },
          ],
        }}
        resultImageDataUrl="result-url"
        originalImageDataUrl="original-url"
        onContentChange={onContentChange}
        onClose={vi.fn()}
      />,
    )

    expect((await screen.findByLabelText('Scale') as HTMLInputElement).value).toBe('4')

    fireEvent.change(screen.getByLabelText('Breath Type'), { target: { value: 'Female' } })

    await waitFor(() => {
      expect((screen.getByLabelText('Chest Source Y') as HTMLInputElement).value).toBe('100')
    })

    expect(onContentChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        Changes: expect.arrayContaining([
          expect.objectContaining({
            Target: '{{Platonymous.ScaleUp/Assets}}',
            Entries: expect.objectContaining({
              'Playtonymous.Lewis': expect.objectContaining({
                Sprite: expect.objectContaining({
                  BreathType: 'Female',
                  ChestSourceX: 24,
                  ChestSourceY: 100,
                  ChestSourceWidth: 16,
                  ChestSourceHeight: 8,
                  ChestAdjustX: 0,
                  ChestAdjustY: -4,
                }),
              }),
            }),
          }),
        ]),
      }),
    )
  })
})
