import { describe, expect, it } from 'vite-plus/test'
import { render } from '@testing-library/react'
import { EventStageActorSprite } from '@pages/workbench/workspaces/event-stage/view/EventStageActorSprite'
import type { ActorAssetState, EventActorState } from '@entities/event'

function createActor(): EventActorState {
  return {
    id: 'actor-1',
    actorName: 'Abigail',
    tileX: 2,
    tileY: 3,
    offsetX: 0,
    offsetY: 0,
    visible: true,
    facingDirection: 2,
    frame: 0,
    directionalFlip: false,
    portraitOverrideSuffix: null,
    spriteOverrideSuffix: null,
    animation: null,
    movement: null,
    breatherOverride: null,
    shakeStartedAtMs: null,
    shakeDurationMs: 0,
    farmerPassesThrough: false,
    farmerRenderState: null,
  }
}

function createLoadingAsset(): ActorAssetState {
  return {
    requestKey: 'test',
    loading: true,
    textureName: null,
    spriteTextureName: null,
    portraitTextureName: null,
    spritePath: null,
    spriteUrl: null,
    spriteSheetWidth: null,
    spriteSheetHeight: null,
    portraitPath: null,
    portraitUrl: null,
    portraitSheetWidth: null,
    portraitSheetHeight: null,
    farmerAppearance: null,
    characterMetadata: null,
  }
}

describe('EventStageActorSprite loading skeleton', () => {
  it('renders a skeleton overlay while the actor asset is loading', () => {
    const { container } = render(
      <EventStageActorSprite
        actor={createActor()}
        asset={createLoadingAsset()}
        animationNowMs={0}
        frameWidth={16}
        frameHeight={32}
        spriteColumns={4}
        tileWidth={16}
        tileHeight={16}
        gamePixelScale={1}
        viewportZoom={4}
      />,
    )

    expect(container.querySelector('.image-skeleton')).toBeTruthy()
  })
})
