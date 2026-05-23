import { cx } from '@shared/lib/cx'
import type { LauncherLibraryItem } from '@features/launcher/model/types'

export type LauncherChildModPickerState = {
  parentMod: LauncherLibraryItem
  selectedModIds: string[]
}

export type LauncherChildModManagerState = {
  parentMod: LauncherLibraryItem
  childMods: LauncherLibraryItem[]
}

type LauncherChildModsDialogLabels = {
  chooseChildMods: string
  chooseChildModsSubtitle: (name: string) => string
  confirmChildMods: string
  cancelEdit: string
  manageChildMods: string
  parentModLabel: (name: string) => string
  removeFromParent: string
  closeDialog: string
}

type LauncherChildModsDialogsProps = {
  picker: LauncherChildModPickerState | null
  manager: LauncherChildModManagerState | null
  mods: LauncherLibraryItem[]
  labels: LauncherChildModsDialogLabels
  onClosePicker: () => void
  onTogglePickerSelection: (modId: string) => void
  onSubmitPicker: () => void
  onCloseManager: () => void
  onRemoveChild: (modId: string) => void
  onManagerChildrenChange: (childMods: LauncherLibraryItem[]) => void
}

/** Renders launcher child-mod picker and manager dialogs owned by the launcher feature UI. */
export function LauncherChildModsDialogs({
  picker,
  manager,
  mods,
  labels,
  onClosePicker,
  onTogglePickerSelection,
  onSubmitPicker,
  onCloseManager,
  onRemoveChild,
  onManagerChildrenChange,
}: LauncherChildModsDialogsProps) {
  return (
    <>
      {picker ? (
        <div
          className="launcher-modal-backdrop launcher-library-dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onClosePicker()
            }
          }}
        >
          <section className="launcher-library-dialog" role="dialog" aria-modal="true" aria-label={labels.chooseChildMods}>
            <div className="launcher-library-dialog-header">
              <h2 className="launcher-library-dialog-title">{labels.chooseChildMods}</h2>
              <p className="launcher-library-dialog-copy">{labels.chooseChildModsSubtitle(picker.parentMod.name)}</p>
            </div>

            <div className="launcher-library-child-manager-list">
              {mods
                .filter((mod) => mod.id !== picker.parentMod.id)
                .map((mod) => {
                  const selected = picker.selectedModIds.includes(mod.id)
                  return (
                    <button
                      key={mod.id}
                      type="button"
                      className={cx('launcher-library-child-picker-row', selected && 'launcher-library-child-picker-row-selected')}
                      aria-pressed={selected}
                      onClick={() => onTogglePickerSelection(mod.id)}
                    >
                      <span className="launcher-library-child-picker-check" aria-hidden="true">
                        {selected ? '✓' : ''}
                      </span>
                      <span>{mod.name}</span>
                    </button>
                  )
                })}
            </div>

            <div className="launcher-library-dialog-actions">
              <button type="button" className="control-button launcher-library-secondary-action" onClick={onClosePicker}>
                {labels.cancelEdit}
              </button>
              <button type="button" className="control-button control-button-primary" onClick={onSubmitPicker}>
                {labels.confirmChildMods}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {manager ? (
        <div
          className="launcher-modal-backdrop launcher-library-dialog-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onCloseManager()
            }
          }}
        >
          <section className="launcher-library-dialog" role="dialog" aria-modal="true" aria-label={labels.manageChildMods}>
            <div className="launcher-library-dialog-header">
              <h2 className="launcher-library-dialog-title">{labels.manageChildMods}</h2>
              <p className="launcher-library-dialog-copy">{labels.parentModLabel(manager.parentMod.name)}</p>
            </div>

            <div className="launcher-library-child-manager-list">
              {manager.childMods.map((childMod) => (
                <div key={childMod.id} className="launcher-library-child-manager-row">
                  <span>{childMod.name}</span>
                  <button
                    type="button"
                    className="launcher-library-link-button"
                    onClick={() => {
                      onRemoveChild(childMod.id)
                      onManagerChildrenChange(manager.childMods.filter((item) => item.id !== childMod.id))
                    }}
                  >
                    {labels.removeFromParent}
                  </button>
                </div>
              ))}
            </div>

            <div className="launcher-library-dialog-actions">
              <button type="button" className="control-button control-button-primary" onClick={onCloseManager}>
                {labels.closeDialog}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
