import { useId } from 'react'
import type { LauncherLibraryItem } from '@features/launcher/model/types'
import { useEditorCopy } from '@locales/provider'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'

export type LauncherChildModManagerState = {
  parentMod: LauncherLibraryItem
  childMods: LauncherLibraryItem[]
}

type LauncherChildModsDialogsProps = {
  manager: LauncherChildModManagerState | null
  onCloseManager: () => void
  onRemoveChild: (modId: string) => void
  onManagerChildrenChange: (childMods: LauncherLibraryItem[]) => void
}

/** Renders launcher child-mod picker and manager dialogs owned by the launcher feature UI. */
export function LauncherChildModsDialogs({
  manager,
  onCloseManager,
  onRemoveChild,
  onManagerChildrenChange,
}: LauncherChildModsDialogsProps) {
  const copy = useEditorCopy().launcher
  const labels = {
    manageChildMods: copy.library.manageChildMods,
    parentModLabel: copy.library.parentModLabel,
    removeFromParent: copy.library.removeFromParent,
    closeDialog: copy.actions.closeDialog,
  }
  const titleId = useId()

  return (
    <Dialog open={Boolean(manager)} onClose={onCloseManager} size="md" labelledBy={titleId}>
      {manager ? (
        <>
          <DialogHeader
            title={labels.manageChildMods}
            subtitle={labels.parentModLabel(manager.parentMod.name)}
            onClose={onCloseManager}
            closeLabel={labels.closeDialog}
            id={titleId}
          />
          <DialogBody>
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
          </DialogBody>
          <DialogFooter>
            <DialogAction tone="primary" onClick={onCloseManager}>
              {labels.closeDialog}
            </DialogAction>
          </DialogFooter>
        </>
      ) : null}
    </Dialog>
  )
}
