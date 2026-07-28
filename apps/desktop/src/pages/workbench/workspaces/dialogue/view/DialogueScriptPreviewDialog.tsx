import { useEffect, useId, useState } from 'react'
import { Copy } from 'lucide-react'
import { useDialogueEditorCopy } from '@locales/provider'
import { formatCopyTemplate } from '@shared/lib/helper'
import { Dialog, DialogAction, DialogBody, DialogFooter, DialogHeader } from '@shared/ui/Dialog'
import { DialogueScriptTokens } from '@entities/dialogue'

type DialogueScriptPreviewDialogProps = {
  open: boolean
  onClose: () => void
  script: string
  npcDisplayName: string
  entryKey: string
}

/** Modal preview of the serialized entry script with protocol tokens highlighted. */
export function DialogueScriptPreviewDialog({ open, onClose, script, npcDisplayName, entryKey }: DialogueScriptPreviewDialogProps) {
  const copy = useDialogueEditorCopy()
  const titleId = useId()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) {
      return
    }
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copyScript() {
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} size="lg">
      <DialogHeader
        id={titleId}
        title={copy.previewDialogTitle}
        subtitle={formatCopyTemplate(copy.previewDialogSubtitleTemplate, { npc: npcDisplayName, key: entryKey || '—' })}
        onClose={onClose}
        closeLabel={copy.closeAction}
      />
      <DialogBody>
        <pre className="dialogue-editor-script-preview">
          <DialogueScriptTokens script={script} />
        </pre>
      </DialogBody>
      <DialogFooter>
        <DialogAction onClick={() => void copyScript()}>
          <Copy className="dialogue-editor-action-icon" />
          {copied ? copy.copyScriptDone : copy.copyScriptAction}
        </DialogAction>
        <DialogAction tone="primary" onClick={onClose}>
          {copy.closeAction}
        </DialogAction>
      </DialogFooter>
    </Dialog>
  )
}
