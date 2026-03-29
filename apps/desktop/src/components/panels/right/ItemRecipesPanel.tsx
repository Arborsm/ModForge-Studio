import type { ItemsPanelCopy } from '../../../lib/editor-shell'
import type { ItemWorkspaceEntry } from '../../../lib/app/itemWorkspace'
import { PanelFrame } from '../../ui/PanelFrame'

type ItemRecipesPanelProps = {
  copy: ItemsPanelCopy
  item: ItemWorkspaceEntry | null
}

export function ItemRecipesPanel({ copy, item }: ItemRecipesPanelProps) {
  return (
    <PanelFrame title={copy.recipesPanelTitle} subtitle={copy.recipesPanelSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 p-3">
        {!item ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-6 text-sm text-[var(--text-secondary)]">
            {copy.recipesPanelEmpty}
          </div>
        ) : (
          <>
            <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{copy.recipeOutputTitle}</p>
              <div className="mt-3 space-y-2">
                {item.recipesProduced.length ? (
                  item.recipesProduced.map((recipe) => (
                    <div key={recipe.key} className="rounded-2xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel-muted)_92%,white_8%)] px-3 py-3">
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
              </div>
            </section>

            <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{copy.recipeInputTitle}</p>
              <div className="mt-3 space-y-2">
                {item.recipesUsing.length ? (
                  item.recipesUsing.map((recipe) => (
                    <div key={recipe.key} className="rounded-2xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel-muted)_92%,white_8%)] px-3 py-3">
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
              </div>
            </section>
          </>
        )}
      </div>
    </PanelFrame>
  )
}
