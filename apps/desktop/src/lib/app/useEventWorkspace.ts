import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { loadTextAsset, scanEvents, type EventAssetSummary, type GameDirectoryInfo } from '../desktop'
import type { EditorCopy, LocaleCode } from '../editor-shell'
import { parseEventAssetContent } from '../events/parser'
import { EVENT_SETUP_ENTRY_ID } from '../events/timeline'

type UseEventWorkspaceOptions = {
  copy: EditorCopy
  locale: LocaleCode
  directoryInfo: GameDirectoryInfo | null
}

function getLocalizedEventCandidates(asset: EventAssetSummary, locale: LocaleCode) {
  if (locale === 'en-US') {
    return [asset.relativePath]
  }

  return [asset.relativePath.replace(/\.xnb$/iu, `.${locale}.xnb`), asset.relativePath]
}

export function useEventWorkspace({ copy, locale, directoryInfo }: UseEventWorkspaceOptions) {
  const [eventAssets, setEventAssets] = useState<EventAssetSummary[]>([])
  const [eventAssetFilter, setEventAssetFilter] = useState('')
  const [activeEventAssetId, setActiveEventAssetId] = useState<string | null>(null)
  const [parsedEventAsset, setParsedEventAsset] = useState<ReturnType<typeof parseEventAssetContent> | null>(null)
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null)
  const [selectedTimelineEntryId, setSelectedTimelineEntryId] = useState<string>(EVENT_SETUP_ENTRY_ID)
  const [timelineJumpRequestId, setTimelineJumpRequestId] = useState<string | null>(null)
  const [eventStatusMessage, setEventStatusMessage] = useState('')

  const deferredFilter = useDeferredValue(eventAssetFilter.trim().toLowerCase())
  const filteredEventAssets = useMemo(
    () =>
      eventAssets.filter((asset) => {
        if (!deferredFilter) {
          return true
        }

        return `${asset.name} ${asset.fileName} ${asset.relativePath}`.toLowerCase().includes(deferredFilter)
      }),
    [deferredFilter, eventAssets],
  )

  const activeEventAsset = eventAssets.find((asset) => asset.id === activeEventAssetId) ?? null
  const selectedEvent = parsedEventAsset?.eventIndex[selectedEventKey ?? ''] ?? parsedEventAsset?.events[0] ?? null

  useEffect(() => {
    if (!directoryInfo?.rootPath) {
      const timeout = window.setTimeout(() => {
        setEventAssets([])
        setActiveEventAssetId(null)
        setParsedEventAsset(null)
        setSelectedEventKey(null)
        setSelectedTimelineEntryId(EVENT_SETUP_ENTRY_ID)
        setTimelineJumpRequestId(null)
        setEventStatusMessage('')
      }, 0)

      return () => window.clearTimeout(timeout)
    }
    const rootPath = directoryInfo.rootPath

    let cancelled = false

    async function loadEventAssets() {
      try {
        const assets = await scanEvents(rootPath)
        if (cancelled) {
          return
        }

        setEventAssets(assets)
        setEventStatusMessage(assets.length ? `${assets.length} event files ready.` : 'No XNB event files found.')
        setActiveEventAssetId((current) => (current && assets.some((asset) => asset.id === current) ? current : assets[0]?.id ?? null))
      } catch (error) {
        if (!cancelled) {
          setEventAssets([])
          setEventStatusMessage(
            `${copy.messages.mapScanFailed} ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }
    }

    void loadEventAssets()

    return () => {
      cancelled = true
    }
  }, [copy.messages.mapScanFailed, directoryInfo?.rootPath])

  useEffect(() => {
    if (!directoryInfo?.rootPath || !activeEventAsset) {
      const timeout = window.setTimeout(() => {
        setParsedEventAsset(null)
        setSelectedEventKey(null)
        setSelectedTimelineEntryId(EVENT_SETUP_ENTRY_ID)
        setTimelineJumpRequestId(null)
      }, 0)

      return () => window.clearTimeout(timeout)
    }
    const rootPath = directoryInfo.rootPath

    let cancelled = false

    async function openEventAsset(asset: EventAssetSummary) {
      const candidates = getLocalizedEventCandidates(asset, locale)
      let lastError: unknown = null

      for (const relativePath of candidates) {
        try {
          const textAsset = await loadTextAsset(rootPath, relativePath, locale)
          if (cancelled) {
            return
          }

          const parsed = parseEventAssetContent(
            textAsset.content,
            asset,
            relativePath === asset.relativePath ? null : locale,
            relativePath,
          )

          setParsedEventAsset(parsed)
          setSelectedEventKey(parsed.events[0]?.key ?? null)
          setSelectedTimelineEntryId(EVENT_SETUP_ENTRY_ID)
          setTimelineJumpRequestId(null)
          setEventStatusMessage(`${asset.name} loaded with ${parsed.events.length} events.`)
          return
        } catch (error) {
          lastError = error
        }
      }

      if (!cancelled) {
        setParsedEventAsset(null)
        setSelectedEventKey(null)
        setSelectedTimelineEntryId(EVENT_SETUP_ENTRY_ID)
        setTimelineJumpRequestId(null)
        setEventStatusMessage(`Failed to load event file. ${lastError instanceof Error ? lastError.message : String(lastError)}`)
      }
    }

    void openEventAsset(activeEventAsset)

    return () => {
      cancelled = true
    }
  }, [activeEventAsset, directoryInfo?.rootPath, locale])

  function handleOpenEventAsset(asset: EventAssetSummary) {
    setActiveEventAssetId(asset.id)
  }

  function handleSelectEvent(eventKey: string) {
    setSelectedEventKey(eventKey)
    setSelectedTimelineEntryId(EVENT_SETUP_ENTRY_ID)
    setTimelineJumpRequestId(null)
  }

  function requestTimelineJump(entryId: string) {
    setSelectedTimelineEntryId(entryId)
    setTimelineJumpRequestId(entryId)
  }

  function clearTimelineJumpRequest() {
    setTimelineJumpRequestId(null)
  }

  return {
    eventAssets,
    filteredEventAssets,
    eventAssetFilter,
    setEventAssetFilter,
    activeEventAssetId,
    activeEventAsset,
    parsedEventAsset,
    selectedEventKey,
    selectedEvent,
    selectedTimelineEntryId,
    setSelectedTimelineEntryId,
    timelineJumpRequestId,
    requestTimelineJump,
    clearTimelineJumpRequest,
    eventStatusMessage,
    handleOpenEventAsset,
    handleSelectEvent,
  }
}
