import type { LauncherLibraryItem } from '@features/launcher/model/types'

export type LauncherChildModManagerState = {
  parentMod: LauncherLibraryItem
  childMods: LauncherLibraryItem[]
}

type LauncherChildModsDialogLabels = {
  cancelEdit: string
  manageChildMods: string
  parentModLabel: (name: string) => string
  removeFromParent: string
  closeDialog: string
}

type LauncherChildModsDialogsProps = {
  manager: LauncherChildModManagerState | null
  labels: LauncherChildModsDialogLabels
  onCloseManager: () => void
  onRemoveChild: (modId: string) => void
  onManagerChildrenChange: (childMods: LauncherLibraryItem[]) => void
}

/** Renders launcher child-mod picker and manager dialogs owned by the launcher feature UI. */
export function LauncherChildModsDialogs({
  manager,
  labels,
  onCloseManager,
  onRemoveChild,
  onManagerChildrenChange,
}: LauncherChildModsDialogsProps) {
  return (
    <>
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
