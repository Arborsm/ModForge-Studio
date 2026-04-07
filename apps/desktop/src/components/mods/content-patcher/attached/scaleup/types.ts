export type ScaleUpBreathType = 'None' | 'Male' | 'Female'

export type ScaleUpImageDimensions = {
  width: number
  height: number
}

export type ScaleUpSpriteDraft = {
  breathType: ScaleUpBreathType
  spriteOriginX: number | null
  spriteOriginY: number | null
  chestSourceX: number | null
  chestSourceY: number | null
  chestSourceWidth: number | null
  chestSourceHeight: number | null
  chestAdjustX: number | null
  chestAdjustY: number | null
  headShotX: number | null
  headShotY: number | null
  headShotXRenderOffset: number | null
  headShotYRenderOffset: number | null
  miniMapXOffset: number | null
  miniMapYOffset: number | null
}

export type ScaleUpDraft = {
  key: string
  targetPath: string
  targetToken: string
  targetSource: {
    asset: string | null
    target: string | null
    assets: string[]
    assetsFormat: 'string' | 'array'
  }
  scale: number
  paddingWidth: number
  paddingHeight: number
  sprite: ScaleUpSpriteDraft | null
}

export type ScaleUpResolvedEntry = ScaleUpDraft & {
  patchIndex: number
  entryIndex: number | null
}

export type ScaleUpEditorState = {
  source: 'existing' | 'derived'
  draft: ScaleUpDraft
}
