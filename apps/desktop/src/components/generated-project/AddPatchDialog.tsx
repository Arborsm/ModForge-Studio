import { useState } from 'react'
import { X, ChevronRight } from 'lucide-react'
import type { DraftPatch } from '../../lib/app/useGeneratedProject'

type ActionType = DraftPatch['action']

const ACTION_OPTIONS: { value: ActionType; label: string; description: string }[] = [
  { value: 'EditData', label: 'Edit Data', description: 'Modify JSON data files (events, items, NPCs...)' },
  { value: 'EditImage', label: 'Edit Image', description: 'Replace or patch image assets (textures, portraits...)' },
  { value: 'EditMap', label: 'Edit Map', description: 'Modify map properties and tile data' },
  { value: 'Load', label: 'Load', description: 'Replace entire asset files' },
]

const COMMON_TARGETS: Record<ActionType, string[]> = {
  EditData: [
    'Data/Events/Town',
    'Data/Events/Beach',
    'Data/Events/Mountain',
    'Data/Objects',
    'Data/Crops',
    'Data/Buildings',
  ],
  EditImage: [
    'Portraits/Abigail',
    'Portraits/Alex',
    'Characters/Abigail',
    'Characters/Alex',
    'TileSheets/crops',
    'TileSheets/craftables',
  ],
  EditMap: [
    'Maps/Town',
    'Maps/Farm',
    'Maps/Mountain',
    'Maps/Beach',
    'Maps/Forest',
  ],
  Load: [
    'Maps/Town',
    'TileSheets/crops',
    'Portraits/Abigail',
    'Characters/Abigail',
  ],
}

interface AddPatchDialogProps {
  open: boolean
  onClose: () => void
  onAdd: (action: ActionType, target: string) => void
}

export function AddPatchDialog({ open, onClose, onAdd }: AddPatchDialogProps) {
  const [step, setStep] = useState<1 | 2>(1)
  const [selectedAction, setSelectedAction] = useState<ActionType | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<string>('')
  const [customTarget, setCustomTarget] = useState('')

  if (!open) return null

  const targetToUse = customTarget.trim() || selectedTarget

  function handleAdd() {
    if (!selectedAction || !targetToUse) return
    onAdd(selectedAction, targetToUse)
    // Reset
    setStep(1)
    setSelectedAction(null)
    setSelectedTarget('')
    setCustomTarget('')
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40">
      <div className="w-[440px] max-w-[90vw] rounded-xl border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3">
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {step === 1 ? 'Select Action' : 'Select Target'}
          </span>
          <button type="button" className="icon-button h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 1 ? (
          <div className="space-y-1 px-4 py-3">
            {ACTION_OPTIONS.map((action) => (
              <button
                key={action.value}
                type="button"
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  selectedAction === action.value
                    ? 'border-[color-mix(in_srgb,var(--accent)_30%,var(--border-color))] bg-[color-mix(in_srgb,var(--accent)_6%,var(--bg-panel))]'
                    : 'border-transparent hover:bg-[var(--bg-panel-muted)]'
                }`}
                onClick={() => {
                  setSelectedAction(action.value)
                  setStep(2)
                }}
              >
                <div className="flex-1">
                  <div className="text-xs font-medium text-[var(--text-primary)]">{action.label}</div>
                  <div className="mt-0.5 text-[10px] text-[var(--text-secondary)]">{action.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-2 px-4 py-3">
            <button
              type="button"
              className="mb-2 text-xs text-[var(--accent)] hover:underline"
              onClick={() => setStep(1)}
            >
              ← Back
            </button>

            <div className="space-y-1">
              {selectedAction &&
                COMMON_TARGETS[selectedAction].map((target) => (
                  <button
                    key={target}
                    type="button"
                    className={`w-full rounded-md px-3 py-2 text-left text-xs transition-colors ${
                      selectedTarget === target
                        ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]'
                    }`}
                    onClick={() => setSelectedTarget(target)}
                  >
                    {target}
                  </button>
                ))}
            </div>

            <div className="pt-2">
              <span className="mb-1 block text-[10px] text-[var(--text-secondary)]">Custom Target</span>
              <input
                type="text"
                className="w-full rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={customTarget}
                onChange={(e) => setCustomTarget(e.target.value)}
                placeholder="e.g. Data/Events/Custom"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="control-button text-xs" onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="control-button control-button-primary text-xs"
                disabled={!targetToUse}
                onClick={handleAdd}
              >
                Add Patch
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
