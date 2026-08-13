import { isPlainObject, type AssetEntryDraft } from '@entities/asset-schema'

export type BuildingReadinessStepId = 'identity' | 'artwork' | 'placement' | 'construction' | 'cost' | 'interior' | 'upgrade'
export type BuildingReadinessStepStatus = 'complete' | 'needs-attention' | 'optional'

export type BuildingReadinessStep = {
  id: BuildingReadinessStepId
  status: BuildingReadinessStepStatus
}

export type BuildingReadiness = {
  ready: boolean
  completeRequired: number
  requiredCount: number
  steps: BuildingReadinessStep[]
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== ''
}

function hasPositiveSize(value: unknown): boolean {
  if (!isPlainObject(value)) {
    return false
  }
  return (
    typeof value['X'] === 'number' &&
    Number.isInteger(value['X']) &&
    value['X'] > 0 &&
    typeof value['Y'] === 'number' &&
    Number.isInteger(value['Y']) &&
    value['Y'] > 0
  )
}

/** Evaluates the author-facing tasks that make one building usable in game. */
export function evaluateBuildingReadiness(
  draft: AssetEntryDraft,
  { textureAvailable, errorCount }: { textureAvailable: boolean; errorCount: number },
): BuildingReadiness {
  const fields = draft.fields
  const identityReady = hasText(fields['Name']) && hasText(fields['Description'])
  const artworkReady = hasText(fields['Texture']) && textureAvailable
  const placementReady = hasPositiveSize(fields['Size'])
  const constructionReady = hasText(fields['Builder'])
  const hasCost =
    (typeof fields['BuildCost'] === 'number' && fields['BuildCost'] > 0) ||
    (Array.isArray(fields['BuildMaterials']) && fields['BuildMaterials'].length > 0)
  const hasInterior = hasText(fields['IndoorMap']) || hasText(fields['NonInstancedIndoorLocation'])
  const hasUpgrade = hasText(fields['BuildingToUpgrade'])

  const steps: BuildingReadinessStep[] = [
    { id: 'identity', status: identityReady ? 'complete' : 'needs-attention' },
    { id: 'artwork', status: artworkReady ? 'complete' : 'needs-attention' },
    { id: 'placement', status: placementReady ? 'complete' : 'needs-attention' },
    { id: 'construction', status: constructionReady ? 'complete' : 'needs-attention' },
    { id: 'cost', status: hasCost ? 'complete' : 'optional' },
    { id: 'interior', status: hasInterior ? 'complete' : 'optional' },
    { id: 'upgrade', status: hasUpgrade ? 'complete' : 'optional' },
  ]
  const required = steps.slice(0, 4)
  const completeRequired = required.filter((step) => step.status === 'complete').length

  return {
    ready: completeRequired === required.length && errorCount === 0,
    completeRequired,
    requiredCount: required.length,
    steps,
  }
}
