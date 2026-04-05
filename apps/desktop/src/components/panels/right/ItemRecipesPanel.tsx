import { useItemsCopy } from '../../../lib/app/localeContext'
import type { ItemWorkspaceEntry } from '../../../lib/app/itemWorkspace'
import { PanelFrame } from '../../ui/PanelFrame'
import { PanelEmptyState, PanelSection } from '../../ui/PanelSection'

type ItemRecipesPanelProps = {
  item: ItemWorkspaceEntry | null
}

export function ItemRecipesPanel({ item }: ItemRecipesPanelProps) {
  const copy = useItemsCopy()
  return (
    <PanelFrame title={copy.recipesPanelTitle} subtitle={copy.recipesPanelSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 p-3">
        {!item ? (
          <PanelEmptyState>{copy.recipesPanelEmpty}</PanelEmptyState>
        ) : (
          <>
            <PanelSection title={copy.recipeOutputTitle} bodyClassName="space-y-2">
                {item.recipesProduced.length ? (
                  item.recipesProduced.map((recipe) => (
                    <div key={recipe.key} className="panel-list-card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{recipe.displayName}</p>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">{recipe.unlockLabel}</p>
                        </div>
                        <span className="dock-chip">x{recipe.outputCount}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">{copy.noneLabel}</p>
                )}
            </PanelSection>

            <PanelSection title={copy.recipeInputTitle} bodyClassName="space-y-2">
                {item.recipesUsing.length ? (
                  item.recipesUsing.map((recipe) => (
                    <div key={recipe.key} className="panel-list-card">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{recipe.displayName}</p>
                      <div className="mt-2 flex items-center justify-between gap-3">
                        <p className="text-xs text-[var(--text-secondary)]">
                          {recipe.kind === 'crafting' ? copy.craftingRecipeLabel : copy.cookingRecipeLabel}
                        </p>
                        <span className="dock-chip">{recipe.ingredients.length}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--text-secondary)]">{copy.noneLabel}</p>
                )}
            </PanelSection>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
