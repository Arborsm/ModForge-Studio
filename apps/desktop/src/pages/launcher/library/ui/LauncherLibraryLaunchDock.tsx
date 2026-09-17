/**
 * @file Launch dock + preflight sheet for the library page on the Android
 * host: a frosted capsule pinned above the bottom nav. The main body launches
 * the game; the chevron opens the preflight sheet (game version / SMAPI /
 * installed mods / dependency conflicts) before launching.
 */
import { useEffect, useState } from 'react'
import { ChevronRight, Play } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { useLauncherPort } from '@features/launcher/model/launcherPortContext'
import type { LauncherRuntimeInfo } from '@features/launcher/model/launcherContracts'
import type { LauncherLibraryItem } from '@features/launcher/model/types'
import { MobileSheet } from '../../ui/mobile/MobileSheet'

type LauncherLibraryLaunchDockProps = {
  mods: readonly LauncherLibraryItem[]
  launchGameDisabled: boolean
  launchGameBusy: boolean
  onLaunchGame: () => void
}

/** Pinned launch capsule with a tap-to-launch body and a preflight chevron. */
export function LauncherLibraryLaunchDock({ mods, launchGameDisabled, launchGameBusy, onLaunchGame }: LauncherLibraryLaunchDockProps) {
  const copy = useEditorCopy().launcher
  const mobileCopy = copy.library.mobile
  const launcherPort = useLauncherPort()
  const [runtimeInfo, setRuntimeInfo] = useState<LauncherRuntimeInfo | null>(null)
  const [preflightOpen, setPreflightOpen] = useState(false)

  useEffect(() => {
    let disposed = false
    void launcherPort
      .loadRuntimeInfo()
      .then((info) => {
        if (!disposed) {
          setRuntimeInfo(info)
        }
      })
      .catch(() => {
        // The dock still shows mod counts when runtime info is unavailable.
      })
    return () => {
      disposed = true
    }
  }, [launcherPort])

  const enabledCount = mods.filter((mod) => mod.enabled).length
  const conflictCount = mods.filter((mod) => mod.missingRequiredDependencies.length > 0 || mod.requiresNewerSmapi).length
  const gameVersion = runtimeInfo?.gameVersion?.trim() || null
  const smapiVersion = runtimeInfo?.smapiVersion?.trim() || null

  const preflightRows: ReadonlyArray<{ label: string; value: string; tone?: 'ok' | 'conflict' }> = [
    { label: mobileCopy.preflightGameVersion, value: gameVersion ?? '—', tone: gameVersion ? 'ok' : undefined },
    { label: mobileCopy.preflightSmapi, value: smapiVersion ?? '—', tone: smapiVersion ? 'ok' : undefined },
    { label: mobileCopy.preflightInstalledModsLabel, value: mobileCopy.preflightInstalledMods(mods.length, enabledCount) },
    {
      label: mobileCopy.preflightDependencies,
      value: conflictCount > 0 ? mobileCopy.preflightDependenciesConflict(conflictCount) : mobileCopy.preflightDependenciesOk,
      tone: conflictCount > 0 ? 'conflict' : 'ok',
    },
    { label: mobileCopy.preflightLastLaunch, value: mobileCopy.preflightLastLaunchUnknown },
  ]

  return (
    <>
      <div className="mobile-launch-dock">
        <button
          type="button"
          className="mobile-launch-dock-main"
          disabled={launchGameDisabled}
          onClick={onLaunchGame}
          aria-label={copy.actions.launchGame}
        >
          <span className="mobile-launch-dock-play" aria-hidden="true">
            <Play className="h-3.5 w-3.5" />
          </span>
          <span className="mobile-launch-dock-copy">
            <span className="mobile-launch-dock-title">{launchGameBusy ? `${copy.actions.launchGame}...` : copy.actions.launchGame}</span>
            <span className="mobile-launch-dock-subtitle">{mobileCopy.launchSubtitle(smapiVersion, mods.length, enabledCount)}</span>
          </span>
        </button>
        <button
          type="button"
          className="mobile-launch-dock-more"
          aria-label={mobileCopy.preflightTitle}
          aria-expanded={preflightOpen}
          onClick={() => setPreflightOpen(true)}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <MobileSheet open={preflightOpen} onClose={() => setPreflightOpen(false)} title={mobileCopy.preflightTitle}>
        <div className="mobile-preflight-rows">
          {preflightRows.map((row) => (
            <div key={row.label} className="mobile-preflight-row">
              <span className="mobile-preflight-label">{row.label}</span>
              <span className="mobile-preflight-value" data-tone={row.tone ?? 'neutral'}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="mobile-sheet-apply"
          disabled={launchGameDisabled}
          onClick={() => {
            setPreflightOpen(false)
            onLaunchGame()
          }}
        >
          {mobileCopy.preflightStart}
        </button>
      </MobileSheet>
    </>
  )
}
