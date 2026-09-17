/**
 * @file Full-screen mobile page shell: back-arrow header + scrollable body for
 * utility pages (downloads / notifications) on the Android launcher host.
 */

import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEditorCopy } from '@locales/provider'

type MobilePageShellProps = {
  title: string
  onClose: () => void
  /** Optional trailing header action (e.g. "clear all"). */
  action?: ReactNode
  children: ReactNode
}

/** Full-screen page with a back header; slides in above the tab content. */
export function MobilePageShell({ title, onClose, action, children }: MobilePageShellProps) {
  const copy = useEditorCopy()

  return (
    <section className="mobile-page" role="dialog" aria-label={title}>
      <header className="mobile-page-head">
        <button type="button" className="icon-button" onClick={onClose} aria-label={copy.controls.back} title={copy.controls.back}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="mobile-page-title">{title}</h2>
        {action}
      </header>
      <div className="mobile-page-body">{children}</div>
    </section>
  )
}
