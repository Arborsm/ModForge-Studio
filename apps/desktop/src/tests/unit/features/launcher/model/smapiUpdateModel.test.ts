import { describe, expect, it } from 'vite-plus/test'
import {
  buildSmapiLocalInstallRequest,
  clampSmapiProgressPercent,
  deriveSmapiUpdateActionMode,
  deriveSmapiUpdateCardStatus,
  getSmapiRequirementBadgeVersion,
  isSmapiInstallCancellable,
  isSmapiInstallerCandidateUsable,
  parseSmapiInstallerFileNameVersion,
  selectSmapiInstallerCandidate,
  shouldAcceptSmapiRecheckResult,
  type SmapiUpdateCardDerivationInput,
} from '@features/launcher/model/smapiUpdateModel'
import type {
  SmapiInstallerDownloadCandidate,
  SmapiUpdateCheckResult,
  SmapiUpdateDownloadInfo,
} from '@features/launcher/model/launcherContracts'

function createDownload(overrides: Partial<SmapiUpdateDownloadInfo> = {}): SmapiUpdateDownloadInfo {
  return {
    source: 'github',
    url: 'https://smapi.io/download/SMAPI-4.1.10-installer.zip',
    sha256: 'abc123',
    assetName: 'SMAPI-4.1.10-installer.zip',
    ...overrides,
  }
}

function createCheckResult(overrides: Partial<SmapiUpdateCheckResult> = {}): SmapiUpdateCheckResult {
  return {
    installedVersion: '4.0.8',
    gameVersion: '1.6.15',
    latestStableVersion: '4.1.10',
    targetVersion: '4.1.10',
    updateAvailable: true,
    versionSource: 'github',
    requiredByMods: [],
    download: createDownload(),
    ...overrides,
  }
}

function createCandidate(overrides: Partial<SmapiInstallerDownloadCandidate> = {}): SmapiInstallerDownloadCandidate {
  return {
    path: 'C:\\Users\\Mock\\Downloads\\SMAPI-4.1.10-installer.zip',
    fileName: 'SMAPI-4.1.10-installer.zip',
    version: '4.1.10',
    doubleZipped: false,
    naming: 'github',
    compatible: true,
    satisfiesTarget: true,
    ...overrides,
  }
}

function createInput(overrides: Partial<SmapiUpdateCardDerivationInput> = {}): SmapiUpdateCardDerivationInput {
  return {
    gamePathConfigured: true,
    checkResult: null,
    checking: false,
    checkError: null,
    installRun: null,
    installError: null,
    installSuccessVersion: null,
    installerCandidates: null,
    installerScanning: false,
    installerScanError: null,
    ...overrides,
  }
}

describe('deriveSmapiUpdateCardStatus', () => {
  it('reports not-configured before any other state when the game path is missing', () => {
    expect(deriveSmapiUpdateCardStatus(createInput({ gamePathConfigured: false, checkError: 'boom' }))).toEqual({
      kind: 'not-configured',
    })
  })

  it('starts in the checking state before any check result is available', () => {
    expect(deriveSmapiUpdateCardStatus(createInput())).toEqual({ kind: 'checking' })
  })

  it('shows checking while a check is in flight even when a previous result exists', () => {
    const result = createInput({ checkResult: createCheckResult({ updateAvailable: false }), checking: true })
    expect(deriveSmapiUpdateCardStatus(result)).toEqual({ kind: 'checking' })
  })

  it('derives the up-to-date state from a check without an update', () => {
    const result = createCheckResult({ updateAvailable: false })
    expect(deriveSmapiUpdateCardStatus(createInput({ checkResult: result }))).toEqual({
      kind: 'up-to-date',
      installedVersion: '4.0.8',
      targetVersion: '4.1.10',
      gameVersion: '1.6.15',
      latestStableVersion: '4.1.10',
    })
  })

  it('derives the update-available state with affected mods and source-aware download', () => {
    const result = createCheckResult({
      versionSource: 'nexus',
      download: createDownload({
        source: 'nexus',
        url: null,
        sha256: null,
        nexusModPageUrl: 'https://www.nexusmods.com/stardewvalley/mods/2400',
      }),
      requiredByMods: [{ modId: 'ModForge.NPCAdventures', modName: 'NPC Adventures', minimumApiVersion: '4.1.0' }],
    })
    expect(deriveSmapiUpdateCardStatus(createInput({ checkResult: result }))).toEqual({
      kind: 'update-available',
      installedVersion: '4.0.8',
      targetVersion: '4.1.10',
      latestStableVersion: '4.1.10',
      requiredByMods: [{ modId: 'ModForge.NPCAdventures', modName: 'NPC Adventures', minimumApiVersion: '4.1.0' }],
      versionSource: 'nexus',
      download: {
        source: 'nexus',
        url: null,
        sha256: null,
        assetName: 'SMAPI-4.1.10-installer.zip',
        nexusModPageUrl: 'https://www.nexusmods.com/stardewvalley/mods/2400',
      },
      installerCandidate: null,
      installerScanState: 'idle',
      installerScanError: null,
    })
  })

  it('keeps an empty affected-mod list when the check result omits it', () => {
    const result = createCheckResult({ requiredByMods: undefined as never })
    expect(deriveSmapiUpdateCardStatus(createInput({ checkResult: result }))).toEqual(
      expect.objectContaining({ kind: 'update-available', requiredByMods: [] }),
    )
  })

  it('carries the best usable local candidate into the update-available state', () => {
    const candidate = createCandidate({ naming: 'nexus' })
    const input = createInput({ checkResult: createCheckResult(), installerCandidates: [candidate] })
    expect(deriveSmapiUpdateCardStatus(input)).toEqual(
      expect.objectContaining({ kind: 'update-available', installerCandidate: candidate, installerScanState: 'ready' }),
    )
  })

  it('reports the installer scan as scanning while it is in flight', () => {
    const input = createInput({
      checkResult: createCheckResult(),
      installerCandidates: null,
      installerScanning: true,
    })
    expect(deriveSmapiUpdateCardStatus(input)).toEqual(
      expect.objectContaining({ kind: 'update-available', installerCandidate: null, installerScanState: 'scanning' }),
    )
  })

  it('reports the installer scan failure with its message', () => {
    const input = createInput({
      checkResult: createCheckResult(),
      installerCandidates: null,
      installerScanError: 'Downloads folder is not readable.',
    })
    expect(deriveSmapiUpdateCardStatus(input)).toEqual(
      expect.objectContaining({
        kind: 'update-available',
        installerScanState: 'failed',
        installerScanError: 'Downloads folder is not readable.',
      }),
    )
  })

  it('ignores unusable candidates when deriving the offered local installer', () => {
    const stale = createCandidate({ version: '4.0.8', satisfiesTarget: false })
    const input = createInput({ checkResult: createCheckResult(), installerCandidates: [stale] })
    expect(deriveSmapiUpdateCardStatus(input)).toEqual(
      expect.objectContaining({ kind: 'update-available', installerCandidate: null, installerScanState: 'ready' }),
    )
  })

  it('surfaces the check error with the retryable check-failed state', () => {
    expect(deriveSmapiUpdateCardStatus(createInput({ checkError: 'Game path is not configured.' }))).toEqual({
      kind: 'check-failed',
      message: 'Game path is not configured.',
    })
  })

  it('maps an install run to the installing state and only allows cancellation while downloading', () => {
    const base = createInput({
      checkResult: createCheckResult(),
      installRun: { jobId: 'smapi-update:1', phase: 'downloading', percent: 42, message: '' },
    })
    expect(deriveSmapiUpdateCardStatus(base)).toEqual({
      kind: 'installing',
      phase: 'downloading',
      percent: 42,
      message: '',
      cancellable: true,
      targetVersion: '4.1.10',
    })
    expect(
      deriveSmapiUpdateCardStatus({
        ...base,
        installRun: { jobId: 'smapi-update:1', phase: 'verifying', percent: null, message: 'Checksum ok' },
      }),
    ).toEqual({
      kind: 'installing',
      phase: 'verifying',
      percent: null,
      message: 'Checksum ok',
      cancellable: false,
      targetVersion: '4.1.10',
    })
  })

  it('prefers the install failure over a stale check result', () => {
    expect(
      deriveSmapiUpdateCardStatus(createInput({ checkResult: createCheckResult(), installError: 'Download failed: HTTP 404' })),
    ).toEqual({ kind: 'install-failed', message: 'Download failed: HTTP 404' })
  })

  it('keeps the install success visible until the follow-up check replaces it', () => {
    expect(deriveSmapiUpdateCardStatus(createInput({ checkResult: createCheckResult(), installSuccessVersion: '4.1.10' }))).toEqual({
      kind: 'install-success',
      installedVersion: '4.1.10',
    })
  })
})

describe('isSmapiInstallCancellable', () => {
  it('only allows cancellation during the download phase', () => {
    expect(isSmapiInstallCancellable('downloading')).toBe(true)
    expect(isSmapiInstallCancellable('verifying')).toBe(false)
    expect(isSmapiInstallCancellable('extracting')).toBe(false)
    expect(isSmapiInstallCancellable('installing')).toBe(false)
  })
})

describe('isSmapiInstallerCandidateUsable', () => {
  it('accepts a candidate that satisfies the target', () => {
    expect(isSmapiInstallerCandidateUsable(createCandidate({ satisfiesTarget: true, compatible: true }))).toBe(true)
    expect(isSmapiInstallerCandidateUsable(createCandidate({ satisfiesTarget: true, compatible: false }))).toBe(true)
  })

  it('rejects a candidate below the target', () => {
    expect(isSmapiInstallerCandidateUsable(createCandidate({ satisfiesTarget: false }))).toBe(false)
  })

  it('falls back to the compatible flag when satisfiesTarget is null', () => {
    expect(isSmapiInstallerCandidateUsable(createCandidate({ satisfiesTarget: null, compatible: null }))).toBe(true)
    expect(isSmapiInstallerCandidateUsable(createCandidate({ satisfiesTarget: null, compatible: true }))).toBe(true)
    expect(isSmapiInstallerCandidateUsable(createCandidate({ satisfiesTarget: null, compatible: false }))).toBe(false)
  })

  it('accepts a candidate with completely unresolved flags', () => {
    expect(isSmapiInstallerCandidateUsable(createCandidate({ satisfiesTarget: undefined, compatible: undefined }))).toBe(true)
  })
})

describe('selectSmapiInstallerCandidate', () => {
  it('returns null for an empty or all-unusable candidate list', () => {
    expect(selectSmapiInstallerCandidate([])).toBeNull()
    expect(selectSmapiInstallerCandidate([createCandidate({ version: '4.0.8', satisfiesTarget: false })])).toBeNull()
  })

  it('picks the newest usable candidate', () => {
    const older = createCandidate({ fileName: 'SMAPI-4.1.0-installer.zip', version: '4.1.0' })
    const newer = createCandidate({ fileName: 'SMAPI-4.2.0-installer.zip', version: '4.2.0' })
    expect(selectSmapiInstallerCandidate([older, newer])).toBe(newer)
  })

  it('prefers a satisfying candidate over a newer one that does not satisfy the target', () => {
    const satisfying = createCandidate({ fileName: 'SMAPI-4.1.10-installer.zip', version: '4.1.10' })
    const newerButStale = createCandidate({ fileName: 'SMAPI-4.0.8-installer.zip', version: '4.0.8' })
    expect(selectSmapiInstallerCandidate([newerButStale, satisfying])).toBe(satisfying)
  })

  it('treats null flags as usable when nothing else resolves them', () => {
    const unknown = createCandidate({ satisfiesTarget: null, compatible: null })
    expect(selectSmapiInstallerCandidate([unknown])).toBe(unknown)
  })
})

describe('deriveSmapiUpdateActionMode', () => {
  it('maps a GitHub download with a direct url to the github mode', () => {
    expect(deriveSmapiUpdateActionMode(createDownload())).toBe('github')
  })

  it('maps a Nexus download to the nexus mode', () => {
    expect(deriveSmapiUpdateActionMode(createDownload({ source: 'nexus', url: null, sha256: null }))).toBe('nexus')
  })

  it('maps a missing download payload to none', () => {
    expect(deriveSmapiUpdateActionMode(null)).toBe('none')
    expect(deriveSmapiUpdateActionMode(undefined)).toBe('none')
  })

  it('maps a GitHub download without a direct url to none', () => {
    expect(deriveSmapiUpdateActionMode(createDownload({ url: null }))).toBe('none')
    expect(deriveSmapiUpdateActionMode(createDownload({ url: '  ' }))).toBe('none')
  })
})

describe('buildSmapiLocalInstallRequest', () => {
  it('builds a local install request with the candidate path and version', () => {
    const candidate = createCandidate()
    expect(buildSmapiLocalInstallRequest(candidate, createCheckResult())).toEqual({
      targetVersion: '4.1.10',
      localFilePath: 'C:\\Users\\Mock\\Downloads\\SMAPI-4.1.10-installer.zip',
      expectedSha256: 'abc123',
    })
  })

  it('passes the known GitHub digest only when the candidate version matches the target', () => {
    const olderCandidate = createCandidate({
      version: '4.1.0',
      fileName: 'SMAPI-4.1.0-installer.zip',
      path: 'C:\\Users\\Mock\\Downloads\\SMAPI-4.1.0-installer.zip',
    })
    expect(buildSmapiLocalInstallRequest(olderCandidate, createCheckResult())).toEqual({
      targetVersion: '4.1.0',
      localFilePath: 'C:\\Users\\Mock\\Downloads\\SMAPI-4.1.0-installer.zip',
    })
  })

  it('omits the digest for Nexus-sourced downloads', () => {
    const checkResult = createCheckResult({ download: createDownload({ source: 'nexus', url: null, sha256: null }) })
    expect(buildSmapiLocalInstallRequest(createCandidate(), checkResult)).toEqual({
      targetVersion: '4.1.10',
      localFilePath: 'C:\\Users\\Mock\\Downloads\\SMAPI-4.1.10-installer.zip',
    })
  })

  it('omits the digest when the check result has no download payload', () => {
    expect(buildSmapiLocalInstallRequest(createCandidate(), createCheckResult({ download: null }))).toEqual({
      targetVersion: '4.1.10',
      localFilePath: 'C:\\Users\\Mock\\Downloads\\SMAPI-4.1.10-installer.zip',
    })
  })
})

describe('parseSmapiInstallerFileNameVersion', () => {
  it('parses GitHub installer names (case-insensitive, double-zipped variant)', () => {
    expect(parseSmapiInstallerFileNameVersion('SMAPI-4.1.10-installer.zip')).toBe('4.1.10')
    expect(parseSmapiInstallerFileNameVersion('SMAPI-4.1.10-installer-double-zipped.zip')).toBe('4.1.10')
    expect(parseSmapiInstallerFileNameVersion('smapi-4.0.8-installer.zip')).toBe('4.0.8')
  })

  it('parses Nexus download names', () => {
    expect(parseSmapiInstallerFileNameVersion('SMAPI 4.1.10-2400-4-1-10-123456.zip')).toBe('4.1.10')
    expect(parseSmapiInstallerFileNameVersion('SMAPI 4.0.8-2400-4-0-8-987654.zip')).toBe('4.0.8')
  })

  it('rejects junk files and near-miss names', () => {
    expect(parseSmapiInstallerFileNameVersion('Stardew Valley Mods.zip')).toBeNull()
    expect(parseSmapiInstallerFileNameVersion('SMAPI-4.1.10.zip')).toBeNull()
    expect(parseSmapiInstallerFileNameVersion('SMAPI-4.1.10-installer.tar.gz')).toBeNull()
    expect(parseSmapiInstallerFileNameVersion('SMAPI 4.1.10-2399-4-1-10-123456.zip')).toBeNull()
    expect(parseSmapiInstallerFileNameVersion('SMAPI 4.1.10-2400-4-1-10.zip')).toBeNull()
    expect(parseSmapiInstallerFileNameVersion('SMAPI 4.1.10-2400-4-2-10-123456.zip')).toBeNull()
  })
})

describe('clampSmapiProgressPercent', () => {
  it('normalizes percentages into the 0-100 range', () => {
    expect(clampSmapiProgressPercent(0)).toBe(0)
    expect(clampSmapiProgressPercent(42.4)).toBe(42)
    expect(clampSmapiProgressPercent(42.6)).toBe(43)
    expect(clampSmapiProgressPercent(-5)).toBe(0)
    expect(clampSmapiProgressPercent(150)).toBe(100)
  })

  it('returns null when no percentage is reported', () => {
    expect(clampSmapiProgressPercent(null)).toBeNull()
    expect(clampSmapiProgressPercent(undefined)).toBeNull()
    expect(clampSmapiProgressPercent(Number.NaN)).toBeNull()
  })
})

describe('getSmapiRequirementBadgeVersion', () => {
  it('returns null when the mod does not require a newer SMAPI', () => {
    expect(getSmapiRequirementBadgeVersion({ requiresNewerSmapi: false, minimumApiVersion: '4.1.0' })).toBeNull()
    expect(getSmapiRequirementBadgeVersion({ requiresNewerSmapi: true, minimumApiVersion: null })).toBeNull()
    expect(getSmapiRequirementBadgeVersion({ requiresNewerSmapi: true, minimumApiVersion: '  ' })).toBeNull()
  })

  it('returns the trimmed minimum API version when the badge applies', () => {
    expect(getSmapiRequirementBadgeVersion({ requiresNewerSmapi: true, minimumApiVersion: ' 4.1.0 ' })).toBe('4.1.0')
  })
})

describe('shouldAcceptSmapiRecheckResult', () => {
  const previous = createCheckResult({ installedVersion: '4.0.8' })

  it('accepts a follow-up check that no longer reports an update', () => {
    expect(
      shouldAcceptSmapiRecheckResult(previous, createCheckResult({ updateAvailable: false, installedVersion: '4.1.10' }), '4.1.10'),
    ).toBe(true)
  })

  it('accepts a follow-up check that reports a changed installed version', () => {
    expect(shouldAcceptSmapiRecheckResult(previous, createCheckResult({ installedVersion: '4.1.10' }), '4.1.10')).toBe(true)
  })

  it('accepts a follow-up check whose installed version matches the install result', () => {
    expect(shouldAcceptSmapiRecheckResult(previous, createCheckResult({ installedVersion: '4.0.8' }), '4.0.8')).toBe(true)
  })

  it('rejects a stale cached result identical to the pre-install state', () => {
    expect(shouldAcceptSmapiRecheckResult(previous, createCheckResult({ installedVersion: '4.0.8' }), '4.1.10')).toBe(false)
  })
})
