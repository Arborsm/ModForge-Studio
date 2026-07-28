import { useItemAuthoringHandoff } from '@entities/item'
import { AuthoringRuntime } from './AuthoringRuntime'

/**
 * Item authoring host.
 *
 * A jump from the item codex — or a family switch inside the object editor —
 * names an asset, not a patch, so this runtime drains the first handoff phase:
 * it opens the patch for that asset and hands the second phase (selecting the
 * entry) back to the structured editor. Families with no structured editor stop
 * here, in the raw JSON escape hatch.
 */
export default function ItemAuthoringModuleRuntime() {
  const pendingTarget = useItemAuthoringHandoff((state) => state.pendingTarget)
  const patchOpened = useItemAuthoringHandoff((state) => state.patchOpened)

  return (
    <AuthoringRuntime workspaceId="items" pendingAssetTarget={pendingTarget?.assetId ?? null} onPendingAssetTargetOpened={patchOpened} />
  )
}
