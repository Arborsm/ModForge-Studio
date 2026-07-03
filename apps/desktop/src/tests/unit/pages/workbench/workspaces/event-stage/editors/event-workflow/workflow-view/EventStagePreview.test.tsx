import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, test, vi } from 'vite-plus/test'
import { useEffect, type ComponentProps, type ReactNode } from 'react'
import { parseEventCommand, parseEventCommands, parseEventSceneSetup, type EventScript } from '@entities/event'
import { LocaleProvider } from '@locales/provider'
import { renderWithLocale } from '@test/renderWithLocale'
import { EventStagePreview } from '@pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventStagePreview'
import { createEventStagePreviewTestAssetLoader } from '@test/eventStagePreviewTestAssets'

vi.mock('@entities/map', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@entities/map')>()
  return {
    ...actual,
    MapViewport: ({
      mapOverlay,
      viewportOverlay,
      onZoomChange,
      onTileClick,
    }: {
      mapOverlay?: ReactNode
      viewportOverlay?: ReactNode
      onZoomChange?: (zoom: number, mode: 'fit' | 'manual') => void
      onTileClick?: (tileX: number, tileY: number) => void
    }) => {
      useEffect(() => {
        onZoomChange?.(2.5, 'manual')
      }, [onZoomChange])
      return (
        <div>
          <button type="button" onClick={() => onTileClick?.(13, 45)}>
            Tile 13 45
          </button>
          <div data-testid="map-overlay">{mapOverlay}</div>
          <div>{viewportOverlay}</div>
        </div>
      )
    },
  }
})

function eventScript(rawScript: string, key = '900001'): EventScript {
  const rawSegments = parseEventCommands(rawScript)
  return {
    key,
    eventId: key,
    preconditions: ['900001'],
    rawScript,
    rawSegments,
    scene: parseEventSceneSetup(rawSegments),
    commands: rawSegments.slice(3).map((rawCommand, index) => parseEventCommand(rawCommand, index)),
  }
}

function renderPreview(props: Partial<ComponentProps<typeof EventStagePreview>> = {}) {
  return renderWithLocale(
    <EventStagePreview
      eventScript={eventScript('spring/follow/Abigail 12 45 2/move Abigail 1 0 1/end dialogue')}
      mapName="Town"
      gameRootPath="E:\\Games\\Stardew Valley"
      hideHeader
      assetLoader={createEventStagePreviewTestAssetLoader()}
      {...props}
    />,
  )
}

describe('EventStagePreview playback authoring surface', () => {
  test('reuses the stage playback toolbar controls inside the graphical editor preview', async () => {
    renderPreview()

    expect(await screen.findByRole('button', { name: 'Step' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Fit map' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show Paths layer' })).toBeTruthy()
  })

  test('keeps tile picking active while playback controls are present', async () => {
    const onTileClick = vi.fn()
    renderPreview({ onTileClick })

    fireEvent.click(screen.getByRole('button', { name: 'Tile 13 45' }))

    expect(onTileClick).toHaveBeenCalledWith(13, 45)
  })

  test('renders editor actors with the same viewport-scaled coordinates as the stage player', async () => {
    const { container } = renderPreview()

    await waitFor(() => expect(container.querySelector('[data-event-stage-actor="Abigail"]')).toBeTruthy())
    const actorFrame = container.querySelector('[data-event-stage-actor="Abigail"]') as HTMLElement

    expect(actorFrame?.style.transform).toBe('translate(480px, 1760px)')
    expect(actorFrame?.style.width).toBe('40px')
    expect(actorFrame?.style.height).toBe('80px')
    await waitFor(() => {
      expect((container.querySelector('[data-event-stage-actor-sprite="Abigail"]') as HTMLElement | null)?.style.transformOrigin).toBe(
        'top left',
      )
    })
  })

  test('steps playback commands into the rendered actor state', async () => {
    const { container } = renderPreview({
      eventScript: eventScript('spring/follow/Abigail 12 45 2/move Abigail 1 0 1/end dialogue'),
    })

    await waitFor(() => expect(container.querySelector('[data-event-stage-actor="Abigail"]')).toBeTruthy())

    fireEvent.click(await screen.findByRole('button', { name: 'Step' }))

    await waitFor(() => {
      const actorFrame = container.querySelector('[data-event-stage-actor="Abigail"]') as HTMLElement
      expect(actorFrame.style.transform).not.toBe('translate(480px, 1800px)')
    })
  })

  test('renders player scene actors through the farmer sprite pipeline', async () => {
    const onActorAssetsChange = vi.fn()
    const { container } = renderPreview({
      eventScript: eventScript('spring/follow/player 12 45 2/farmerAnimation 7/end dialogue'),
      onActorAssetsChange,
    })

    await waitFor(() => expect(container.querySelector('[data-event-stage-actor="player"]')).toBeTruthy())
    await waitFor(() => {
      expect(onActorAssetsChange).toHaveBeenCalledWith(
        expect.objectContaining({
          player: expect.objectContaining({
            spriteUrl: expect.any(String),
          }),
        }),
      )
    })
  })

  test('refreshes the stage actor state when the selected event changes', async () => {
    const { container, rerender } = renderPreview({
      eventScript: eventScript('spring/follow/Abigail 12 45 2/end dialogue', 'event_abigail'),
    })

    await waitFor(() => expect(container.querySelector('[data-event-stage-actor="Abigail"]')).toBeTruthy())

    rerender(
      <LocaleProvider locale="en-US">
        <EventStagePreview
          eventScript={eventScript('spring/follow/Sebastian 3 8 2/end dialogue', 'event_sebastian')}
          mapName="Town"
          gameRootPath="E:\\Games\\Stardew Valley"
          hideHeader
          assetLoader={createEventStagePreviewTestAssetLoader()}
        />
      </LocaleProvider>,
    )

    await waitFor(() => expect(container.querySelector('[data-event-stage-actor="Sebastian"]')).toBeTruthy())
    expect(container.querySelector('[data-event-stage-actor="Abigail"]')).toBeNull()
  })
})
