import {
  AlertTriangle,
  ArrowUpRight,
  Bug,
  Check,
  ChevronDown,
  Code2,
  Crown,
  Database,
  Download,
  FolderOpen,
  HelpCircle,
  Image,
  KeyRound,
  MessageSquare,
  Network,
  RefreshCw,
  ScrollText,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { applyAppUiStatePatch, getAppUiStateSnapshot } from '@shared/lib/app-state'
import { cx } from '@shared/lib/cx'
import { useEditorCopy, useSettingsMenuCopy } from '@locales/localeContext'
import { reportAppEvent, type AppEventLevel } from '@shared/lib/observability'
import { LoadingMotionReveal, LoadingMotionRevealItem } from '@shared/ui/loading-motion'
import {
  clearLauncherImageCache,
  type LauncherNexusDiagnosticsResult,
  loadLauncherNexusDiagnostics,
  restartLauncherNexusDiagnostics,
  setLauncherNexusForceOffline,
  type LauncherNexusRouteSnapshot,
} from '@features/launcher/api'
import { canUseDesktopHost } from '@shared/lib/desktop'
import {
  getLauncherWarningState,
  readCachedLauncherConfigurationApiKeyStatus,
  readCachedLauncherConfigurationDiagnostics,
  readCachedLauncherConfigurationLibraryScan,
  readCachedLauncherConfigurationRuntimeInfo,
  readCachedLauncherConfigurationSsoStatus,
  useLauncherDownloads,
  useLauncherPort,
  useLauncherSettings,
  writeCachedLauncherConfigurationApiKeyStatus,
  writeCachedLauncherConfigurationDiagnostics,
  writeCachedLauncherConfigurationLibraryScan,
  writeCachedLauncherConfigurationRuntimeInfo,
  writeCachedLauncherConfigurationSsoStatus,
} from '@features/launcher'
import type { LauncherCopy } from '@locales/schema'
import type { LauncherRuntimeInfo, ValidateApiKeyResult } from '@features/launcher/model/launcherContracts'
import { NexusModsBbcode } from '@shared/ui/nexusmods-bbcode'

type DebugButtonGroup = Record<'debug' | 'info' | 'success' | 'warning' | 'error', string>
type DebugLogButtonGroup = Record<'debug' | 'info' | 'warning' | 'error', string>
type ConfigStepTone = 'ok' | 'warn' | 'danger'
type ConfigStep = {
  id: string
  label: string
  detail: string
  tone: ConfigStepTone
}
type ApiRouteTone = 'ok' | 'warn' | 'danger' | 'loading'
type ConfigRouteId = 'nexusApi' | 'publicGraphql' | 'nexusImages' | 'smapi' | 'privateGraphql'
type NexusApiAccountStatus = {
  apiKeyStatus: ValidateApiKeyResult | null
  apiKeyError: string | null
  apiKeyChecking: boolean
  ssoAuthorized: boolean
  ssoStarting: boolean
  refreshApiKeyStatus: (options?: { force?: boolean; forceNonPremium?: boolean }) => Promise<void>
  startSso: () => Promise<void>
}

function createLoadingRoute(routeId: ConfigRouteId, label: string): LauncherNexusRouteSnapshot {
  return {
    routeId,
    label,
    endpoint: '',
    status: 'loading',
    attempts: 0,
    maxAttempts: 0,
    available: false,
    message: '',
  }
}

function getDefaultConfigRoutes(copy: LauncherCopy): LauncherNexusRouteSnapshot[] {
  return [
    createLoadingRoute('publicGraphql', copy.settings.nexusApiGraphql),
    createLoadingRoute('nexusImages', copy.settings.nexusApiImageCdn),
    createLoadingRoute('smapi', 'SMAPI'),
    createLoadingRoute('privateGraphql', 'Nexus Private GraphQL'),
    createLoadingRoute('nexusApi', copy.settings.nexusApiRest),
  ]
}

function getDisplayedConfigRoutes(routes: LauncherNexusRouteSnapshot[], copy: LauncherCopy) {
  const routesById = new Map(routes.map((route) => [route.routeId, route]))
  return getDefaultConfigRoutes(copy).map((fallbackRoute) => routesById.get(fallbackRoute.routeId) ?? fallbackRoute)
}

const nexusModsBbcodeSample =
  "[font=Georgia][center][b][color=#f6b26b][size=3]Basic Bedroom Furniture[/size][/color][/b] [i][color=#a2c4c9]by orangeblossom[/color][/i][/center] [center][color=#ffd966]⋆[/color][color=#fce5cd]｡[/color][color=#a4c2f4]‧[/color][color=#b4a7d6]˚[/color][color=#6aa84f]ʚ[/color] [color=#ffe599]❀[/color] [color=#6aa84f]ɞ[/color][color=#9fc5e8]˚[/color][color=#fce5cd]‧[/color][color=#ead1dc]｡[/color][color=#ffd966]⋆[/color][/center] I took inspiration from ikea furniture when drawing the sprites for this mod, specifically their BJÖRKSNÄS bed frame and PAX wardrobe frames because it looks light, modern, airy and cozy [s]and [i]totally [/i]not because of the blazing summer heat where i live.[/s] [size=2]You can get this furniture if you have my [/size][url=https://www.nexusmods.com/stardewvalley/mods/23073]catalogue[/url][size=2] which you can buy from Robin. [/size][/font][font=Georgia][font=Georgia][color=#ffd966][url=https://buymeacoffee.com/orangeblossom] [/url][/color][/font] Translation Credits: [list] [*][font=Georgia][i]Keluoluooo[/i] for the Chinese translation[/font] [*][font=Georgia][i]Nitropicc[/i] for the Spanish translation[/font] [/list] [center][color=#fff2cc]⋆[/color][color=#cfe2f3]˚[/color][color=#ffe599]‧[/color][color=#ead1dc]｡[/color][color=#fff2cc]⋆[/color][color=#6aa84f]ʚ[/color] [color=#ffe599]❀[/color] [color=#6aa84f]ɞ[/color][color=#ffd966]⋆[/color][color=#cfe2f3]｡[/color][color=#ead1dc]‧[/color][color=#b4a7d6]˚[/color][color=#ffe599]⋆ Content Patcher Version Section [color=#fff2cc]⋆[/color][color=#cfe2f3]˚[/color][color=#ffe599]‧[/color][color=#ead1dc]｡[/color][color=#fff2cc]⋆[/color][color=#6aa84f]ʚ[/color] [color=#ffe599]❀[/color] [color=#6aa84f]ɞ[/color][color=#ffd966]⋆[/color][color=#cfe2f3]｡[/color][color=#ead1dc]‧[/color][color=#b4a7d6]˚[/color][color=#ffe599]⋆[/color][/color][/center][size=1][center](aka 1.6 section)[/center] [/size][u]legend:[/u] [list] [*]green = [color=#93c47d]NEW[/color] [*]red = [color=#e06666]rotate[/color] [/list][size=2] [left][u][color=#6d9eeb]This mod contains:[/color][/u][/left] [/size][i][size=2][u]ꕥ beds[/u][/size][/i] ﻿1. double bed ﻿ ﻿- double bed ﻿ ﻿- [color=#93c47d]blocky double bed[/color] ﻿2. single bed ﻿ ﻿- single bed ﻿ ﻿- [color=#93c47d]blocky single bed[/color] [i] [u]ꕥ end table[/u][/i] ﻿1. wooden end table ﻿2. glass end table ﻿3. [color=#93c47d]blocky end table[/color] [i][u]ꕥ console table [/u][/i] ﻿1. wooden console table [size=1](extendable; [color=#e06666]rotate[/color])[/size] [size=2] ﻿2. glass console table [/size][size=1](extendable; [color=#e06666]rotate[/color])[/size] [i][u]ꕥ plants[/u][/i] ﻿1. baby's breath on a vase ﻿2. carnations on a vase [i][u]ꕥ wall decor[/u][/i] ﻿1. shelf ﻿2. abstract painting ﻿3. hanging dress [i][u]ꕥ floor decor[/u][/i] ﻿ ﻿1. standing mirror ﻿2. hamper ﻿3. divider[size=1] (2 versions; [color=#e06666]rotate[/color]) [/size] [i][u]ꕥ misc decor [/u][/i] ﻿1. bag clutter ﻿[size=1](2 versions; [color=#e06666]rotate[/color])[/size] ﻿2. makeup clutter [size=1](4 versions; [color=#e06666]rotate[/color])[/size] [i][u]ꕥ lamps[/u][/i] ﻿1. candle lamp [s]﻿2. wooden end table w/ candles and flower vase ﻿3. wooden end table w/ star lamp and flower vase[/s] [s]﻿﻿4. glass end table w/ candles and flower vase ﻿5. glass end table w/ star lamp and flower vase[/s] ﻿2. 3 orbs floor lamp ﻿3. [color=#93c47d]nightlight and flowers[/color] ﻿4. [color=#93c47d]tea candle and flowers[/color] [i][u]ꕥ sconce[/u][/i] ﻿1. globe sconce [i][u]ꕥ modular wardrobe [/u][/i] ﻿1. end piece (2 versions) [size=1]- functions as a dresser; [color=#e06666]rotate[/color] to get left and right pieces[/size] ﻿2. mirror end piece (left and right) [size=1]- [color=#e06666]rotate[/color] to get left and right pieces[/size] ﻿3. double wardrobe (2 versions) [size=1]- functions as a dresser[/size] ﻿4. corner end piece (left and right) ﻿5. corner extension end piece (left and right) [i][u]ꕥ ottoman[/u][/i] ﻿1. cushioned ottoman[size=1] ([color=#e06666]rotate[/color] to get extendable pieces + corner pieces)[/size] ﻿2. wooden ottoman[size=1] ([color=#e06666]rotate[/color] to get extendable pieces + corner pieces)[/size] [u][i][i][u]ꕥ [/u][/i]rugs[/i][/u] (4 patterns each) ﻿1. 3x3 rug ﻿2. 4x3 rug ﻿3. 5x4 square rug ﻿4. 5x4 rectangle rug [center][color=#fff2cc]⋆[/color][color=#cfe2f3]˚[/color][color=#ffe599]‧[/color][color=#ead1dc]｡[/color][color=#fff2cc]⋆[/color][color=#6aa84f]ʚ[/color] [color=#ffe599]❀[/color] [color=#6aa84f]ɞ[/color][color=#ffd966]⋆[/color][color=#cfe2f3]｡[/color][color=#ead1dc]‧[/color][color=#b4a7d6]˚[/color][color=#ffe599]⋆ Alternative Textures Version Section [color=#fff2cc]⋆[/color][color=#cfe2f3]˚[/color][color=#ffe599]‧[/color][color=#ead1dc]｡[/color][color=#fff2cc]⋆[/color][color=#6aa84f]ʚ[/color] [color=#ffe599]❀[/color] [color=#6aa84f]ɞ[/color][color=#ffd966]⋆[/color][color=#cfe2f3]｡[/color][color=#ead1dc]‧[/color][color=#b4a7d6]˚[/color][color=#ffe599]⋆ [/color][/color][size=1](aka pre-1.6 section)[/size][/center] [u] [color=#6d9eeb]Textures can be found in the following:[/color][/u] [/font][list] [*][font=Georgia]artist bookcase[/font] [*][font=Georgia]bed[/font] [*][font=Georgia]box lamp[/font] [*][font=Georgia]ceramic pillar[/font] [*][font=Georgia]double bed[/font] [*][font=Georgia]funky rug[/font] [*][font=Georgia]globe[/font] [*][font=Georgia]green stool[/font] [*][font=Georgia]house plant[/font] [*][font=Georgia]jade hills[/font] [*][font=Georgia]needlepoint flower[/font] [*][font=Georgia]old world rug[/font] [*][font=Georgia]sandy rug[/font] [*][font=Georgia]wall sconce[/font] [*][font=Georgia]walnut end table[/font] [/list][font=Georgia] [color=#6d9eeb]NOTES:[/color] [list] [*][font=Georgia]I wasn't able to include the wardrobe corners and extensions because of vanilla furniture limitations. The ottomans also don't have corner pieces but you can place them together and still get that 'connected' look.[/font] [*][font=Georgia]Wardrobes in this version do not function as dressers.[/font] [/list][/font]"

function hasConfiguredPath(value: string | null | undefined) {
  return Boolean(value?.trim())
}

function countConfiguredPaths(settings: ReturnType<typeof useLauncherSettings>['settings']) {
  return [settings.gamePath, settings.modsPath, settings.downloadPath].filter(hasConfiguredPath).length
}

function hasWarningDiagnostics(routes: LauncherNexusRouteSnapshot[]) {
  return routes.some((route) => route.status === 'warning' || !route.available)
}

function formatNumber(value: number | null | undefined) {
  return value == null ? '0' : new Intl.NumberFormat().format(value)
}

function getPercent(value: number | null | undefined, total: number) {
  if (value == null) {
    return 0
  }

  return Math.max(0, Math.min(100, (value / total) * 100))
}

function formatPercent(percent: number) {
  if (percent <= 0) {
    return '0%'
  }

  if (percent >= 100) {
    return '100%'
  }

  if (percent > 99) {
    return `${Math.floor(percent)}%`
  }

  const rounded = Math.round(percent)
  return `${Math.max(1, rounded)}%`
}

function formatResetCountdown(timestampSeconds: number | null | undefined, copy: LauncherCopy) {
  if (timestampSeconds == null) {
    return null
  }

  const remainingMs = timestampSeconds * 1000 - Date.now()
  if (remainingMs <= 0) {
    return copy.settings.nexusQuotaResetIn(copy.settings.nexusQuotaDurationMinutes(0))
  }

  const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const duration =
    hours > 0 ? copy.settings.nexusQuotaDurationHoursMinutes(hours, minutes) : copy.settings.nexusQuotaDurationMinutes(minutes)

  return copy.settings.nexusQuotaResetIn(duration)
}

function getNextUtcMidnightTimestampSeconds() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0) / 1000
}

function getNextHourTimestampSeconds() {
  const now = new Date()
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours() + 1, 0, 0) / 1000
}

function getQuotaDetail(limit: string, resetAt: number | null | undefined, fallbackResetAt: () => number, copy: LauncherCopy) {
  const resetDetail = formatResetCountdown(resetAt ?? fallbackResetAt(), copy)
  return resetDetail == null ? limit : `${limit} · ${resetDetail}`
}

function getDiagnosticsAgeLabel(timestamp: number | null, copy: LauncherCopy) {
  if (timestamp == null) {
    return copy.settings.configurationDiagnosticsJustNow
  }

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000))
  return minutes <= 0 ? copy.settings.configurationDiagnosticsJustNow : copy.settings.configurationDiagnosticsMinutesAgo(minutes)
}

function getConfigurationDiagnosticsApiKeySignature(settings: ReturnType<typeof useLauncherSettings>['settings']) {
  return settings.nexusApiKey?.trim() ?? ''
}

function getRouteTone(route: LauncherNexusRouteSnapshot | undefined): ApiRouteTone {
  if (!route) {
    return 'loading'
  }

  if (route.status === 'loading') {
    return 'loading'
  }

  if (route.available && route.status === 'success') {
    return 'ok'
  }

  return route.status === 'warning' ? 'warn' : 'danger'
}

function getRouteStatusLabel(tone: ApiRouteTone, copy: LauncherCopy) {
  if (tone === 'ok') {
    return copy.settings.nexusApiAvailable
  }

  if (tone === 'warn') {
    return copy.settings.nexusApiSlow
  }

  if (tone === 'loading') {
    return copy.configuration.nexusDiagnosticsLoadingState
  }

  return copy.settings.nexusApiUnavailable
}

function getRouteDisplayName(route: LauncherNexusRouteSnapshot, copy: LauncherCopy) {
  if (route.routeId === 'nexusApi') {
    return copy.settings.nexusApiRest
  }

  if (route.routeId === 'publicGraphql') {
    return copy.settings.nexusApiGraphql
  }

  if (route.routeId === 'nexusImages') {
    return copy.settings.nexusApiImageCdn
  }

  return route.label
}

function getRouteDescription(route: LauncherNexusRouteSnapshot, copy: LauncherCopy) {
  const responsibilities = copy.configuration.nexusDiagnosticsRouteResponsibilities
  if (route.routeId === 'publicGraphql') {
    return responsibilities.publicGraphql
  }

  if (route.routeId === 'privateGraphql') {
    return responsibilities.privateGraphql
  }

  if (route.routeId === 'nexusApi') {
    return responsibilities.nexusApi
  }

  if (route.routeId === 'nexusImages') {
    return responsibilities.nexusImages
  }

  if (route.routeId === 'smapi') {
    return responsibilities.smapi
  }

  return responsibilities.fallback
}

function getRouteRowTone(route: LauncherNexusRouteSnapshot | undefined, account: NexusApiAccountStatus, isAuthorized: boolean) {
  if (route?.routeId === 'nexusApi') {
    const restTone: ApiRouteTone = account.apiKeyError ? 'danger' : account.apiKeyChecking ? 'loading' : getRouteTone(route)
    return isAuthorized ? restTone : 'danger'
  }

  const routeTone = getRouteTone(route)
  if (routeTone === 'loading') {
    return 'loading'
  }

  if (route?.routeId === 'nexusImages') {
    return routeTone === 'ok' ? 'ok' : 'warn'
  }

  if (route?.routeId === 'publicGraphql' && routeTone === 'danger') {
    return 'warn'
  }

  return routeTone
}

function getRouteIcon(routeId: string) {
  if (routeId === 'nexusApi') {
    return <Database className="h-4 w-4" />
  }

  if (routeId === 'privateGraphql') {
    return <KeyRound className="h-4 w-4" />
  }

  if (routeId === 'nexusImages') {
    return <Image className="h-4 w-4" />
  }

  return <Network className="h-4 w-4" />
}

function getInitials(name: string) {
  const cleaned = name.trim()
  if (!cleaned) {
    return 'NX'
  }

  const words = cleaned.split(/[\s._-]+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase()
  }

  return cleaned.slice(0, 2).toUpperCase()
}

function getStepIcon(tone: ConfigStepTone) {
  if (tone === 'danger') {
    return <X className="h-3.5 w-3.5" />
  }

  if (tone === 'warn') {
    return <AlertTriangle className="h-3.5 w-3.5" />
  }

  return <Check className="h-3.5 w-3.5" />
}

function ConfigCompletionRail({ title, steps }: { title: string; steps: ConfigStep[] }) {
  return (
    <LoadingMotionReveal
      itemId="launcher-config-completion-rail"
      index={3}
      as="section"
      className="launcher-config-rail-panel launcher-config-completion-rail"
      data-testid="launcher-config-completion-rail"
    >
      <div className="launcher-config-rail-title">{title}</div>
      <div className="launcher-config-stepper">
        {steps.map((step, index) => (
          <LoadingMotionRevealItem
            key={step.id}
            index={index}
            as="div"
            className={cx('launcher-config-step', `launcher-config-step-${step.tone}`)}
            data-testid={`launcher-config-${step.id}-step`}
          >
            <span className="launcher-config-step-mark" aria-hidden="true">
              {getStepIcon(step.tone)}
            </span>
            <div>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
          </LoadingMotionRevealItem>
        ))}
      </div>
    </LoadingMotionReveal>
  )
}

function ConfigDownloadDefaults({
  settings,
  copy,
  yesLabel,
  noLabel,
}: {
  settings: ReturnType<typeof useLauncherSettings>['settings']
  copy: LauncherCopy
  yesLabel: string
  noLabel: string
}) {
  const defaults = [
    {
      label: copy.toggles.autoCheckModUpdates,
      checked: settings.autoCheckModUpdates,
    },
    {
      label: copy.toggles.autoInstallDownloads,
      checked: settings.autoInstallDownloads,
    },
    {
      label: copy.toggles.keepDownloadedArchives,
      checked: settings.keepDownloadedArchives,
    },
  ]

  return (
    <LoadingMotionReveal
      itemId="launcher-config-download-defaults"
      index={5}
      as="section"
      className="launcher-config-rail-panel launcher-config-download-defaults"
      data-testid="launcher-config-download-defaults"
    >
      <div className="launcher-config-rail-title">{copy.settings.downloadDefaultsTitle}</div>
      <div className="launcher-config-defaults">
        {defaults.map((item, index) => (
          <LoadingMotionRevealItem key={item.label} index={index} as="div" className="launcher-config-default-row">
            <span>{item.label}</span>
            <span
              className={cx('launcher-config-mini-switch', item.checked && 'launcher-config-mini-switch-active')}
              aria-label={item.checked ? yesLabel : noLabel}
            >
              <span aria-hidden="true" />
            </span>
          </LoadingMotionRevealItem>
        ))}
      </div>
    </LoadingMotionReveal>
  )
}

function ConfigAccountCard({ account, copy }: { account: NexusApiAccountStatus; copy: LauncherCopy }) {
  const accountName = account.apiKeyStatus?.userName ?? 'Nexus'
  const accountStatus = account.apiKeyError ? copy.settings.nexusApiUnavailable : copy.settings.nexusNormalStatus
  const premiumLabel = account.apiKeyStatus?.isPremium ? copy.diagnostics.premiumActive : copy.diagnostics.premiumFree

  return (
    <LoadingMotionReveal
      itemId="launcher-config-account-card"
      index={4}
      as="section"
      className="launcher-config-account-row"
      data-testid="launcher-config-account-card"
    >
      <div className="launcher-config-account-cover" aria-hidden="true" />
      <div className="launcher-config-account-card">
        <div className="launcher-config-avatar-wrap">
          <span className="launcher-config-avatar">{getInitials(accountName)}</span>
          <span
            className={cx('launcher-config-online-dot', account.apiKeyError && 'launcher-config-online-dot-danger')}
            title={accountStatus}
          />
        </div>
        <div className="launcher-config-account-meta">
          <strong>{accountName}</strong>
          <span className="launcher-config-premium-badge" title={premiumLabel}>
            <Crown className="h-3.5 w-3.5" aria-hidden="true" />
            {premiumLabel.toUpperCase()}
          </span>
        </div>
      </div>
    </LoadingMotionReveal>
  )
}

function ConfigPanelHeader({ title, description, actions }: { title: string; description: string; actions?: ReactNode }) {
  return (
    <div className="launcher-config-panel-head">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions ? <div className="launcher-config-panel-actions">{actions}</div> : null}
    </div>
  )
}

function ConfigPathPanel({
  settingsState,
  copy,
  browseLabel,
}: {
  settingsState: ReturnType<typeof useLauncherSettings>
  copy: LauncherCopy
  browseLabel: string
}) {
  const launcherPort = useLauncherPort()
  const rows = [
    {
      field: 'gamePath' as const,
      label: copy.fields.gamePath,
      value: settingsState.settings.gamePath,
    },
    {
      field: 'modsPath' as const,
      label: copy.fields.modsPath,
      value: settingsState.settings.modsPath,
    },
    {
      field: 'downloadPath' as const,
      label: copy.fields.downloadPath,
      value: settingsState.settings.downloadPath,
    },
  ]

  return (
    <section className="launcher-config-panel launcher-config-paths" aria-label={copy.settings.pathsTitle}>
      <ConfigPanelHeader title={copy.settings.pathsTitle} description={copy.settings.pathsHint} />
      <div className="launcher-config-path-list">
        {rows.map((row, index) => (
          <LoadingMotionRevealItem key={row.field} index={index} as="div" className="launcher-config-path-row">
            <div className="launcher-config-path-label">
              <strong>{row.label}</strong>
            </div>
            <div className="launcher-config-path-field">
              <span className="launcher-config-path-text" data-testid={`launcher-config-${row.field}-value`}>
                {row.value?.trim() || copy.settings.pathNotConfigured}
              </span>
              <div className="launcher-config-path-actions">
                <button
                  type="button"
                  className="launcher-config-icon-button"
                  aria-label={`${row.label} ${browseLabel}`}
                  title={browseLabel}
                  onClick={() => void settingsState.pickDirectory(row.field, row.label)}
                >
                  <FolderOpen className="h-4 w-4" aria-hidden="true" />
                </button>
                {row.value ? (
                  <button
                    type="button"
                    className="launcher-config-icon-button"
                    aria-label={`${row.label} ${copy.actions.openFolder}`}
                    title={copy.actions.openFolder}
                    onClick={() => void launcherPort.openPath({ path: row.value! })}
                  >
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>
          </LoadingMotionRevealItem>
        ))}
      </div>
    </section>
  )
}

function applyForcedNonPremiumStatus(status: ValidateApiKeyResult | null, forceNonPremium: boolean) {
  return status && forceNonPremium ? { ...status, isPremium: false } : status
}

function useNexusApiAccountStatus(settingsState: ReturnType<typeof useLauncherSettings>, forceNonPremium: boolean): NexusApiAccountStatus {
  const launcherPort = useLauncherPort()
  const { settings, refresh } = settingsState
  const [apiKeyStatus, setApiKeyStatus] = useState<ValidateApiKeyResult | null>(null)
  const [apiKeyError, setApiKeyError] = useState<string | null>(null)
  const [apiKeyChecking, setApiKeyChecking] = useState(false)
  const [ssoAuthorized, setSsoAuthorized] = useState(false)
  const [ssoStarting, setSsoStarting] = useState(false)
  const apiKeySignature = getConfigurationDiagnosticsApiKeySignature(settings)
  const hasApiKey = Boolean(apiKeySignature)
  const applyDebugAccountTier = useCallback(
    (status: ValidateApiKeyResult | null, overrideForceNonPremium = forceNonPremium) =>
      applyForcedNonPremiumStatus(status, overrideForceNonPremium),
    [forceNonPremium],
  )

  const writeApiKeyStatusCache = useCallback(
    (status: ValidateApiKeyResult | null, error: string | null, overrideForceNonPremium = forceNonPremium) => {
      writeCachedLauncherConfigurationApiKeyStatus(
        {
          status: applyDebugAccountTier(status, overrideForceNonPremium),
          error,
        },
        {
          apiKeySignature,
        },
      )
    },
    [apiKeySignature, applyDebugAccountTier, forceNonPremium],
  )

  const refreshApiKeyStatus = useCallback(
    async (options: { force?: boolean; forceNonPremium?: boolean } = {}) => {
      const effectiveForceNonPremium = options.forceNonPremium ?? forceNonPremium
      if (!hasApiKey) {
        setApiKeyStatus(null)
        setApiKeyError(null)
        return
      }

      if (!options.force) {
        const cached = readCachedLauncherConfigurationApiKeyStatus({
          apiKeySignature,
        })
        if (cached) {
          setApiKeyStatus(applyDebugAccountTier(cached.status, effectiveForceNonPremium))
          setApiKeyError(cached.error)
          return
        }
      }

      setApiKeyChecking(true)
      setApiKeyError(null)
      try {
        const nextStatus = applyDebugAccountTier(await launcherPort.validateNexusApiKey(), effectiveForceNonPremium)
        setApiKeyStatus(nextStatus)
        writeApiKeyStatusCache(nextStatus, null, effectiveForceNonPremium)
      } catch (nextError) {
        const errorMessage = nextError instanceof Error ? nextError.message : String(nextError)
        setApiKeyStatus(null)
        setApiKeyError(errorMessage)
        writeApiKeyStatusCache(null, errorMessage, effectiveForceNonPremium)
      } finally {
        setApiKeyChecking(false)
      }
    },
    [apiKeySignature, applyDebugAccountTier, forceNonPremium, hasApiKey, launcherPort, writeApiKeyStatusCache],
  )

  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (!hasApiKey) {
        if (!cancelled) {
          setApiKeyStatus(null)
          setApiKeyError(null)
        }
        return
      }

      const cached = readCachedLauncherConfigurationApiKeyStatus({
        apiKeySignature,
      })
      if (cached) {
        if (!cancelled) {
          setApiKeyStatus(applyDebugAccountTier(cached.status))
          setApiKeyError(cached.error)
        }
        return
      }

      try {
        const nextStatus = applyDebugAccountTier(await launcherPort.validateNexusApiKey())
        writeApiKeyStatusCache(nextStatus, null)
        if (!cancelled) {
          setApiKeyStatus(nextStatus)
          setApiKeyError(null)
        }
      } catch (nextError) {
        const errorMessage = nextError instanceof Error ? nextError.message : String(nextError)
        writeApiKeyStatusCache(null, errorMessage)
        if (!cancelled) {
          setApiKeyStatus(null)
          setApiKeyError(errorMessage)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [apiKeySignature, applyDebugAccountTier, hasApiKey, launcherPort, writeApiKeyStatusCache])

  useEffect(() => {
    let cancelled = false

    const loadSso = async () => {
      const cached = readCachedLauncherConfigurationSsoStatus()
      if (cached) {
        if (!cancelled) {
          setSsoAuthorized(cached.snapshot.status === 'authorized')
        }
        return
      }

      try {
        const snapshot = await launcherPort.getNexusSsoStatus()
        writeCachedLauncherConfigurationSsoStatus(snapshot)
        if (!cancelled) {
          setSsoAuthorized(snapshot.status === 'authorized')
        }
      } catch {
        if (!cancelled) {
          setSsoAuthorized(false)
        }
      }
    }

    void loadSso()

    return () => {
      cancelled = true
    }
  }, [launcherPort])

  const startSso = useCallback(async () => {
    setSsoStarting(true)
    try {
      await launcherPort.startNexusSso()
      const snapshot = await launcherPort.getNexusSsoStatus()
      writeCachedLauncherConfigurationSsoStatus(snapshot)
      setSsoAuthorized(snapshot.status === 'authorized')
      if (snapshot.status === 'authorized') {
        await refresh()
        await refreshApiKeyStatus({ force: true })
      }
    } catch (nextError) {
      setApiKeyError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setSsoStarting(false)
    }
  }, [launcherPort, refresh, refreshApiKeyStatus])

  return {
    apiKeyStatus,
    apiKeyError,
    apiKeyChecking,
    ssoAuthorized,
    ssoStarting,
    refreshApiKeyStatus,
    startSso,
  }
}

function ConfigMetric({
  title,
  value,
  percent,
  limit,
  warn,
}: {
  title: string
  value: string
  percent: number
  limit: string
  warn?: boolean
}) {
  return (
    <div className={cx('launcher-config-dash-metric', warn && 'launcher-config-dash-metric-warn')}>
      <div className="launcher-config-metric-head">
        <span>{title}</span>
        <span>{formatPercent(percent)}</span>
      </div>
      <div className="launcher-config-metric-value">{value}</div>
      <div className={cx('launcher-config-progress', warn && 'launcher-config-progress-warn')}>
        <i style={{ width: `${percent}%` }} />
      </div>
      <div className="launcher-config-micro">{limit}</div>
    </div>
  )
}

function ConfigApiRow({
  index,
  name,
  description,
  statusLabel,
  tone,
  resolved,
  children,
}: {
  index: number
  name: string
  description: string
  statusLabel: string
  tone: ApiRouteTone
  resolved: boolean
  children: ReactNode
}) {
  return (
    <LoadingMotionRevealItem
      index={index}
      as="div"
      className={cx('launcher-config-api-row', `launcher-config-api-row-${tone}`, resolved && 'launcher-config-api-row-resolved')}
    >
      <div className="launcher-config-api-name">
        <span className={cx('launcher-config-api-icon', `launcher-config-api-icon-${tone}`)} aria-hidden="true">
          {children}
        </span>
        <h3>{name}</h3>
      </div>
      <div className="launcher-config-api-desc">{description}</div>
      <span className={cx('launcher-config-status-tag', `launcher-config-status-tag-${tone}`)}>{statusLabel}</span>
    </LoadingMotionRevealItem>
  )
}

function ConfigNexusPanel({
  settingsState,
  account,
  copy,
  routes,
  diagnosticsRefreshing,
  onRefreshDiagnostics,
}: {
  settingsState: ReturnType<typeof useLauncherSettings>
  account: NexusApiAccountStatus
  copy: LauncherCopy
  routes: LauncherNexusRouteSnapshot[]
  diagnosticsRefreshing: boolean
  onRefreshDiagnostics: () => void
}) {
  const hasApiKey = Boolean(settingsState.settings.nexusApiKey?.trim())
  const isAuthorized = Boolean(account.apiKeyStatus || account.ssoAuthorized || hasApiKey)
  const dailyPercent = getPercent(account.apiKeyStatus?.dailyRemaining, 20_000)
  const hourlyPercent = getPercent(account.apiKeyStatus?.hourlyRemaining, 500)
  const dailyLimit = getQuotaDetail(
    copy.settings.nexusQuotaDailyLimit,
    account.apiKeyStatus?.dailyResetAt,
    getNextUtcMidnightTimestampSeconds,
    copy,
  )
  const hourlyLimit = getQuotaDetail(
    copy.settings.nexusQuotaHourlyLimit,
    account.apiKeyStatus?.hourlyResetAt,
    getNextHourTimestampSeconds,
    copy,
  )
  const displayedRoutes = getDisplayedConfigRoutes(routes, copy)

  return (
    <section
      className="launcher-config-panel launcher-config-nexus"
      aria-label={copy.settings.nexusAccessTitle}
      data-testid="launcher-config-nexus"
    >
      <ConfigPanelHeader
        title={copy.settings.nexusAccessTitle}
        description={isAuthorized ? copy.settings.nexusAccessHint : copy.settings.nexusGuestSubtitle}
        actions={
          <div className="launcher-config-actions">
            <button
              type="button"
              className="launcher-config-button launcher-config-button-brand"
              disabled={account.ssoStarting}
              onClick={() => void account.startSso()}
            >
              {isAuthorized ? copy.settings.nexusReauthorize : copy.settings.nexusSignInAction}
            </button>
            <button
              type="button"
              className="launcher-config-button"
              disabled={!hasApiKey}
              onClick={() => settingsState.updateField('nexusApiKey', null)}
            >
              {copy.settings.nexusClearApiKeyAction}
            </button>
            <button
              type="button"
              className="launcher-config-icon-button launcher-config-panel-icon-button launcher-config-refresh-button"
              aria-busy={diagnosticsRefreshing}
              aria-label={copy.configuration.nexusDiagnosticsTitle}
              title={copy.configuration.nexusDiagnosticsTitle}
              onClick={onRefreshDiagnostics}
            >
              <RefreshCw className={cx('h-3.5 w-3.5', diagnosticsRefreshing && 'animate-spin')} aria-hidden="true" />
            </button>
            <span className="launcher-config-help" title={copy.settings.nexusAccessHint}>
              <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </div>
        }
      />

      {isAuthorized ? (
        <div className="launcher-config-dashboard">
          <div className="launcher-config-dash-metrics">
            <ConfigMetric
              title={copy.settings.nexusQuotaDaily}
              value={formatNumber(account.apiKeyStatus?.dailyRemaining)}
              percent={dailyPercent}
              limit={dailyLimit}
            />
            <ConfigMetric
              title={copy.settings.nexusQuotaHourly}
              value={formatNumber(account.apiKeyStatus?.hourlyRemaining)}
              percent={hourlyPercent}
              limit={hourlyLimit}
              warn
            />
          </div>
        </div>
      ) : null}

      {!isAuthorized ? (
        <div className="launcher-config-guest-hero">
          <div>
            <h3>{copy.settings.nexusGuestTitle}</h3>
            <p>{copy.settings.nexusGuestSubtitle}</p>
          </div>
          <div className="launcher-config-actions">
            <button
              type="button"
              className="launcher-config-button launcher-config-button-primary"
              disabled={account.ssoStarting}
              onClick={() => void account.startSso()}
            >
              {copy.settings.nexusSignInAction}
            </button>
            <button
              type="button"
              className="launcher-config-button"
              onClick={() => settingsState.updateField('nexusApiKey', settingsState.settings.nexusApiKey ?? '')}
            >
              {copy.settings.nexusPasteApiKeyAction}
            </button>
          </div>
        </div>
      ) : null}

      <div className="launcher-config-api-list">
        {displayedRoutes.map((route, index) => {
          const tone = getRouteRowTone(route, account, isAuthorized)
          return (
            <ConfigApiRow
              key={route.routeId}
              index={index}
              name={getRouteDisplayName(route, copy)}
              description={getRouteDescription(route, copy)}
              tone={tone}
              statusLabel={getRouteStatusLabel(tone, copy)}
              resolved={route.status !== 'loading'}
            >
              {getRouteIcon(route.routeId)}
            </ConfigApiRow>
          )
        })}
      </div>

      {account.apiKeyError ? <p className="launcher-config-api-error">{`Log: ${account.apiKeyError}`}</p> : null}
    </section>
  )
}

function NotificationTestButtons({ labels, debugEnabled }: { labels: DebugButtonGroup; debugEnabled: boolean }) {
  const notify = (level: AppEventLevel, title: string) => {
    reportAppEvent({
      level,
      title,
      description: `Launcher debug notification test: ${level}`,
      debugDiagnosticsEnabled: debugEnabled,
      keyValues: {
        source: 'launcher-configuration-page',
        kind: 'notification-test',
        level,
      },
    })
  }

  return (
    <div className="launcher-toolbar">
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-debug"
        onClick={() => notify('debug', labels.debug)}
      >
        {labels.debug}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-info"
        onClick={() => notify('info', labels.info)}
      >
        {labels.info}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-success"
        onClick={() => notify('success', labels.success)}
      >
        {labels.success}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-warning"
        onClick={() => notify('warning', labels.warning)}
      >
        {labels.warning}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-error"
        onClick={() => notify('error', labels.error)}
      >
        {labels.error}
      </button>
    </div>
  )
}

function LogTestButtons({ labels, debugEnabled }: { labels: DebugLogButtonGroup; debugEnabled: boolean }) {
  const logOnly = (level: Extract<AppEventLevel, 'debug' | 'info' | 'warning' | 'error'>, title: string) => {
    reportAppEvent({
      level,
      title,
      description: `Launcher debug log test: ${level}`,
      debugDiagnosticsEnabled: debugEnabled,
      notify: false,
      keyValues: {
        source: 'launcher-configuration-page',
        kind: 'log-test',
        level,
      },
    })
  }

  return (
    <div className="launcher-toolbar">
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-debug"
        onClick={() => logOnly('debug', labels.debug)}
      >
        {labels.debug}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-info"
        onClick={() => logOnly('info', labels.info)}
      >
        {labels.info}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-warning"
        onClick={() => logOnly('warning', labels.warning)}
      >
        {labels.warning}
      </button>
      <button
        type="button"
        className="control-button launcher-debug-level-button launcher-debug-level-button-error"
        onClick={() => logOnly('error', labels.error)}
      >
        {labels.error}
      </button>
    </div>
  )
}

type LauncherConfigurationPageProps = {
  debugEnabled: boolean
  onToggleDebugMode: () => void
  onLauncherDiagnosticsUpdate?: (diagnostics: LauncherNexusDiagnosticsResult) => void
  settingsState: ReturnType<typeof useLauncherSettings>
  downloads: ReturnType<typeof useLauncherDownloads>
}

function DebugModeSwitch({
  checked,
  title,
  enabledLabel,
  disabledLabel,
  onToggle,
}: {
  checked: boolean
  title: string
  enabledLabel: string
  disabledLabel: string
  onToggle: () => void
}) {
  const titleId = useId()

  return (
    <section className="launcher-debug-tool-card">
      <div className="launcher-debug-tool-header launcher-debug-tool-header-center">
        <div className="launcher-debug-setting">
          <span className="launcher-debug-setting-icon" aria-hidden="true">
            <Bug className="h-4 w-4" />
          </span>
          <div className="launcher-debug-setting-copy">
            <h2 id={titleId} className="launcher-debug-tool-title">
              {title}
            </h2>
          </div>
        </div>

        <button
          type="button"
          className={cx('settings-switch', checked && 'settings-switch-active')}
          role="switch"
          aria-checked={checked}
          aria-labelledby={titleId}
          title={checked ? disabledLabel : enabledLabel}
          onClick={onToggle}
        >
          <span className="settings-switch-copy">{checked ? disabledLabel : enabledLabel}</span>
          <span className="settings-switch-track" aria-hidden="true">
            <span className="settings-switch-thumb" />
          </span>
        </button>
      </div>
    </section>
  )
}

function DebugToolCard({
  title,
  icon,
  headerActions,
  children,
  tone,
}: {
  title: string
  icon: ReactNode
  headerActions?: ReactNode
  children?: ReactNode
  tone?: 'danger' | 'warning'
}) {
  return (
    <section className={cx('launcher-debug-tool-card', (tone === 'danger' || tone === 'warning') && 'launcher-debug-tool-card-danger')}>
      <div className="launcher-debug-tool-header">
        <div className="launcher-debug-tool-copy">
          <h2 className="launcher-debug-tool-title">{title}</h2>
        </div>
        <div className="launcher-debug-tool-header-side">
          {headerActions ? <div className="launcher-debug-tool-header-actions">{headerActions}</div> : null}
          {icon ? (
            <span className="launcher-debug-tool-badge" aria-hidden="true">
              {icon}
            </span>
          ) : null}
        </div>
      </div>
      {children != null ? <div className="launcher-debug-tool-tray">{children}</div> : null}
    </section>
  )
}

export function LauncherConfigurationPage({
  debugEnabled,
  onToggleDebugMode,
  onLauncherDiagnosticsUpdate,
  settingsState,
  downloads,
}: LauncherConfigurationPageProps) {
  const rootCopy = useEditorCopy()
  const copy = rootCopy.launcher
  const settingsCopy = useSettingsMenuCopy()
  const commonCopy = rootCopy.common
  const [debugToolsExpanded, setDebugToolsExpanded] = useState(false)
  const [bbcodePreviewExpanded, setBbcodePreviewExpanded] = useState(false)
  const [diagnosticRoutes, setDiagnosticRoutes] = useState<LauncherNexusRouteSnapshot[]>([])
  const [lastDiagnosticsAt, setLastDiagnosticsAt] = useState<number | null>(null)
  const [diagnosticsRefreshing, setDiagnosticsRefreshing] = useState(false)
  const [forceOffline, setForceOffline] = useState(() => getAppUiStateSnapshot().launcher.forceOffline)
  const [forceOfflineBusy, setForceOfflineBusy] = useState(false)
  const [forceNonPremium, setForceNonPremium] = useState(() => getAppUiStateSnapshot().launcher.forceNonPremium)
  const [forceNonPremiumBusy, setForceNonPremiumBusy] = useState(false)
  const [diagnosticsPollNonce] = useState(0)
  const [diagnosticsRestartNonce, setDiagnosticsRestartNonce] = useState(0)
  const [installedModCount, setInstalledModCount] = useState<number | null>(null)
  const [runtimeInfo, setRuntimeInfo] = useState<LauncherRuntimeInfo | null>(null)
  const launcherPort = useLauncherPort()
  const account = useNexusApiAccountStatus(settingsState, forceNonPremium)
  const warningState = getLauncherWarningState(settingsState.settings)
  const configuredPaths = countConfiguredPaths(settingsState.settings)
  const hasCredentials = !warningState.missingCredentials
  const warningDiagnostics = hasWarningDiagnostics(diagnosticRoutes)
  const stepItems: ConfigStep[] = [
    {
      id: 'paths',
      label: copy.settings.stepPaths,
      detail: copy.settings.configuredPathsSummary(configuredPaths, 3),
      tone: configuredPaths === 3 ? 'ok' : configuredPaths > 0 ? 'warn' : 'danger',
    },
    {
      id: 'nexus',
      label: copy.settings.stepNexus,
      detail: hasCredentials ? copy.settings.nexusReady : copy.settings.nexusMissing,
      tone: hasCredentials ? 'ok' : 'danger',
    },
    {
      id: 'downloads',
      label: copy.settings.stepDownloads,
      detail: settingsState.settings.autoCheckModUpdates ? copy.settings.downloadsReady : copy.settings.downloadsLimited,
      tone: settingsState.settings.autoCheckModUpdates ? 'ok' : 'warn',
    },
    {
      id: 'diagnostics',
      label: copy.settings.stepDiagnostics,
      detail: warningDiagnostics ? copy.settings.diagnosticsReview : copy.settings.diagnosticsHealthy,
      tone: warningDiagnostics ? 'warn' : 'ok',
    },
  ]
  const readyStepCount = stepItems.filter((step) => step.tone === 'ok').length
  const issueStepCount = stepItems.length - readyStepCount
  const overallStatus = issueStepCount > 0 ? copy.settings.configurationNeedsReview : copy.settings.configurationReady
  const modCountLabel =
    installedModCount == null
      ? copy.settings.configurationInstalledModsUnknown
      : copy.settings.configurationInstalledMods(installedModCount)
  const diagnosticsAgeLabel = getDiagnosticsAgeLabel(lastDiagnosticsAt, copy)
  const headerStatusLine = copy.settings.configurationStatusLine(overallStatus, modCountLabel, diagnosticsAgeLabel)
  const gameVersion = runtimeInfo?.gameVersion ?? null
  const smapiVersion = runtimeInfo?.smapiVersion ?? null
  const debugSimulationActive = downloads.activeItems.some((item) => item.source === 'debug' && item.status === 'downloading')
  const diagnosticsApiKeySignature = getConfigurationDiagnosticsApiKeySignature(settingsState.settings)
  const handleDiagnosticsUpdate = useCallback(
    (diagnostics: LauncherNexusDiagnosticsResult) => {
      setDiagnosticRoutes(diagnostics.routes)
      setLastDiagnosticsAt(Date.now())
      onLauncherDiagnosticsUpdate?.(diagnostics)
    },
    [onLauncherDiagnosticsUpdate],
  )
  useEffect(() => {
    let disposed = false
    const modsPath = settingsState.settings.modsPath?.trim()

    const loadInstalledModCount = async () => {
      if (!modsPath) {
        if (!disposed) {
          setInstalledModCount(null)
        }
        return
      }

      const cached = readCachedLauncherConfigurationLibraryScan({ modsPath })
      if (cached) {
        if (!disposed) {
          setInstalledModCount(cached.result.mods.length)
        }
        return
      }

      try {
        const result = await launcherPort.scanLibrary({ modsPath })
        writeCachedLauncherConfigurationLibraryScan(result, { modsPath })
        if (!disposed) {
          setInstalledModCount(result.mods.length)
        }
      } catch {
        if (!disposed) {
          setInstalledModCount(null)
        }
      }
    }

    void loadInstalledModCount()

    return () => {
      disposed = true
    }
  }, [launcherPort, settingsState.settings.modsPath])
  useEffect(() => {
    let disposed = false
    const gamePath = settingsState.settings.gamePath?.trim() ?? ''

    const loadRuntimeInfo = async () => {
      const cached = readCachedLauncherConfigurationRuntimeInfo({ gamePath })
      if (cached) {
        if (!disposed) {
          setRuntimeInfo(cached.info)
        }
        return
      }

      try {
        const info = await launcherPort.loadRuntimeInfo()
        writeCachedLauncherConfigurationRuntimeInfo(info, { gamePath })
        if (!disposed) {
          setRuntimeInfo(info)
        }
      } catch {
        if (!disposed) {
          setRuntimeInfo(null)
        }
      }
    }

    void loadRuntimeInfo()

    return () => {
      disposed = true
    }
  }, [launcherPort, settingsState.settings.gamePath])
  useEffect(() => {
    if (!canUseDesktopHost()) {
      return
    }

    let disposed = false
    let timeoutId: number | null = null
    let shouldRestartDiagnostics = diagnosticsRestartNonce > 0
    const cachedDiagnostics = shouldRestartDiagnostics
      ? null
      : readCachedLauncherConfigurationDiagnostics({
          apiKeySignature: diagnosticsApiKeySignature,
        })

    const poll = async () => {
      if (cachedDiagnostics) {
        setDiagnosticRoutes(cachedDiagnostics.diagnostics.routes)
        setLastDiagnosticsAt(cachedDiagnostics.cachedAt)
        onLauncherDiagnosticsUpdate?.(cachedDiagnostics.diagnostics)
        if (!cachedDiagnostics.shouldRefresh) {
          setDiagnosticsRefreshing(false)
          return
        }
      }

      try {
        const diagnostics = shouldRestartDiagnostics ? await restartLauncherNexusDiagnostics() : await loadLauncherNexusDiagnostics()
        shouldRestartDiagnostics = false
        if (disposed) {
          return
        }
        writeCachedLauncherConfigurationDiagnostics(diagnostics, {
          apiKeySignature: diagnosticsApiKeySignature,
        })
        handleDiagnosticsUpdate(diagnostics)
        setDiagnosticsRefreshing(false)
        if (diagnostics.routes.some((route) => route.status === 'loading')) {
          timeoutId = window.setTimeout(() => {
            void poll()
          }, 1000)
        }
      } catch {
        if (!disposed) {
          handleDiagnosticsUpdate({ routes: [] })
          setDiagnosticsRefreshing(false)
        }
      }
    }

    void poll()

    return () => {
      disposed = true
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [diagnosticsApiKeySignature, diagnosticsPollNonce, diagnosticsRestartNonce, handleDiagnosticsUpdate, onLauncherDiagnosticsUpdate])
  const handleRefreshDiagnostics = useCallback(() => {
    setDiagnosticsRefreshing(true)
    setDiagnosticRoutes(getDefaultConfigRoutes(copy))
    setDiagnosticsRestartNonce((value) => value + 1)
  }, [copy])
  const handleViewLogs = useCallback(() => {
    setDebugToolsExpanded(true)
    window.requestAnimationFrame(() => {
      document.querySelector('[data-loading-section="launcher-debug-logs"]')?.scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
    })
  }, [])
  const handleToggleForceOffline = useCallback(async () => {
    const nextForceOffline = !forceOffline
    setForceOfflineBusy(true)

    try {
      const diagnostics = await setLauncherNexusForceOffline(nextForceOffline)
      await applyAppUiStatePatch({
        launcher: {
          forceOffline: nextForceOffline,
        },
      })
      setForceOffline(nextForceOffline)
      writeCachedLauncherConfigurationDiagnostics(diagnostics as LauncherNexusDiagnosticsResult, {
        apiKeySignature: diagnosticsApiKeySignature,
      })
      handleDiagnosticsUpdate(diagnostics as LauncherNexusDiagnosticsResult)
      if (diagnostics.routes.some((route) => route.status === 'loading')) {
        handleRefreshDiagnostics()
      }
    } catch {
      // The config page should keep the last visible route state if the debug override fails.
    } finally {
      setForceOfflineBusy(false)
    }
  }, [diagnosticsApiKeySignature, forceOffline, handleDiagnosticsUpdate, handleRefreshDiagnostics])
  const handleToggleForceNonPremium = useCallback(async () => {
    const nextForceNonPremium = !forceNonPremium
    setForceNonPremiumBusy(true)

    try {
      await applyAppUiStatePatch({
        launcher: {
          forceNonPremium: nextForceNonPremium,
        },
      })
      setForceNonPremium(nextForceNonPremium)
      await account.refreshApiKeyStatus({
        force: true,
        forceNonPremium: nextForceNonPremium,
      })
    } catch {
      // Debug-only account tier override should keep the current visible state on failure.
    } finally {
      setForceNonPremiumBusy(false)
    }
  }, [account, forceNonPremium])
  const handleClearLauncherImageCache = () => {
    void clearLauncherImageCache().catch(() => {
      // Debug-only affordance: ignore desktop bridge failures here.
    })
  }

  return (
    <section className="launcher-configuration-page">
      <div className="launcher-configuration-canvas">
        <LoadingMotionReveal itemId="launcher-configuration-header" index={0}>
          <header className="launcher-configuration-page-header">
            <div className="launcher-config-title-cluster">
              <div className="launcher-config-breadcrumb">{copy.settings.configurationBreadcrumb}</div>
              <h1 className="launcher-configuration-page-title">{copy.settings.configurationGameTitle}</h1>
              <p className="launcher-config-header-status">{headerStatusLine}</p>
            </div>
            <div className="launcher-config-header-actions">
              <div className="launcher-config-env-tags" aria-label={copy.settings.configurationGameTitle}>
                <span className="launcher-config-env-tag">
                  {gameVersion ? copy.settings.configurationGameVersionTag(gameVersion) : copy.settings.configurationVersionUnknown}
                </span>
                <span className="launcher-config-env-tag">
                  {smapiVersion ? copy.settings.configurationSmapiVersionTag(smapiVersion) : copy.settings.configurationVersionUnknown}
                </span>
              </div>
              <div className="launcher-config-header-button-group">
                <button
                  type="button"
                  className="launcher-config-button launcher-config-button-brand"
                  aria-busy={diagnosticsRefreshing}
                  onClick={handleRefreshDiagnostics}
                >
                  {copy.settings.configurationRunDiagnostics}
                </button>
                <button type="button" className="launcher-config-button" onClick={handleViewLogs}>
                  {copy.settings.configurationViewLogs}
                </button>
              </div>
            </div>
          </header>
        </LoadingMotionReveal>

        <div className="launcher-config-layout">
          <main className="launcher-config-main-column">
            <LoadingMotionReveal itemId="launcher-settings-panel" index={1}>
              <ConfigPathPanel settingsState={settingsState} copy={copy} browseLabel={rootCopy.controls.browse} />
            </LoadingMotionReveal>

            <LoadingMotionReveal itemId="launcher-config-network" index={2}>
              <ConfigNexusPanel
                settingsState={settingsState}
                account={account}
                copy={copy}
                routes={diagnosticRoutes}
                diagnosticsRefreshing={diagnosticsRefreshing}
                onRefreshDiagnostics={handleRefreshDiagnostics}
              />
            </LoadingMotionReveal>
          </main>

          <aside className="launcher-config-rail">
            <ConfigCompletionRail title={copy.settings.completionTitle} steps={stepItems} />
            <ConfigAccountCard account={account} copy={copy} />
            <ConfigDownloadDefaults settings={settingsState.settings} copy={copy} yesLabel={commonCopy.yes} noLabel={commonCopy.no} />
          </aside>
        </div>

        <section className="launcher-config-tools" aria-label={copy.configuration.moreToolsTitle}>
          <LoadingMotionReveal itemId="launcher-debug-tools-toggle" index={3}>
            <section className="launcher-debug-more-card">
              <div className="launcher-debug-tool-copy">
                <h2 className="launcher-debug-tool-title">{copy.configuration.moreToolsTitle}</h2>
              </div>
              <button
                type="button"
                className="control-button launcher-debug-more-button"
                aria-expanded={debugToolsExpanded}
                onClick={() => setDebugToolsExpanded((value) => !value)}
              >
                <span>{debugToolsExpanded ? copy.configuration.lessToolsAction : copy.configuration.moreToolsAction}</span>
                <ChevronDown className={cx('h-4 w-4', debugToolsExpanded && 'rotate-180')} aria-hidden="true" />
              </button>
            </section>
          </LoadingMotionReveal>

          {debugToolsExpanded ? (
            <div className="launcher-debug-tools-stack">
              <LoadingMotionReveal itemId="launcher-debug-overview" index={4}>
                <section className="launcher-debug-overview-card" aria-label={copy.configuration.moreToolsTitle}>
                  <div className="launcher-debug-stat-card launcher-debug-stat-card-primary">
                    <strong className="launcher-debug-overview-value">5</strong>
                    <span className="launcher-debug-overview-label">{copy.configuration.notificationsOverviewTitle}</span>
                  </div>
                  <div className="launcher-debug-stat-card launcher-debug-stat-card-neutral">
                    <strong className="launcher-debug-overview-value">4</strong>
                    <span className="launcher-debug-overview-label">{copy.configuration.logsOverviewTitle}</span>
                  </div>
                </section>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-mode" index={5}>
                <DebugModeSwitch
                  checked={debugEnabled}
                  title={copy.configuration.debugOnlyTitle}
                  enabledLabel={settingsCopy.enableDebugModeLabel}
                  disabledLabel={settingsCopy.disableDebugModeLabel}
                  onToggle={onToggleDebugMode}
                />
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-force-offline" index={6}>
                <DebugToolCard
                  title={copy.configuration.forceOfflineEnableButton}
                  icon={<Network className="h-4 w-4" />}
                  tone="danger"
                  headerActions={
                    <div className="launcher-toolbar">
                      <button
                        type="button"
                        className={cx(
                          'control-button launcher-config-danger-button',
                          forceOffline && 'launcher-config-danger-button-active',
                        )}
                        disabled={!canUseDesktopHost() || forceOfflineBusy}
                        onClick={handleToggleForceOffline}
                      >
                        {forceOffline ? copy.configuration.forceOfflineDisableButton : copy.configuration.forceOfflineEnableButton}
                      </button>
                    </div>
                  }
                />
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-force-non-premium" index={7}>
                <DebugToolCard
                  title={copy.configuration.forceNonPremiumEnableButton}
                  icon={<Crown className="h-4 w-4" />}
                  tone="warning"
                  headerActions={
                    <div className="launcher-toolbar">
                      <button
                        type="button"
                        className={cx(
                          'control-button launcher-config-danger-button',
                          forceNonPremium && 'launcher-config-danger-button-active',
                        )}
                        disabled={!canUseDesktopHost() || forceNonPremiumBusy}
                        onClick={handleToggleForceNonPremium}
                      >
                        {forceNonPremium ? copy.configuration.forceNonPremiumDisableButton : copy.configuration.forceNonPremiumEnableButton}
                      </button>
                      <span className="dock-chip">
                        {forceNonPremium ? copy.configuration.forceNonPremiumEnabledLabel : copy.configuration.forceNonPremiumDisabledLabel}
                      </span>
                    </div>
                  }
                />
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-notifications" index={8}>
                <DebugToolCard title={copy.configuration.notificationsTitle} icon={<MessageSquare className="h-4 w-4" />}>
                  <NotificationTestButtons labels={copy.configuration.notificationButtons} debugEnabled={debugEnabled} />
                </DebugToolCard>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-logs" index={9}>
                <DebugToolCard title={copy.configuration.logsTitle} icon={<ScrollText className="h-4 w-4" />}>
                  <LogTestButtons labels={copy.configuration.logButtons} debugEnabled={debugEnabled} />
                </DebugToolCard>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-image-cache" index={10}>
                <DebugToolCard
                  title={copy.configuration.clearImageCacheTitle}
                  icon={<ScrollText className="h-4 w-4" />}
                  headerActions={
                    <div className="launcher-toolbar">
                      <button type="button" className="control-button" onClick={handleClearLauncherImageCache}>
                        {copy.configuration.clearImageCacheButton}
                      </button>
                    </div>
                  }
                />
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-bbcode-preview" index={11}>
                <DebugToolCard
                  title={copy.configuration.bbcodePreviewTitle}
                  icon={<Code2 className="h-4 w-4" />}
                  headerActions={
                    <div className="launcher-toolbar">
                      <button
                        type="button"
                        className="control-button"
                        aria-expanded={bbcodePreviewExpanded}
                        onClick={() => setBbcodePreviewExpanded((value) => !value)}
                      >
                        {bbcodePreviewExpanded
                          ? copy.configuration.bbcodePreviewCollapseAction
                          : copy.configuration.bbcodePreviewExpandAction}
                      </button>
                    </div>
                  }
                >
                  {bbcodePreviewExpanded ? (
                    <div className="launcher-debug-bbcode-preview" data-testid="launcher-debug-bbcode-preview">
                      <NexusModsBbcode source={nexusModsBbcodeSample} />
                    </div>
                  ) : null}
                </DebugToolCard>
              </LoadingMotionReveal>

              <LoadingMotionReveal itemId="launcher-debug-simulation" index={12}>
                <DebugToolCard
                  title={copy.configuration.simulationTitle}
                  icon={<Download className="h-4 w-4" />}
                  headerActions={
                    <div className="launcher-toolbar">
                      <button
                        type="button"
                        className="control-button control-button-primary"
                        onClick={() => downloads.startDebugSimulation(copy.configuration.simulationTitle)}
                        disabled={debugSimulationActive}
                      >
                        {debugSimulationActive ? copy.configuration.simulationButtonRunning : copy.configuration.simulationButtonIdle}
                      </button>
                      <span className="dock-chip">2 MB/s · 10s · 20 MB</span>
                    </div>
                  }
                />
              </LoadingMotionReveal>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  )
}
