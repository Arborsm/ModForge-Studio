import type { GuideId } from '@locales/api'
import { useGuidesCopy, useSettingsMenuCopy } from '@locales/provider'
import { useGuideEngineStore } from '@features/guide'
import { publishNotification } from '@shared/ui/notifications'
import { appGuideDefinitions } from '../../guide-setup'

/** Guide replay controls loaded only when the interaction settings category is visible. */
export function SettingsGuidesSection() {
  const settingsCopy = useSettingsMenuCopy()
  const guidesCopy = useGuidesCopy()
  const completedGuideIds = useGuideEngineStore((state) => state.completedGuideIds)
  const requestGuideReplay = useGuideEngineStore((state) => state.requestGuideReplay)
  const resetAllGuideProgress = useGuideEngineStore((state) => state.resetAllGuideProgress)
  const entries = appGuideDefinitions.map((definition) => ({
    id: definition.id,
    title: guidesCopy.definitions[definition.id as GuideId]?.title ?? definition.id,
    watched: completedGuideIds.includes(definition.id),
  }))

  const replayGuide = (guideId: string, guideTitle: string) => {
    requestGuideReplay(guideId)
    if (useGuideEngineStore.getState().pendingGuideId === guideId) {
      publishNotification({
        level: 'info',
        title: guidesCopy.replayPendingTitle,
        description: guidesCopy.replayPendingDescription(guideTitle),
      })
    }
  }

  const replayAllGuides = () => {
    resetAllGuideProgress()
    publishNotification({
      level: 'info',
      title: settingsCopy.guideReplayAllLabel,
      description: settingsCopy.guideReplayAllDescription,
    })
  }

  return (
    <section className="settings-window-group">
      <p className="settings-window-group-label">{settingsCopy.groups.guides}</p>
      <div className="settings-window-list">
        <div className="settings-window-row">
          <div className="settings-window-row-meta">
            <p className="settings-window-row-title">{settingsCopy.groups.guides}</p>
            <p className="settings-window-row-desc">{settingsCopy.guidesDescription}</p>
          </div>
          <button type="button" className="settings-window-pill" onClick={replayAllGuides}>
            {settingsCopy.guideReplayAllLabel}
          </button>
        </div>
        {entries.map((entry) => (
          <div className="settings-window-row" key={entry.id}>
            <div className="settings-window-row-meta">
              <p className="settings-window-row-title">{entry.title}</p>
              <p className="settings-window-row-desc">
                {entry.watched ? settingsCopy.guideWatchedStateLabel : settingsCopy.guideUnwatchedStateLabel}
              </p>
            </div>
            <button type="button" className="settings-window-pill" onClick={() => replayGuide(entry.id, entry.title)}>
              {settingsCopy.guideReplayActionLabel}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
