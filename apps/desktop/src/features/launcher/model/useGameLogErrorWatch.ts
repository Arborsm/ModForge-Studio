import { useEffect, useRef } from 'react'
import { useEditorCopy } from '@locales/provider'
import { appEvent } from '@platform/observability'
import { publishNotification } from '@shared/ui/notifications'
import { readLauncherLog } from '../api/launcherDesktopApi'
import { diffLauncherLogPage, parseSmapiLogErrors, type SmapiLogError } from './gameLogErrors'
import { listenLauncherResume, loadGameLogCursor, saveGameLogCursor } from '../api/launcherAndroidAiApi'

/**
 * @file Android takeover-launch game-log error watch. In takeover mode the
 * SMAPI activity finishes the launcher activity, so returning from a game
 * session remounts the launcher — a mount-time read of the teed log covers
 * exactly the lines written during that session. On the Android host the game
 * runs in a separate task without finishing the launcher activity, so the web
 * app does not remount on return; the host pushes an `android:resume` event at
 * that session boundary and the same diff runs there. A persisted line-count
 * cursor (platform key-value storage) diffs each run against the previous one;
 * new ERROR lines publish a sticky notification whose actions open the AI
 * analysis sheet or jump to the full log page. The read spans up to 12k lines
 * so early-session errors (SMAPI usually reports real problems before the
 * session tail) are not missed on long sessions.
 */

const LOG_READ_MAX_LINES = 12000
const GAME_LOG_ERROR_NOTIFICATION_ID = 'android-game-log-errors'

/**
 * Reads the launcher log at each launcher session boundary (page mount, and
 * the Android host's resume event when returning from the game activity) and
 * reports SMAPI errors written since the previous run. `onErrors` receives the
 * batch (the page keeps it as the analysis target); `onAnalyze` is invoked
 * from the notification action when the user asks to analyze the batch;
 * `onViewLogs` opens the mobile log page.
 */
export function useGameLogErrorWatch({
  androidHost,
  onErrors,
  onAnalyze,
  onViewLogs,
}: {
  androidHost: boolean
  onErrors: (errors: SmapiLogError[]) => void
  onAnalyze: (errors: SmapiLogError[]) => void
  onViewLogs: () => void
}) {
  const copy = useEditorCopy().launcher.logAnalysis
  const callbacksRef = useRef({ onErrors, onAnalyze, onViewLogs })
  useEffect(() => {
    callbacksRef.current = { onErrors, onAnalyze, onViewLogs }
  }, [onErrors, onAnalyze, onViewLogs])

  useEffect(() => {
    if (!androidHost) {
      return
    }

    let disposed = false
    let checking = false
    const checkLog = async () => {
      if (checking) {
        return
      }
      checking = true
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
          secondaryAction: {
            label: copy.viewLogsAction,
            tone: 'default',
            closeOnClick: true,
            callback: () => {
              callbacksRef.current.onViewLogs()
            },
          },
        })
      } catch (error) {
        // The watch must never block launcher startup; failures stay in the log.
        appEvent('error', 'Game log error watch failed')
          .error(error)
          .context({ source: 'launcher-log-watch', operation: 'read-log' })
          .emit({ notify: false })
      } finally {
        checking = false
      }
    }

    void checkLog()
    let unsubscribeResume: (() => void) | undefined
    void listenLauncherResume(() => {
      void checkLog()
    }).then((unsubscribe) => {
      if (disposed) {
        unsubscribe()
        return
      }
      unsubscribeResume = unsubscribe
    })

    return () => {
      disposed = true
      unsubscribeResume?.()
    }
  }, [androidHost, copy])
}
