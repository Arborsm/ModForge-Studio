import { useEffect, useRef } from 'react'
import { useEditorCopy } from '@locales/provider'
import { appEvent } from '@platform/observability'
import { publishNotification } from '@shared/ui/notifications'
import { readLauncherLog } from '../api/launcherDesktopApi'
import { diffLauncherLogPage, parseSmapiLogErrors, type SmapiLogError } from './gameLogErrors'
import { loadGameLogCursor, saveGameLogCursor } from '../api/launcherAndroidAiApi'

/**
 * @file Android takeover-launch game-log error watch. In takeover mode the
 * SMAPI activity finishes the launcher activity, so returning from a game
 * session remounts the launcher — a mount-time read of the teed log covers
 * exactly the lines written during that session. A persisted line-count
 * cursor (platform key-value storage) diffs each mount against the previous
 * one; new ERROR lines publish a sticky notification whose action hands the
 * batch to the page-level AI analysis sheet.
 */

const LOG_READ_MAX_LINES = 2000
const GAME_LOG_ERROR_NOTIFICATION_ID = 'android-game-log-errors'

/**
 * Reads the launcher log once per mount and reports SMAPI errors written since
 * the previous mount. `onErrors` receives the batch (the page keeps it as the
 * analysis target); `onAnalyze` is invoked from the notification action when
 * the user asks to analyze the batch.
 */
export function useGameLogErrorWatch({
  androidHost,
  onErrors,
  onAnalyze,
}: {
  androidHost: boolean
  onErrors: (errors: SmapiLogError[]) => void
  onAnalyze: (errors: SmapiLogError[]) => void
}) {
  const copy = useEditorCopy().launcher.logAnalysis
  const callbacksRef = useRef({ onErrors, onAnalyze })
  useEffect(() => {
    callbacksRef.current = { onErrors, onAnalyze }
  }, [onErrors, onAnalyze])

  useEffect(() => {
    if (!androidHost) {
      return
    }

    let disposed = false
    void (async () => {
      try {
        const page = await readLauncherLog(LOG_READ_MAX_LINES)
        if (disposed) {
          return
        }
        const { newLines, nextCursor } = diffLauncherLogPage(loadGameLogCursor(), page)
        saveGameLogCursor(nextCursor)
        const errors = parseSmapiLogErrors(newLines)
        if (!errors.length) {
          return
        }
        callbacksRef.current.onErrors(errors)
        publishNotification({
          id: GAME_LOG_ERROR_NOTIFICATION_ID,
          level: 'warning',
          title: copy.notificationTitle(errors.length),
          description: errors[0] ? copy.notificationFirstError(errors[0].source, errors[0].message) : null,
          action: {
            label: copy.analyzeAction,
            tone: 'primary',
            closeOnClick: true,
            callback: () => {
              callbacksRef.current.onAnalyze(errors)
            },
          },
        })
      } catch (error) {
        // The watch must never block launcher startup; failures stay in the log.
        appEvent('error', 'Game log error watch failed')
          .error(error)
          .context({ source: 'launcher-log-watch', operation: 'read-log' })
          .emit({ notify: false })
      }
    })()

    return () => {
      disposed = true
    }
  }, [androidHost, copy])
}
