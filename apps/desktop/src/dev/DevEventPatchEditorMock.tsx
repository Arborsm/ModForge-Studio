import { useEffect, useMemo, useState } from 'react'
import type { CpMakerDraft, DraftPatch } from '@shared/contracts'
import { EventPatchEditor } from '@pages/workbench/workspaces/event-stage/editors/event-workflow/workflow-view/EventPatchEditor'
import { LocaleProvider } from '@locales/localeContext'
import { localeBundles } from '@locales'
import { detectDefaultGameDirectory, loadImageDataUrl } from '@entities/game/api'
import { detectDefaultGameDirectoryFromDevBridge, loadImageDataUrlFromDevBridge } from '@entities/game/api/devAssetBridge'
import { createElectronPlatformPorts, isElectronHost } from '@platform/electron'
import { createTauriPlatformPorts } from '@platform/tauri'
import { canUseDesktopHost, configureDesktopPlatformPorts } from '@shared/lib/desktop'
import { configureImageDataUrlLoader } from '@shared/lib/assets'
import { createEventStagePreviewDevAssetLoader } from './eventStagePreviewMockAssets'
import '@xyflow/react/dist/style.css'
import '../styles/workbench.css'

function createEventPatch(): DraftPatch {
  return {
    id: 'dev-event-patch',
    workspace: 'events',
    action: 'EditData',
    target: 'Data/Events/Town',
    logName: 'Dev event scenes',
    enabled: true,
    editorState: {
      entries: {
        '900001/Season spring/Time 900 1400':
          'spring2/12 45/farmer 12 47 0 Abigail 12 45 2 Lewis 16 45 3/skippable/speak Abigail "The square feels alive today.$h"/pause 500/move Abigail 1 0 1 Abigail 1 0 1/faceDirection Lewis 3/pause 500/emote Lewis 16/speak Lewis "A proper market needs a proper opening."/addItem "(O)24" 1/message "You received a market parsnip."/end dialogue',
        '900002/Season summer/Time 1200 1800':
          'wavy/34 11/farmer 34 14 0 Elliott 37 11 3/skippable/playSound waves/addObject 35 12 "(O)372"/speak Elliott "The tide left something curious behind."/warp farmer 35 12 2/farmerAnimation 7/itemAboveHead "(O)372"/removeObject 35 12/friendship Elliott 80/speak Elliott "A small discovery, but a memorable one."/end dialogue',
        '900003/PlayerGender male female/MailReceived guildMember':
          'Cavern/18 8/farmer 18 12 0 Marlon 20 8 3/skippable/ambientLight 80 80 120/addLantern 19 9/addTemporaryActor Shadow 16 32 17 8 2/playSound shadowpeep/pause 500/shake 500/animate Shadow true true 120 0 1 2 3/pause 1000/positionOffset Shadow -2 1/pause 50/positionOffset Shadow -2 0/pause 50/move Marlon -1 0 3 Marlon 0 2 2/speak Marlon "Stay behind me. Something is moving."/quickQuestion "Hold the lantern?#Yes#No(break)glow farmer\\message You steady the light.(break)screenFlash"/switchEvent 900004/end dialogue',
      },
      eventAliases: {
        '900001/Season spring/Time 900 1400': 'Spring market meeting',
        '900002/Season summer/Time 1200 1800': 'Lost shell on the pier',
        '900003/PlayerGender male female/MailReceived guildMember': 'Lantern in the dark',
      },
      eventLocations: {
        '900001/Season spring/Time 900 1400': 'Town',
        '900002/Season summer/Time 1200 1800': 'Beach',
        '900003/PlayerGender male female/MailReceived guildMember': 'Mine',
      },
    },
  }
}

function createDraft(patch: DraftPatch): CpMakerDraft {
  return {
    draftStorageKey: 'dev-event-draft',
    projectMetadata: {
      projectName: 'Dev Event Graphical Mock',
      projectDescription: 'Browser-only event authoring verification fixture.',
      projectAuthor: 'ModForge',
      projectVersion: '1.0.0',
      projectUniqueId: 'ModForge.DevEventMock',
      gameRootPath: null,
      contentPackForUniqueId: 'Pathoschild.ContentPatcher',
    },
    overlayTargets: [],
    configSchema: [],
    patches: [patch],
    virtualAssets: [],
    dynamicTokens: [],
    customLocations: [],
    aliasTokenNames: {},
    eventSourceSnapshotsByTarget: {},
  }
}

export function DevEventPatchEditorMock() {
  const [gameRootPath, setGameRootPath] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('mfEventEditorMockGameRoot')?.trim() || null
  })
  const [patch, setPatch] = useState<DraftPatch>(() => createEventPatch())
  const draft = useMemo(() => {
    const nextDraft = createDraft(patch)
    return {
      ...nextDraft,
      projectMetadata: {
        ...nextDraft.projectMetadata,
        gameRootPath,
      },
    }
  }, [gameRootPath, patch])
  const locale = 'en-US'
  const copy = localeBundles[locale].editor
  const assetLoader = useMemo(() => createEventStagePreviewDevAssetLoader(), [])

  useEffect(() => {
    configureDesktopPlatformPorts(isElectronHost() ? createElectronPlatformPorts() : createTauriPlatformPorts())
    configureImageDataUrlLoader(
      async (path, nextLocale) => (await loadImageDataUrlFromDevBridge(path, nextLocale)) ?? loadImageDataUrl(path, nextLocale),
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    if (gameRootPath || !canUseDesktopHost()) {
      if (gameRootPath) {
        return
      }

      void detectDefaultGameDirectoryFromDevBridge()
        .then((detectedPath) => {
          if (!cancelled && detectedPath) {
            setGameRootPath(detectedPath)
          }
        })
        .catch(() => {})
      return
    }

    void detectDefaultGameDirectory()
      .then((detectedPath) => {
        if (!cancelled && detectedPath) {
          setGameRootPath(detectedPath)
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [gameRootPath])

  return (
    <LocaleProvider locale={locale}>
      <div className="h-screen w-screen overflow-hidden bg-[var(--bg-app)] text-[var(--text-primary)]">
        <EventPatchEditor
          patch={patch}
          draft={draft}
          locale={locale}
          theme="dark"
          accentColor="#3b82f6"
          viewportLabels={copy.viewportLabels}
          gameRootPath={gameRootPath}
          assetLoader={assetLoader}
          onAddVirtualAsset={() => {}}
          onPatchChange={(_patchId, patchUpdate) => {
            setPatch((current) => ({
              ...current,
              ...patchUpdate,
              editorState: patchUpdate.editorState ?? current.editorState,
            }))
          }}
        />
      </div>
    </LocaleProvider>
  )
}
