/**
 * @file useSmapiUpdate hook: drives the SMAPI update card — version check,
 * installer scan, GitHub/local install, and post-install runtime refresh.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditorCopy } from '@locales/provider'
import { TaskCancelledError, useExclusiveMutationTask, useLatestTask, type TaskScope } from '@shared/lib/task-runtime'
import type {
  InstallSmapiUpdateRequest,
  LauncherRuntimeInfo,
  SmapiInstallerDownloadCandidate,
  SmapiUpdateCheckResult,
  SmapiUpdatePhase,
  SmapiUpdateProgressPayload,
} from './launcherContracts'
import { useLauncherPort } from './launcherPortContext'
import { appEvent, ignoreError, orNull, reportRecovered } from '@platform/observability'
import {
  buildSmapiLocalInstallRequest,
  clampSmapiProgressPercent,
  deriveSmapiUpdateCardStatus,
  parseSmapiInstallerFileNameVersion,
  shouldAcceptSmapiRecheckResult,
  type SmapiUpdateInstallRun,
} from './smapiUpdateModel'

function isTaskCancelled(error: unknown) {
  return error instanceof TaskCancelledError || (error instanceof DOMException && error.name === 'AbortError')
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback
}

function baseFileName(filePath: string) {
  const normalized = filePath.trim().replaceAll('\\', '/')
  const separatorIndex = normalized.lastIndexOf('/')
  return separatorIndex === -1 ? normalized : normalized.slice(separatorIndex + 1)
}

/** Options for {@link useSmapiUpdate}. */
export type UseSmapiUpdateOptions = {
  gamePath: string | null
  /**
   * Android host manages the game path inside its own app data, so an empty
   * configured game path must not gate the check/install flow there.
   */
  pathsManagedByHost?: boolean
  /** Called with fresh runtime info after a successful SMAPI install so env tags update. */
  onRuntimeInfoRefreshed?: (info: LauncherRuntimeInfo) => void
}

/**
 * Drives the SMAPI update card on the launcher configuration page: checks the installed
 * SMAPI version, scans for locally downloaded installer archives, installs through the
 * GitHub direct download or a local file (including Nexus manual downloads), and
 * refreshes the runtime info after a successful install. The check and the download
 * scan run on mount and whenever the configured game path changes; the backend
 * disk-caches check results for 30 minutes.
 */
export function useSmapiUpdate({ gamePath, pathsManagedByHost = false, onRuntimeInfoRefreshed }: UseSmapiUpdateOptions) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy().launcher.configuration.smapiUpdate
  const gamePathConfigured = pathsManagedByHost || Boolean(gamePath?.trim())
  const runCheckTask = useLatestTask('launcher-smapi-update-check')
  const runScanTask = useLatestTask('launcher-smapi-installer-scan')
  const runInstallTask = useExclusiveMutationTask('LauncherSmapiUpdate')
  const [checkResult, setCheckResult] = useState<SmapiUpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [installRun, setInstallRun] = useState<SmapiUpdateInstallRun | null>(null)
  const [installError, setInstallError] = useState<string | null>(null)
  const [installSuccessVersion, setInstallSuccessVersion] = useState<string | null>(null)
  const [installerCandidates, setInstallerCandidates] = useState<SmapiInstallerDownloadCandidate[] | null>(null)
  const [installerScanning, setInstallerScanning] = useState(false)
  const [installerScanError, setInstallerScanError] = useState<string | null>(null)
  const checkResultRef = useRef<SmapiUpdateCheckResult | null>(null)
  const installScopeRef = useRef<TaskScope | null>(null)
  const activeInstallJobIdRef = useRef<string | null>(null)
  const onRuntimeInfoRefreshedRef = useRef(onRuntimeInfoRefreshed)
  useEffect(() => {
    onRuntimeInfoRefreshedRef.current = onRuntimeInfoRefreshed
  }, [onRuntimeInfoRefreshed])

  const runCheck = useCallback(async () => {
    await runCheckTask(async (scope) => {
      setChecking(true)
      setCheckError(null)
      setInstallSuccessVersion(null)
      try {
        const result = await launcherPort.checkSmapiUpdate()
        if (!scope.isCurrent()) {
          return
        }
        checkResultRef.current = result
        setCheckResult(result)
      } catch (nextError) {
        if (!scope.isCurrent() || isTaskCancelled(nextError)) {
          return
        }
        setCheckError(getErrorMessage(nextError, copy.checkFailedFallback))
        appEvent('error', 'SMAPI update check failed')
          .error(nextError)
          .context({ source: 'smapi-update', operation: 'check-update' })
          .emit({ notify: false })
      } finally {
        if (scope.isCurrent()) {
          setChecking(false)
        }
      }
    }).catch((nextError) => {
      if (!isTaskCancelled(nextError)) {
        throw nextError
      }
    })
  }, [copy.checkFailedFallback, launcherPort, runCheckTask])

  const scanInstallerDownloads = useCallback(async () => {
    await runScanTask(async (scope) => {
      setInstallerScanning(true)
      setInstallerScanError(null)
      try {
        const result = await launcherPort.findSmapiInstallerDownloads()
        if (!scope.isCurrent()) {
          return
        }
        setInstallerCandidates(result.candidates)
      } catch (nextError) {
        if (!scope.isCurrent() || isTaskCancelled(nextError)) {
          return
        }
        setInstallerScanError(getErrorMessage(nextError, copy.installerScanFallback))
        appEvent('error', 'SMAPI installer scan failed')
          .error(nextError)
          .context({ source: 'smapi-update', operation: 'scan-installers' })
          .emit({ notify: false })
      } finally {
        if (scope.isCurrent()) {
          setInstallerScanning(false)
        }
      }
    }).catch((nextError) => {
      if (!isTaskCancelled(nextError)) {
        throw nextError
      }
    })
  }, [copy.installerScanFallback, launcherPort, runScanTask])

  const refreshRuntimeInfoAfterInstall = () => {
    // Best-effort env-tag refresh; the card itself shows the installed version.
    void ignoreError(
      launcherPort.loadRuntimeInfo().then((info) => onRuntimeInfoRefreshedRef.current?.(info)),
      'smapiUpdate.refreshRuntimeInfo',
    )
  }

  const recheckAfterInstall = async (installedVersion: string) => {
    try {
      const result = await launcherPort.checkSmapiUpdate()
      if (shouldAcceptSmapiRecheckResult(checkResultRef.current, result, installedVersion)) {
        checkResultRef.current = result
        setCheckResult(result)
        setInstallSuccessVersion(null)
      }
    } catch (error) {
      reportRecovered(error, 'smapi-update.recheck-after-install')
      // Keep the install success state; the user can re-check manually later.
    }
  }

  const runInstall = async (request: InstallSmapiUpdateRequest, initialPhase: SmapiUpdatePhase, failureFallback: string) => {
    if (installScopeRef.current) {
      return false
    }
    const jobId = request.jobId ?? `smapi-update:${Date.now()}`
    let installSucceeded = false

    const installTask = runInstallTask(async (scope) => {
      installScopeRef.current = scope
      activeInstallJobIdRef.current = jobId
      setInstallError(null)
      setInstallSuccessVersion(null)
      setInstallRun({ jobId, phase: initialPhase, percent: null, message: '' })

      const handleProgress = (payload: SmapiUpdateProgressPayload) => {
        if (!scope.isCurrent()) {
          return
        }
        setInstallRun({
          jobId,
          phase: payload.phase,
          percent: clampSmapiProgressPercent(payload.percent),
          message: payload.message.trim(),
        })
      }

      let unlisten: (() => void) | null = null
      try {
        unlisten = await orNull(launcherPort.listenToSmapiUpdateProgress(handleProgress), 'smapiUpdate.listenProgress')
        const installResult = await launcherPort.installSmapiUpdate({ ...request, jobId })
        if (!scope.isCurrent()) {
          return
        }
        installSucceeded = true
        setInstallRun(null)
        setInstallSuccessVersion(installResult.installedVersion)
        refreshRuntimeInfoAfterInstall()
        void recheckAfterInstall(installResult.installedVersion)
      } catch (nextError) {
        if (!scope.isCurrent() || isTaskCancelled(nextError)) {
          return
        }
        setInstallRun(null)
        setInstallError(getErrorMessage(nextError, failureFallback))
      } finally {
        unlisten?.()
        if (installScopeRef.current === scope) {
          installScopeRef.current = null
        }
        if (activeInstallJobIdRef.current === jobId) {
          activeInstallJobIdRef.current = null
        }
      }
    })
    await ignoreError(installTask, 'smapiUpdate.installTask')

    return installSucceeded
  }

  const startInstall = async () => {
    let result = checkResultRef.current
    if (!result?.download?.url || !result.updateAvailable) {
      try {
        result = await launcherPort.checkSmapiUpdate()
        checkResultRef.current = result
        setCheckResult(result)
        setCheckError(null)
      } catch (nextError) {
        if (!isTaskCancelled(nextError)) {
          setCheckError(getErrorMessage(nextError, copy.checkFailedFallback))
        }
        return false
      }
    }
    const download = result?.download
    if (!result?.updateAvailable || !download?.url || !download.sha256) {
      return false
    }
    return runInstall(
      {
        downloadUrl: download.url,
        expectedSha256: download.sha256,
        targetVersion: result.targetVersion,
      },
      'downloading',
      copy.installFailedFallback,
    )
  }

  const startLocalInstall = async (candidate: SmapiInstallerDownloadCandidate) => {
    const request = buildSmapiLocalInstallRequest(candidate, checkResultRef.current)
    return runInstall(request, 'verifying', copy.localInstallFailedFallback)
  }

  const startPickedFileInstall = async (filePath: string) => {
    const parsedVersion = parseSmapiInstallerFileNameVersion(baseFileName(filePath))
    const targetVersion = parsedVersion ?? checkResultRef.current?.targetVersion ?? ''
    if (!targetVersion) {
      return false
    }
    return runInstall({ localFilePath: filePath, targetVersion }, 'verifying', copy.localInstallFailedFallback)
  }

  const pickLocalInstaller = async () => {
    const filePath = await orNull(launcherPort.chooseArchiveFile(copy.localInstallerPickerTitle), 'smapiUpdate.chooseInstaller')
    if (!filePath) {
      return false
    }
    return startPickedFileInstall(filePath)
  }

  const openNexusManualDownload = () => {
    const download = checkResultRef.current?.download
    const url = download?.nexusDownloadPopupUrl?.trim() || download?.nexusModPageUrl?.trim()
    if (!url) {
      return false
    }
    void launcherPort.openUrl({ url })
    return true
  }

  const rescanInstallerDownloads = () => {
    void scanInstallerDownloads()
    void runCheck()
  }

  const cancelInstall = () => {
    const scope = installScopeRef.current
    const jobId = activeInstallJobIdRef.current
    if (!scope || !jobId) {
      return
    }
    installScopeRef.current = null
    activeInstallJobIdRef.current = null
    scope.cancel(new TaskCancelledError('SMAPI update install cancelled.'))
    setInstallRun(null)
    void ignoreError(launcherPort.cancelDownload(jobId), 'smapiUpdate.cancelDownload')
  }

  useEffect(() => {
    if (!gamePathConfigured) {
      checkResultRef.current = null
      setCheckResult(null)
      setCheckError(null)
      setInstallRun(null)
      setInstallError(null)
      setInstallSuccessVersion(null)
      setInstallerCandidates(null)
      setInstallerScanError(null)
      return
    }
    checkResultRef.current = null
    setCheckResult(null)
    setInstallerCandidates(null)
    setInstallerScanError(null)
    void runCheck()
    void scanInstallerDownloads()
  }, [gamePath, gamePathConfigured, runCheck, scanInstallerDownloads])

  return {
    status: deriveSmapiUpdateCardStatus({
      gamePathConfigured,
      checkResult,
      checking,
      checkError,
      installRun,
      installError,
      installSuccessVersion,
      installerCandidates,
      installerScanning,
      installerScanError,
    }),
    checkResult,
    checking,
    checkError,
    installRun,
    installError,
    installSuccessVersion,
    installerCandidates,
    installerScanning,
    installerScanError,
    runCheck,
    scanInstallerDownloads,
    startInstall,
    startLocalInstall,
    pickLocalInstaller,
    openNexusManualDownload,
    rescanInstallerDownloads,
    cancelInstall,
  }
}
