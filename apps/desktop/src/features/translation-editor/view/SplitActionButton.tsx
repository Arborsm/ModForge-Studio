import { ChevronDown } from 'lucide-react'
import type { ReactNode, Ref } from 'react'
import { cx } from '@shared/lib/helper'

type SplitActionButtonProps = {
  /** Main button content (icon + label, optional badge). */
  children: ReactNode
  /** Content swapped in while `running` (e.g. cancel icon + label). */
  runningChildren?: ReactNode
  running?: boolean
  onMainClick: () => void
  mainDisabled?: boolean
  mainAriaLabel?: string
  mainClassName?: string
  mainRef?: Ref<HTMLButtonElement>
  title?: string
  /** Accessible name for the chevron that opens the behavior popover. */
  menuAriaLabel: string
  /** Prevents the popover from opening (e.g. while a run is active). */
  menuDisabled?: boolean
  /** Unmounts the popover content (e.g. while a run is active). */
  menuVisible?: boolean
  onMenuToggle?: (open: boolean) => void
  /** Popover content rendered inside `.translation-ai-menu-popover`. */
  menu: ReactNode
}

/**
 * Fuses a primary action button with a chevron-only details popover into one
 * visual control. The main button runs the persisted behavior; the popover
 * lists alternate behaviors and settings.
 */
export function SplitActionButton({
  children,
  runningChildren,
  running = false,
  onMainClick,
  mainDisabled = false,
  mainAriaLabel,
  mainClassName,
  mainRef,
  title,
  menuAriaLabel,
  menuDisabled = false,
  menuVisible = true,
  onMenuToggle,
  menu,
}: SplitActionButtonProps) {
  return (
    <div className="translation-split-button">
      <button
        ref={mainRef}
        type="button"
        className={cx('control-button translation-split-button-main h-8 px-3 text-xs', mainClassName)}
        disabled={mainDisabled}
        aria-label={mainAriaLabel}
        title={title}
        onClick={onMainClick}
      >
        {running && runningChildren ? runningChildren : children}
      </button>
      <details className="translation-ai-menu translation-split-button-menu" onToggle={(event) => onMenuToggle?.(event.currentTarget.open)}>
        <summary
          className="control-button translation-split-button-toggle h-8 px-2 text-xs"
          aria-label={menuAriaLabel}
          aria-disabled={menuDisabled || undefined}
          onClick={(event) => {
            if (menuDisabled) event.preventDefault()
          }}
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </summary>
        {menuVisible ? <div className="translation-ai-menu-popover">{menu}</div> : null}
      </details>
    </div>
  )
}

export default SplitActionButton
