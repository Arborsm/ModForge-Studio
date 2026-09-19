/**
 * @file Fixed bottom navigation for the Android launcher host: the four
 * directory tabs with a soft-pill active state. Replaces the desktop GooeyNav,
 * which is not rendered on this host at all.
 */
import { BookOpenText, Compass, RefreshCw, Stethoscope } from 'lucide-react'
import type { LauncherPage } from '@locales/api'
import { useEditorCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'

const PAGE_ICONS = {
  library: BookOpenText,
  discover: Compass,
  updates: RefreshCw,
  configuration: Stethoscope,
} satisfies Record<LauncherPage, typeof Compass>

function formatNavBadgeCount(count: number) {
  if (count <= 0) {
    return null
  }

  return count > 99 ? '99+' : String(count)
}

type MobileBottomNavProps = {
  pages: readonly LauncherPage[]
  activePage: LauncherPage
  onPageChange: (page: LauncherPage) => void
  updatesBadgeCount: number
}

/** Fixed four-tab bottom bar; sits below full-screen overlays by z-order. */
export function MobileBottomNav({ pages, activePage, onPageChange, updatesBadgeCount }: MobileBottomNavProps) {
  const copy = useEditorCopy().launcher

  return (
    <nav className="mobile-bottom-nav" aria-label={copy.navigation}>
      {pages.map((page) => {
        const Icon = PAGE_ICONS[page]
        const active = page === activePage
        const badge = page === 'updates' ? formatNavBadgeCount(updatesBadgeCount) : null
        return (
          <button
            key={page}
            type="button"
            className={cx('mobile-bottom-nav-item', active && 'is-active')}
            aria-current={active ? 'page' : undefined}
            onClick={() => onPageChange(page)}
          >
            <span className="mobile-bottom-nav-icon-wrap" aria-hidden="true">
              <span className="mobile-bottom-nav-pill" />
              <Icon className="mobile-bottom-nav-icon" />
            </span>
            <span className="mobile-bottom-nav-label">{copy.pages[page]}</span>
            {badge ? <span className="mobile-bottom-nav-badge">{badge}</span> : null}
          </button>
        )
      })}
    </nav>
  )
}
