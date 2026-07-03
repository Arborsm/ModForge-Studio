import { useState } from 'react'
import { useId } from 'react'
import { ChevronRight } from 'lucide-react'
import type { DraftPatch } from '@shared/contracts'
import type { WorkspaceId } from '@shared/contracts'
import { useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

type ActionType = DraftPatch['action']

const ACTION_OPTIONS: ActionType[] = ['EditData', 'EditImage', 'EditMap', 'Load', 'Include']

const WORKSPACE_ACTIONS: Record<WorkspaceId, ActionType[]> = {
  map: ['EditMap', 'EditData', 'Load'],
  events: ['EditData', 'Load'],
  characters: ['EditImage', 'EditData', 'Load'],
  buildings: ['EditMap', 'EditData', 'Load'],
  items: ['EditData', 'EditImage', 'Load'],
  mods: ['EditData', 'EditImage', 'EditMap', 'Load', 'Include'],
}

const WORKSPACE_TARGET_PREFIXES: Record<WorkspaceId, string[]> = {
  map: ['Maps/', 'Data/Locations', 'Data/Buildings', 'Data/MineCarts'],
  events: ['Data/Events'],
  characters: ['Portraits/', 'Characters/', 'Data/NPC'],
  buildings: ['Maps/', 'Data/Buildings', 'Data/Locations'],
  items: [
    'Data/Objects',
    'Data/Crops',
    'Data/FruitTrees',
    'Data/CookingRecipes',
    'Data/CraftingRecipes',
    'Data/BigCraftablesInformation',
    'Data/Furniture',
    'Data/ClothingInformation',
    'Data/Boots',
    'Data/Hats',
    'Data/Weapons',
    'Data/Tools',
    'TileSheets/',
    'LooseSprites/',
  ],
  mods: [],
}

function filterTargetsByWorkspace(targets: string[], workspaceId: WorkspaceId): string[] {
  const prefixes = WORKSPACE_TARGET_PREFIXES[workspaceId]
  if (!prefixes || prefixes.length === 0) return targets
  return targets.filter((t) => prefixes.some((prefix) => t.startsWith(prefix)))
}

const COMMON_TARGETS: Record<Exclude<ActionType, 'Include'>, string[]> = {
  EditData: [
    // Events
    'Data/Events/Town',
    'Data/Events/Beach',
    'Data/Events/Mountain',
    'Data/Events/Forest',
    'Data/Events/Farm',
    'Data/Events/BusStop',
    'Data/Events/SeedShop',
    'Data/Events/Saloon',
    'Data/Events/Hospital',
    'Data/Events/ArchaeologyHouse',
    'Data/Events/BeachNightMarket',
    'Data/Events/IslandSouth',
    // Objects & Items
    'Data/Objects',
    'Data/Crops',
    'Data/FruitTrees',
    'Data/CookingRecipes',
    'Data/CraftingRecipes',
    'Data/BigCraftablesInformation',
    'Data/Furniture',
    'Data/ClothingInformation',
    'Data/Boots',
    'Data/Hats',
    'Data/Weapons',
    'Data/Tools',
    // NPCs & Dialogue
    'Data/NPCDispositions',
    'Data/NPCGiftTastes',
    'Data/NPCGiftTastes',
    'Data/EngagementDialogue',
    // Buildings & Locations
    'Data/Buildings',
    'Data/Locations',
    'Data/MineCarts',
    // Game Systems
    'Data/Quests',
    'Data/Mail',
    'Data/SecretNotes',
    'Data/Achievements',
    'Data/BundleSets',
    'Data/Bundles',
  ],
  EditImage: [
    // Portraits
    'Portraits/Abigail',
    'Portraits/Alex',
    'Portraits/Elliott',
    'Portraits/Emily',
    'Portraits/Haley',
    'Portraits/Harvey',
    'Portraits/Leah',
    'Portraits/Maru',
    'Portraits/Penny',
    'Portraits/Sam',
    'Portraits/Sebastian',
    'Portraits/Shane',
    // Characters (sprites)
    'Characters/Abigail',
    'Characters/Alex',
    'Characters/Elliott',
    'Characters/Emily',
    'Characters/Haley',
    'Characters/Harvey',
    'Characters/Leah',
    'Characters/Maru',
    'Characters/Penny',
    'Characters/Sam',
    'Characters/Sebastian',
    'Characters/Shane',
    // TileSheets
    'TileSheets/crops',
    'TileSheets/craftables',
    'TileSheets/furniture',
    'TileSheets/junimo',
    'TileSheets/tools',
    'TileSheets/weapons',
    'TileSheets/animals',
    'TileSheets/buildings',
    'LooseSprites/Cursors',
  ],
  EditMap: [
    'Maps/Town',
    'Maps/Farm',
    'Maps/FarmHouse',
    'Maps/FarmCave',
    'Maps/Mountain',
    'Maps/Beach',
    'Maps/Forest',
    'Maps/BusStop',
    'Maps/SeedShop',
    'Maps/Saloon',
    'Maps/Hospital',
    'Maps/ArchaeologyHouse',
    'Maps/Blacksmith',
    'Maps/AnimalShop',
    'Maps/Trailer_Big',
    'Maps/ScienceHouse',
    'Maps/ManorHouse',
    'Maps/Backwoods',
    'Maps/Railroad',
    'Maps/Desert',
    'Maps/IslandSouth',
    'Maps/IslandWest',
    'Maps/IslandEast',
    'Maps/IslandNorth',
    'Maps/Cellar',
  ],
  Load: [
    'Maps/Town',
    'Maps/Farm',
    'TileSheets/crops',
    'TileSheets/craftables',
    'Portraits/Abigail',
    'Characters/Abigail',
    'LooseSprites/Cursors',
  ],
}

interface AddPatchDialogProps {
  open: boolean
  workspaceId: WorkspaceId
  onClose: () => void
  onAdd: (action: ActionType, target: string, fromFile?: string) => void
}

export function AddPatchDialog({ open, workspaceId, onClose, onAdd }: AddPatchDialogProps) {
  const copy = useEditorCopy().studioDesk.addPatchDialog
  const titleId = useId()
  const allowedActions = WORKSPACE_ACTIONS[workspaceId] ?? ACTION_OPTIONS
  const actionOptions = ACTION_OPTIONS.filter((action) => allowedActions.includes(action))
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<string>('')
  const [customTarget, setCustomTarget] = useState('')
  const [fromFile, setFromFile] = useState('')

  const targetToUse = customTarget.trim() || selectedTarget
  const isInclude = selectedAction === 'Include'
  const title = step === 1 ? copy.selectActionTitle : isInclude ? copy.includeFileTitle : copy.selectTargetTitle

  function handleAdd() {
    if (!selectedAction) return
    if (isInclude) {
      const file = fromFile.trim()
      if (!file) return
      onAdd(selectedAction, file, file)
    } else {
      if (!targetToUse) return
      onAdd(selectedAction, targetToUse)
    }
    // Reset
    setStep(1)
    setSelectedAction(null)
    setSelectedTarget('')
    setCustomTarget('')
    setFromFile('')
  }

  return (
    <Dialog open={open} onClose={onClose} size="md" labelledBy={titleId}>
      <DialogHeader title={title} onClose={onClose} closeLabel={copy.closeLabel} id={titleId} />
      <DialogBody>
        {step === 1 ? (
          <div className="space-y-1">
            {actionOptions.map((action) => (
              <button
                key={action}
                type="button"
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  selectedAction === action
                    ? 'border-[color-mix(in_srgb,var(--accent)_30%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent)_6%,var(--bg-panel))]'
                    : 'border-transparent hover:bg-(--bg-panel-muted)'
                }`}
                onClick={() => {
                  setSelectedAction(action)
                  setStep(2)
                }}
              >
                <div className="flex-1">
                  <div className="text-xs font-medium text-(--text-primary)">{copy.actionLabels[action]}</div>
                  <div className="mt-0.5 text-[10px] text-(--text-secondary)">{copy.actionDescriptions[action]}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-(--text-secondary)" />
              </button>
            ))}
          </div>
        ) : isInclude ? (
          <div className="space-y-2">
            <button type="button" className="mb-2 text-xs text-(--accent) hover:underline" onClick={() => setStep(1)}>
              {`← ${copy.back}`}
            </button>

            <div>
              <span className="mb-1 block text-[10px] text-(--text-secondary)">FromFile</span>
              <input
                type="text"
                className="w-full rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
                value={fromFile}
                onChange={(e) => setFromFile(e.target.value)}
                placeholder={copy.includeFromFilePlaceholder}
              />
              <p className="mt-1 text-[10px] text-(--text-secondary)">{copy.fromFileDescription}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <button type="button" className="mb-2 text-xs text-(--accent) hover:underline" onClick={() => setStep(1)}>
              {`← ${copy.back}`}
            </button>

            <div className="space-y-1">
              {selectedAction &&
                filterTargetsByWorkspace(COMMON_TARGETS[selectedAction as Exclude<ActionType, 'Include'>], workspaceId).map((target) => (
                  <button
                    key={target}
                    type="button"
                    className={`w-full rounded-md px-3 py-2 text-left text-xs transition-colors ${
                      selectedTarget === target
                        ? 'bg-(--bg-active) text-(--text-primary)'
                        : 'text-(--text-secondary) hover:bg-(--bg-panel-muted)'
                    }`}
                    onClick={() => setSelectedTarget(target)}
                  >
                    {target}
                  </button>
                ))}
            </div>

            <div className="pt-2">
              <span className="mb-1 block text-[10px] text-(--text-secondary)">{copy.customTarget}</span>
              <input
                type="text"
                className="w-full rounded-md border border-(--border-color) bg-(--bg-app) px-3 py-2 text-xs text-(--text-primary) outline-none focus:border-(--accent)"
                value={customTarget}
                onChange={(e) => setCustomTarget(e.target.value)}
                placeholder={copy.customTargetPlaceholder}
              />
            </div>
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={onClose}>{copy.cancel}</DialogAction>
        <DialogAction tone="primary" disabled={step === 1 || (isInclude ? !fromFile.trim() : !targetToUse)} onClick={handleAdd}>
          {copy.addPatch}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
