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

export type UseSmapiUpdateOptions = {
  gamePath: string | null
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
export function useSmapiUpdate({ gamePath, onRuntimeInfoRefreshed }: UseSmapiUpdateOptions) {
  const launcherPort = useLauncherPort()
  const copy = useEditorCopy().launcher.configuration.smapiUpdate
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

  const refreshRuntimeInfoAfterInstall = useCallback(() => {
    launcherPort
      .loadRuntimeInfo()
      .then((info) => onRuntimeInfoRefreshedRef.current?.(info))
      .catch(() => {
        // Best-effort env-tag refresh; the card itself shows the installed version.
      })
  }, [launcherPort])

  const recheckAfterInstall = useCallback(
    async (installedVersion: string) => {
      try {
        const result = await launcherPort.checkSmapiUpdate()
        if (shouldAcceptSmapiRecheckResult(checkResultRef.current, result, installedVersion)) {
          checkResultRef.current = result
          setCheckResult(result)
          setInstallSuccessVersion(null)
        }
      } catch {
        // Keep the install success state; the user can re-check manually later.
      }
    },
    [launcherPort],
  )

  const runInstall = useCallback(
    async (request: InstallSmapiUpdateRequest, initialPhase: SmapiUpdatePhase, failureFallback: string) => {
      if (installScopeRef.current) {
        return false
      }
      const jobId = request.jobId ?? `smapi-update:${Date.now()}`
      let installSucceeded = false

      await runInstallTask(async (scope) => {
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
          unlisten = await launcherPort.listenToSmapiUpdateProgress(handleProgress).catch(() => null)
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
      }).catch(() => {})

      return installSucceeded
    },
    [launcherPort, recheckAfterInstall, refreshRuntimeInfoAfterInstall, runInstallTask],
  )

  const startInstall = useCallback(async () => {
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
  }, [copy.checkFailedFallback, copy.installFailedFallback, launcherPort, runInstall])

  const startLocalInstall = useCallback(
    async (candidate: SmapiInstallerDownloadCandidate) => {
      const request = buildSmapiLocalInstallRequest(candidate, checkResultRef.current)
      return runInstall(request, 'verifying', copy.localInstallFailedFallback)
    },
    [copy.localInstallFailedFallback, runInstall],
  )

  const startPickedFileInstall = useCallback(
    async (filePath: string) => {
      const parsedVersion = parseSmapiInstallerFileNameVersion(baseFileName(filePath))
      const targetVersion = parsedVersion ?? checkResultRef.current?.targetVersion ?? ''
      if (!targetVersion) {
        return false
      }
      return runInstall({ localFilePath: filePath, targetVersion }, 'verifying', copy.localInstallFailedFallback)
    },
    [copy.localInstallFailedFallback, runInstall],
  )

  const pickLocalInstaller = useCallback(async () => {
    const filePath = await launcherPort.chooseArchiveFile(copy.localInstallerPickerTitle).catch(() => null)
    if (!filePath) {
      return false
    }
    return startPickedFileInstall(filePath)
  }, [copy.localInstallerPickerTitle, launcherPort, startPickedFileInstall])

  const openNexusManualDownload = useCallback(() => {
    const download = checkResultRef.current?.download
    const url = download?.nexusDownloadPopupUrl?.trim() || download?.nexusModPageUrl?.trim()
    if (!url) {
      return false
    }
    void launcherPort.openUrl({ url })
    return true
  }, [launcherPort])

  const rescanInstallerDownloads = useCallback(() => {
    void scanInstallerDownloads()
    void runCheck()
  }, [runCheck, scanInstallerDownloads])

  const cancelInstall = useCallback(() => {
    const scope = installScopeRef.current
    const jobId = activeInstallJobIdRef.current
    if (!scope || !jobId) {
      return
    }
    installScopeRef.current = null
    activeInstallJobIdRef.current = null
    scope.cancel(new TaskCancelledError('SMAPI update install cancelled.'))
    setInstallRun(null)
    void launcherPort.cancelDownload(jobId).catch(() => {})
  }, [launcherPort])

  useEffect(() => {
    if (!gamePath?.trim()) {
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
  }, [gamePath, runCheck, scanInstallerDownloads])

  return {
    status: deriveSmapiUpdateCardStatus({
      gamePathConfigured: Boolean(gamePath?.trim()),
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
