import type {
  InstallSmapiUpdateRequest,
  SmapiInstallerDownloadCandidate,
  SmapiUpdateCheckResult,
  SmapiUpdateDownloadInfo,
  SmapiUpdatePhase,
  SmapiUpdateRequiredByMod,
  SmapiVersionSource,
} from './launcherContracts'
import { isUpdateAvailable } from './versionCompare'

/**
 * Derivation model for the SMAPI update card on the launcher configuration page.
 * Kept free of locale strings and DOM concerns so the state transitions are unit-testable.
 */

/** Current install run surfaced by progress events. */
export type SmapiUpdateInstallRun = {
  jobId: string
  phase: SmapiUpdatePhase
  percent: number | null
  message: string
}

/** State of the local installer-download scan shown inside the update card. */
export type SmapiInstallerScanState = 'idle' | 'scanning' | 'ready' | 'failed'

/** Which primary install action the update card offers for the available update. */
export type SmapiUpdateActionMode = 'github' | 'nexus' | 'none'

/** UI state of the SMAPI update card, derived from the check/install results. */
export type SmapiUpdateCardStatus =
  | { kind: 'not-configured' }
  | { kind: 'checking' }
  | {
      kind: 'up-to-date'
      installedVersion: string
      targetVersion: string
      gameVersion: string
      latestStableVersion: string
    }
  | {
      kind: 'update-available'
      installedVersion: string
      targetVersion: string
      latestStableVersion: string
      requiredByMods: SmapiUpdateRequiredByMod[]
      /** Which source produced the latest-version lookup (`github` or `nexus`). */
      versionSource: SmapiVersionSource
      /** Source-aware download payload prepared by the backend, when any exists. */
      download: SmapiUpdateDownloadInfo | null
      /** Best usable locally downloaded installer archive, when the scan found one. */
      installerCandidate: SmapiInstallerDownloadCandidate | null
      installerScanState: SmapiInstallerScanState
      installerScanError: string | null
    }
  | { kind: 'check-failed'; message: string }
  | {
      kind: 'installing'
      phase: SmapiUpdatePhase
      percent: number | null
      message: string
      cancellable: boolean
      targetVersion: string
    }
  | { kind: 'install-success'; installedVersion: string }
  | { kind: 'install-failed'; message: string }

export type SmapiUpdateCardDerivationInput = {
  gamePathConfigured: boolean
  checkResult: SmapiUpdateCheckResult | null
  checking: boolean
  checkError: string | null
  installRun: SmapiUpdateInstallRun | null
  installError: string | null
  installSuccessVersion: string | null
  /** Locally downloaded installer candidates; null until the scan completes or fails. */
  installerCandidates: SmapiInstallerDownloadCandidate[] | null
  installerScanning: boolean
  installerScanError: string | null
}

/** Maps the raw check/install state into the single UI status rendered by the card. */
export function deriveSmapiUpdateCardStatus(input: SmapiUpdateCardDerivationInput): SmapiUpdateCardStatus {
  if (!input.gamePathConfigured) {
    return { kind: 'not-configured' }
  }

  if (input.installRun) {
    return {
      kind: 'installing',
      phase: input.installRun.phase,
      percent: input.installRun.percent,
      message: input.installRun.message,
      cancellable: isSmapiInstallCancellable(input.installRun.phase),
      targetVersion: input.checkResult?.targetVersion ?? '',
    }
  }

  if (input.installError) {
    return { kind: 'install-failed', message: input.installError }
  }

  // A successful install stays visible until the follow-up check confirms the new version.
  if (input.installSuccessVersion) {
    return { kind: 'install-success', installedVersion: input.installSuccessVersion }
  }

  if (input.checking) {
    return { kind: 'checking' }
  }

  if (input.checkError) {
    return { kind: 'check-failed', message: input.checkError }
  }

  const result = input.checkResult
  if (!result) {
    return { kind: 'checking' }
  }

  if (result.updateAvailable) {
    return {
      kind: 'update-available',
      installedVersion: result.installedVersion,
      targetVersion: result.targetVersion,
      latestStableVersion: result.latestStableVersion,
      requiredByMods: result.requiredByMods ?? [],
      versionSource: result.versionSource,
      download: result.download ?? null,
      installerCandidate: selectSmapiInstallerCandidate(input.installerCandidates ?? []),
      installerScanState: deriveSmapiInstallerScanState(input),
      installerScanError: input.installerScanError,
    }
  }

  return {
    kind: 'up-to-date',
    installedVersion: result.installedVersion,
    targetVersion: result.targetVersion,
    gameVersion: result.gameVersion,
    latestStableVersion: result.latestStableVersion,
  }
}

function deriveSmapiInstallerScanState(input: SmapiUpdateCardDerivationInput): SmapiInstallerScanState {
  if (input.installerScanning) {
    return 'scanning'
  }
  if (input.installerScanError) {
    return 'failed'
  }
  return input.installerCandidates === null ? 'idle' : 'ready'
}

/** Cancellation is only honored while the SMAPI installer is still downloading. */
export function isSmapiInstallCancellable(phase: SmapiUpdatePhase) {
  return phase === 'downloading'
}

/** Normalizes a progress percentage into a clamped 0-100 integer, or null when absent. */
export function clampSmapiProgressPercent(percent: number | null | undefined) {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    return null
  }
  return Math.max(0, Math.min(100, Math.round(percent)))
}

/** Returns the trimmed minimum API version when a mod card should show the SMAPI badge. */
export function getSmapiRequirementBadgeVersion(mod: { requiresNewerSmapi?: boolean; minimumApiVersion?: string | null }) {
  if (!mod.requiresNewerSmapi) {
    return null
  }
  const version = mod.minimumApiVersion?.trim() ?? ''
  return version || null
}

/**
 * Decides whether a follow-up check result after a successful install reflects the new
 * installation. The backend disk-caches checks for 30 minutes; when the cached result is
 * identical to the pre-install result, the card keeps showing the install success instead
 * of flipping back to "update available".
 */
export function shouldAcceptSmapiRecheckResult(
  previous: SmapiUpdateCheckResult | null,
  next: SmapiUpdateCheckResult,
  installedVersion: string,
) {
  if (!next.updateAvailable) {
    return true
  }
  if (next.installedVersion !== previous?.installedVersion) {
    return true
  }
  return next.installedVersion === installedVersion
}

/**
 * A locally downloaded installer archive can be offered when it satisfies the current
 * target version; when the backend could not resolve flags (null), the version is still
 * offered unless it is explicitly incompatible with the game.
 */
export function isSmapiInstallerCandidateUsable(candidate: SmapiInstallerDownloadCandidate) {
  if (candidate.satisfiesTarget === true) {
    return true
  }
  if (candidate.satisfiesTarget === false) {
    return false
  }
  return candidate.compatible !== false
}

/** Picks the newest usable locally downloaded installer archive, or null when none is usable. */
export function selectSmapiInstallerCandidate(candidates: SmapiInstallerDownloadCandidate[]): SmapiInstallerDownloadCandidate | null {
  let best: SmapiInstallerDownloadCandidate | null = null
  for (const candidate of candidates) {
    if (!isSmapiInstallerCandidateUsable(candidate)) {
      continue
    }
    if (!best || isUpdateAvailable(best.version, candidate.version)) {
      best = candidate
    }
  }
  return best
}

/** Maps the backend download payload onto the primary install action the card offers. */
export function deriveSmapiUpdateActionMode(download: SmapiUpdateDownloadInfo | null | undefined): SmapiUpdateActionMode {
  if (!download) {
    return 'none'
  }
  if (download.source === 'nexus') {
    return 'nexus'
  }
  return download.url?.trim() ? 'github' : 'none'
}

/**
 * Builds the install request for a locally downloaded installer archive. The known
 * GitHub digest is only attached when the candidate version matches the checked target
 * version (the digest belongs to the target release's asset); otherwise the backend
 * validates the archive structurally.
 */
export function buildSmapiLocalInstallRequest(
  candidate: SmapiInstallerDownloadCandidate,
  checkResult: SmapiUpdateCheckResult | null,
): InstallSmapiUpdateRequest {
  const download = checkResult?.download
  const digestMatchesTarget =
    download?.source === 'github' &&
    Boolean(download.sha256?.trim()) &&
    Boolean(checkResult?.targetVersion) &&
    candidate.version === checkResult?.targetVersion
  return {
    targetVersion: candidate.version,
    localFilePath: candidate.path,
    ...(digestMatchesTarget && download?.sha256 ? { expectedSha256: download.sha256 } : {}),
  }
}

const SMAPI_INSTALLER_VERSION_PATTERN = /^\d+(?:\.\d+){1,3}$/u

/**
 * Parses the SMAPI version out of a recognized installer archive file name, mirroring
 * the backend naming rules:
 * - GitHub: `SMAPI-{version}-installer.zip` and `SMAPI-{version}-installer-double-zipped.zip`;
 * - Nexus: `SMAPI {version}-2400-{version digits}-{timestamp}.zip`.
 * Returns null for anything that is not a recognized SMAPI installer archive.
 */
export function parseSmapiInstallerFileNameVersion(fileName: string): string | null {
  const trimmed = fileName.trim()
  const lower = trimmed.toLowerCase()

  for (const suffix of ['-installer-double-zipped.zip', '-installer.zip']) {
    if (lower.startsWith('smapi-') && lower.endsWith(suffix)) {
      const version = trimmed.slice('SMAPI-'.length, trimmed.length - suffix.length).trim()
      return SMAPI_INSTALLER_VERSION_PATTERN.test(version) ? version : null
    }
  }

  if (lower.startsWith('smapi ') && trimmed.endsWith('.zip')) {
    const rest = trimmed.slice('SMAPI '.length, trimmed.length - '.zip'.length)
    const segments = rest.split('-')
    const version = segments[0] ?? ''
    if (segments[1] !== '2400' || !SMAPI_INSTALLER_VERSION_PATTERN.test(version)) {
      return null
    }
    const versionDigits = version.split('.')
    const remaining = segments.slice(2)
    if (remaining.length <= versionDigits.length) {
      return null
    }
    for (let index = 0; index < versionDigits.length; index += 1) {
      if (remaining[index] !== versionDigits[index]) {
        return null
      }
    }
    for (let index = versionDigits.length; index < remaining.length; index += 1) {
      if (!/^\d+$/u.test(remaining[index] ?? '')) {
        return null
      }
    }
    return version
  }

  return null
}
