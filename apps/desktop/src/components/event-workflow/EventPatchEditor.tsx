import { useMemo, useState, useRef, useEffect } from 'react'
import {
  Plus, Trash2, FileText, Database, ListTree, Text, Code,
  Map, MousePointerClick,
} from 'lucide-react'
import type { DraftPatch, GeneratedProjectDraft } from '../../lib/app/useGeneratedProject'
import type { LocaleCode, ThemeMode, ViewportLabels } from '../../lib/editor-shell'
import { parseEventCommands, parseEventCommand, parseEventSceneSetup } from '../../lib/events/parser'
import type { EventScript } from '../../lib/events/types'
import { getEventCommandTitle, KNOWN_EVENT_COMMANDS } from '../../lib/events/commandCatalog'
import { EventStagePreview } from './EventStagePreview'
import { EventCommandPipeline, CommandEditor } from './EventCommandPipeline'

// TODO: Support TextOperations (Append/Prepend/ReplaceDelimited) for event script editing
// TODO: Support Fork condition editing in a more visual way

interface EventPatchEditorProps {
  patch: DraftPatch
  draft: GeneratedProjectDraft
  onPatchChange: (patchId: string, patch: Partial<DraftPatch>) => void
  onAddVirtualAsset: (asset: { relativePath: string; mediaType: string; bytesBase64: string }) => void
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
  gameRootPath?: string | null
}

export function EventPatchEditor({ patch, draft, onPatchChange, onAddVirtualAsset, locale, theme, accentColor, viewportLabels, gameRootPath: externalGameRootPath }: EventPatchEditorProps) {
  void onAddVirtualAsset
  const editorState = (patch.editorState as Record<string, unknown> | undefined) ?? {}
  const entries = (editorState['entries'] as Record<string, unknown> | undefined) ?? {}
  const fields = (editorState['fields'] as Record<string, Record<string, string>> | undefined) ?? {}
  const moveEntries = (editorState['moveEntries'] as Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }> | undefined) ?? []

  // Prefer external gameRootPath (from app-level scan), fallback to draft metadata
  const gameRootPath = externalGameRootPath ?? draft.projectMetadata.gameRootPath ?? null

  // Original event scripts from scanned game data (read-only reference)
  const eventSnapshot = draft.eventSourceSnapshotsByTarget[patch.target]
  const originalScripts = eventSnapshot?.rawScriptsByKey ?? {}

  type EditorTab = 'events' | 'fields' | 'textops' | 'moveentries'
  const [activeTab, setActiveTab] = useState<EditorTab>('events')

  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  function updateEntries(newEntries: Record<string, unknown>) {
    onPatchChange(patch.id, {
      editorState: { ...editorState, entries: newEntries },
    })
  }

  function updateFields(newFields: Record<string, Record<string, string>>) {
    onPatchChange(patch.id, {
      editorState: { ...editorState, fields: newFields },
    })
  }

  function updateTextOperations(newOps: unknown[]) {
    onPatchChange(patch.id, {
      editorState: { ...editorState, textOperations: newOps },
    })
  }

  function updateMoveEntries(newEntries: Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }>) {
    onPatchChange(patch.id, {
      editorState: { ...editorState, moveEntries: newEntries },
    })
  }

  function updateCommand(index: number, newRaw: string) {
    if (!selectedKey) return
    const selectedEntry = entries[selectedKey]
    if (typeof selectedEntry !== 'string') return
    const segments = parseEventCommands(selectedEntry)
    segments[index + 3] = newRaw
    const newScript = segments.join('/')
    updateEntries({ ...entries, [selectedKey]: newScript })
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--text-primary)]">{patch.target}</span>
          <span className="text-[10px] text-[var(--text-secondary)]">({patch.action})</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg bg-[var(--bg-panel-muted)] p-0.5">
          <button
            type="button"
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
              activeTab === 'events'
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => { setActiveTab('events'); setSelectedKey(null) }}
          >
            <ListTree className="h-3 w-3" /> Events
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
              activeTab === 'fields'
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => { setActiveTab('fields'); setSelectedKey(null) }}
          >
            <Database className="h-3 w-3" /> Fields
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
              activeTab === 'textops'
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => { setActiveTab('textops'); setSelectedKey(null) }}
          >
            <Text className="h-3 w-3" /> TextOps
          </button>
          <button
            type="button"
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-medium transition-colors ${
              activeTab === 'moveentries'
                ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
            onClick={() => { setActiveTab('moveentries'); setSelectedKey(null) }}
          >
            <FileText className="h-3 w-3" /> MoveEntries
          </button>
        </div>
      </div>

      {/* TargetField */}
      <div className="flex items-center gap-2 border-b border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-1.5">
        <span className="shrink-0 text-[9px] font-medium uppercase tracking-wider text-[var(--text-secondary)]">TargetField</span>
        <input
          type="text"
          placeholder="e.g. Emily, Appearance (comma-separated path segments)"
          className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-0.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
          value={patch.targetField?.join(', ') ?? ''}
          onChange={(e) => {
            const parts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
            onPatchChange(patch.id, { targetField: parts.length > 0 ? parts : undefined })
          }}
        />
      </div>

      {activeTab === 'events' ? (
        <EventsEditor
          entries={entries}
          originalScripts={originalScripts}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          updateEntries={updateEntries}
          updateCommand={updateCommand}
          patchTarget={patch.target}
          gameRootPath={gameRootPath}
          locale={locale}
          theme={theme}
          accentColor={accentColor}
          viewportLabels={viewportLabels}
        />
      ) : activeTab === 'fields' ? (
        <FieldsEditor
          fields={fields}
          selectedKey={selectedKey}
          setSelectedKey={setSelectedKey}
          updateFields={updateFields}
        />
      ) : activeTab === 'textops' ? (
        <TextOpsEditor
          textOperations={(editorState['textOperations'] as unknown[] | undefined) ?? []}
          updateTextOperations={updateTextOperations}
        />
      ) : (
        <MoveEntriesEditor
          moveEntries={moveEntries}
          updateMoveEntries={updateMoveEntries}
        />
      )}
    </div>
  )
}

// ─── Events Sub-Editor ───────────────────────────────────────────────────

const COMMAND_TEMPLATES: Record<string, string> = {
  speak: 'speak Abigail "Hello!"',
  splitSpeak: 'splitSpeak Abigail "Hello...#there!"',
  message: 'message "A message appears..."',
  pause: 'pause 1000',
  move: 'move Abigail 0 1 0 2 2',
  warp: 'warp Abigail 10 15 2',
  emote: 'emote Abigail 8',
  faceDirection: 'faceDirection Abigail 2',
  playMusic: 'playMusic wavy',
  playSound: 'playSound coin',
  stopMusic: 'stopMusic',
  stopSound: 'stopSound',
  viewport: 'viewport 10 10',
  changeLocation: 'changeLocation Town',
  globalFade: 'globalFade',
  globalFadeToClear: 'globalFadeToClear',
  fade: 'fade',
  question: 'question "Choose one?"',
  quickQuestion: 'quickQuestion "Quick choice?"',
  catQuestion: 'catQuestion',
  cave: 'cave',
  fork: 'fork',
  switchEvent: 'switchEvent newEvent',
  end: 'end',
  beginSimultaneousCommand: 'beginSimultaneousCommand',
  endSimultaneousCommand: 'endSimultaneousCommand',
  jump: 'jump Abigail',
  shake: 'shake 500',
  screenFlash: 'screenFlash',
  addItem: 'addItem "Object name"',
  removeItem: 'removeItem "Object name"',
  money: 'money 100',
  friendship: 'friendship Abigail 250',
  animate: 'animate Abigail true',
  stopAnimation: 'stopAnimation Abigail',
  showFrame: 'showFrame Abigail 0',
  speed: 'speed Abigail 4',
  advancedMove: 'advancedMove Abigail false 0 1',
  warpFarmers: 'warpFarmers 10 15',
  addObject: 'addObject 10 15 "Object name"',
  removeObject: 'removeObject 10 15',
  addProp: 'addProp 10 15 "Prop name"',
  addBigProp: 'addBigProp 10 15 "Prop name"',
  addFloorProp: 'addFloorProp 10 15 "Prop name"',
  addTemporaryActor: 'addTemporaryActor "Actor" 16 32 10 15 2',
  removeSprite: 'removeSprite Abigail',
  changeSprite: 'changeSprite Abigail "NewSprite"',
  changePortrait: 'changePortrait Abigail "NewPortrait"',
  textAboveHead: 'textAboveHead Abigail "Hello!"',
  glow: 'glow Abigail',
  stopGlowing: 'stopGlowing Abigail',
  setRunning: 'setRunning Abigail true',
  stopRunning: 'stopRunning Abigail',
  startJittering: 'startJittering Abigail',
  stopJittering: 'stopJittering Abigail',
  ignoreMovementAnimation: 'ignoreMovementAnimation Abigail',
  ignoreCollisions: 'ignoreCollisions Abigail',
  farmerAnimation: 'farmerAnimation 0',
  farmerEat: 'farmerEat "Object name"',
  itemAboveHead: 'itemAboveHead "Object name"',
  mail: 'mail "LetterId"',
  mailReceived: 'mailReceived "LetterId"',
  mailToday: 'mailToday "LetterId"',
  addQuest: 'addQuest "QuestId"',
  removeQuest: 'removeQuest "QuestId"',
  addSpecialOrder: 'addSpecialOrder "OrderId"',
  removeSpecialOrder: 'removeSpecialOrder "OrderId"',
  addCookingRecipe: 'addCookingRecipe "Recipe name"',
  addCraftingRecipe: 'addCraftingRecipe "Recipe name"',
  addConversationTopic: 'addConversationTopic "TopicId" 7',
  addLantern: 'addLantern 10 15',
  cutscene: 'cutscene "CutsceneId"',
  doAction: 'doAction 10 15',
  proceedPosition: 'proceedPosition',
  playerControl: 'playerControl',
  skippable: 'skippable',
  halt: 'halt',
  eyes: 'eyes Abigail 0',
  changeName: 'changeName Abigail "NewName"',
  changeMapTile: 'changeMapTile "Back" 10 15 "TileSheet" 0',
  changeToTemporaryMap: 'changeToTemporaryMap "MapName"',
  changeYSourceRectOffset: 'changeYSourceRectOffset Abigail 0',
  attachCharacterToTempSprite: 'attachCharacterToTempSprite Abigail',
  awardFestivalPrize: 'awardFestivalPrize',
  broadcastEvent: 'broadcastEvent',
  characterSelect: 'characterSelect',
  dump: 'dump',
  elliotbooktalk: 'elliotbooktalk',
  eventSeen: 'eventSeen',
  extendSourceRect: 'extendSourceRect Abigail 0 0',
  grandpaCandles: 'grandpaCandles',
  grandpaEvaluation: 'grandpaEvaluation',
  grandpaEvaluation2: 'grandpaEvaluation2',
  hideShadow: 'hideShadow Abigail',
  hospitaldeath: 'hospitaldeath',
  ignoreEventTileOffset: 'ignoreEventTileOffset',
  loadActors: 'loadActors',
  makeInvisible: 'makeInvisible Abigail',
  minedeath: 'minedeath',
  positionOffset: 'positionOffset Abigail 0 0',
  questionAnswered: 'questionAnswered',
  removeTile: 'removeTile "Back" 10 15',
  replaceWithClone: 'replaceWithClone Abigail',
  resetVariable: 'resetVariable',
  rustyKey: 'rustyKey',
  setSkipActions: 'setSkipActions',
  specificTemporarySprite: 'specificTemporarySprite 0 10 15',
  swimming: 'swimming',
  stopSwimming: 'stopSwimming',
  temporarySprite: 'temporarySprite 0 10 15',
  temporaryAnimatedSprite: 'temporaryAnimatedSprite 0 10 15',
  tossConcession: 'tossConcession',
  translateName: 'translateName',
  tutorialMenu: 'tutorialMenu',
  updateMinigame: 'updateMinigame',
  ambientLight: 'ambientLight 255 255 255',
  animalNaming: 'animalNaming',
}

function EventsEditor({
  entries,
  originalScripts,
  selectedKey,
  setSelectedKey,
  updateEntries,
  updateCommand,
  patchTarget,
  gameRootPath,
  locale,
  theme,
  accentColor,
  viewportLabels,
}: {
  entries: Record<string, unknown>
  originalScripts: Record<string, string>
  selectedKey: string | null
  setSelectedKey: (k: string | null) => void
  updateEntries: (e: Record<string, unknown>) => void
  updateCommand: (index: number, newRaw: string) => void
  patchTarget: string
  gameRootPath: string | null
  locale?: LocaleCode
  theme?: ThemeMode
  accentColor?: string
  viewportLabels?: ViewportLabels
}) {
  const entryList = Object.entries(entries)
  const selectedEntry = selectedKey ? entries[selectedKey] ?? null : null
  const selectedEntryString = typeof selectedEntry === 'string' ? selectedEntry : null
  const selectedOriginalScript = selectedKey ? originalScripts[selectedKey] ?? null : null

  const parsedEvent = useMemo(() => {
    if (selectedEntryString === null) return null
    const segments = parseEventCommands(selectedEntryString)
    const scene = parseEventSceneSetup(segments)
    const commands = segments.slice(3).map((raw, index) => parseEventCommand(raw, index))
    return { scene, commands, segments }
  }, [selectedEntryString])

  const eventScript: EventScript | null = useMemo(() => {
    if (!parsedEvent || !selectedKey || selectedEntryString === null) return null
    return {
      key: selectedKey,
      eventId: selectedKey,
      preconditions: [],
      rawScript: selectedEntryString,
      rawSegments: parsedEvent.segments,
      scene: parsedEvent.scene,
      commands: parsedEvent.commands,
    }
  }, [parsedEvent, selectedKey, selectedEntryString])

  const mapName = useMemo(() => {
    const parts = patchTarget.split('/')
    return parts[parts.length - 1] ?? null
  }, [patchTarget])

  const [rightPanelTab, setRightPanelTab] = useState<'scene' | 'command' | 'raw'>('scene')
  const [selectedCmdId, setSelectedCmdId] = useState<string | null>(null)
  const [expandedCmdId, setExpandedCmdId] = useState<string | null>(null)
  const [showCommandPicker, setShowCommandPicker] = useState(false)
  const [commandPickerSearch, setCommandPickerSearch] = useState('')
  const [pickingActorIndex, setPickingActorIndex] = useState<number | null>(null)
  const commandPickerRef = useRef<HTMLButtonElement>(null)

  const selectedCommand = useMemo(() => {
    if (!selectedCmdId || !parsedEvent) return null
    return parsedEvent.commands.find((c) => c.id === selectedCmdId) ?? null
  }, [selectedCmdId, parsedEvent])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (commandPickerRef.current && !commandPickerRef.current.contains(e.target as Node)) {
        setShowCommandPicker(false)
      }
    }
    if (showCommandPicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCommandPicker])

  function handleSelectCommand(id: string) {
    setSelectedCmdId(id)
    setRightPanelTab('command')
  }

  function handleDeleteCommand(index: number) {
    if (!selectedKey || !parsedEvent) return
    const newSegments = parsedEvent.segments.filter((_, i) => i !== index + 3)
    updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
    setSelectedCmdId((prev) => {
      const cmd = parsedEvent.commands.find((c) => c.index === index)
      if (cmd && prev === cmd.id) return null
      return prev
    })
  }

  function insertCommandAfter(index: number, raw: string) {
    if (!selectedKey || !parsedEvent) return
    const insertAt = index + 1
    const newSegments = ensureSegmentPadding([...parsedEvent.segments])
    newSegments.splice(insertAt + 3, 0, raw)
    updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
  }

  function addCommand(commandName: string) {
    const template = COMMAND_TEMPLATES[commandName] ?? commandName
    if (!selectedKey || !parsedEvent) return
    const newSegments = ensureSegmentPadding([...parsedEvent.segments])
    newSegments.push(template)
    updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
    setShowCommandPicker(false)
    setCommandPickerSearch('')
  }

  function handleTileClick(tileX: number, tileY: number) {
    if (pickingActorIndex === null || !parsedEvent || !selectedKey) return
    const newActors = parsedEvent.scene.actors.map((a, i) => (i === pickingActorIndex ? { ...a, tileX, tileY } : a))
    const newScene = { ...parsedEvent.scene, actors: newActors }
    const actorSegment = newScene.actors.map((a) => (`${a.actorName} ${a.tileX} ${a.tileY} ${a.facingDirection}`)).join(' ')
    const newSegments = ensureSegmentPadding([...parsedEvent.segments])
    newSegments[2] = actorSegment
    updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
    setPickingActorIndex(null)
  }

  function handleContextMenuAction(action: 'addActor' | 'setCamera' | 'addWarp', tileX: number, tileY: number) {
    if (!selectedKey || !parsedEvent) return
    switch (action) {
      case 'addActor': {
        const defaultName = `actor${parsedEvent.scene.actors.length + 1}`
        const newActor = { id: `actor-${Date.now()}`, actorName: defaultName, tileX, tileY, facingDirection: 2 }
        const newScene = { ...parsedEvent.scene, actors: [...parsedEvent.scene.actors, newActor] }
        const actorSegment = newScene.actors.map((a) => `${a.actorName} ${a.tileX} ${a.tileY} ${a.facingDirection}`).join(' ')
        const newSegments = ensureSegmentPadding([newScene.musicCue ?? '', newScene.cameraInstruction ?? '', newScene.characterInstruction ?? '', ...parsedEvent.segments.slice(3)])
        newSegments[2] = actorSegment
        updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
        break
      }
      case 'setCamera': {
        const newScene = { ...parsedEvent.scene, cameraInstruction: `${tileX} ${tileY}` }
        const newSegments = ensureSegmentPadding([newScene.musicCue ?? '', newScene.cameraInstruction ?? '', newScene.characterInstruction ?? '', ...parsedEvent.segments.slice(3)])
        updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
        break
      }
      case 'addWarp': {
        const targetActor = parsedEvent.scene.actors[0]?.actorName ?? 'farmer'
        const newSegments = ensureSegmentPadding([...parsedEvent.segments])
        newSegments.push(`warp ${targetActor} ${tileX} ${tileY}`)
        updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
        break
      }
    }
  }

  function ensureSegmentPadding(segments: string[]): string[] {
    const result = [...segments]
    while (result.length < 3) {
      result.push('')
    }
    return result
  }

  const commandGroups = useMemo(() => {
    const groups = [
      { label: locale === 'zh-CN' ? '对话' : 'Dialogue', kind: 'dialogue' as const, commands: ['speak', 'splitSpeak', 'message', 'textAboveHead'] },
      { label: locale === 'zh-CN' ? '选择' : 'Choice', kind: 'choice' as const, commands: ['question', 'quickQuestion', 'catQuestion', 'cave'] },
      { label: locale === 'zh-CN' ? '时序' : 'Timing', kind: 'timing' as const, commands: ['pause', 'waitForAllStationary', 'waitForOtherPlayers'] },
      { label: locale === 'zh-CN' ? '移动' : 'Movement', kind: 'action' as const, commands: ['move', 'warp', 'warpFarmers', 'jump', 'faceDirection', 'speed', 'advancedMove'] },
      { label: locale === 'zh-CN' ? '动画' : 'Animation', kind: 'action' as const, commands: ['animate', 'stopAnimation', 'showFrame', 'farmerAnimation', 'eyes', 'shake'] },
      { label: locale === 'zh-CN' ? '音频' : 'Audio', kind: 'action' as const, commands: ['playMusic', 'stopMusic', 'playSound', 'stopSound'] },
      { label: locale === 'zh-CN' ? '视觉效果' : 'Visual', kind: 'action' as const, commands: ['emote', 'globalFade', 'globalFadeToClear', 'fade', 'screenFlash', 'glow', 'stopGlowing', 'ambientLight'] },
      { label: locale === 'zh-CN' ? '场景' : 'Scene', kind: 'action' as const, commands: ['changeLocation', 'viewport', 'changeToTemporaryMap', 'changeMapTile', 'cutscene'] },
      { label: locale === 'zh-CN' ? '分支' : 'Branch', kind: 'branch' as const, commands: ['fork', 'switchEvent', 'end', 'beginSimultaneousCommand', 'endSimultaneousCommand'] },
      { label: locale === 'zh-CN' ? '物品对象' : 'Objects', kind: 'action' as const, commands: ['addObject', 'removeObject', 'addItem', 'removeItem', 'addProp', 'addBigProp', 'addFloorProp', 'addLantern', 'itemAboveHead'] },
      { label: locale === 'zh-CN' ? '角色' : 'Character', kind: 'action' as const, commands: ['addTemporaryActor', 'removeSprite', 'changeSprite', 'changePortrait', 'friendship', 'changeName', 'hideShadow', 'makeInvisible'] },
      { label: locale === 'zh-CN' ? '游戏' : 'Gameplay', kind: 'action' as const, commands: ['money', 'addQuest', 'removeQuest', 'mail', 'mailReceived', 'mailToday', 'addCookingRecipe', 'addCraftingRecipe', 'addSpecialOrder', 'removeSpecialOrder', 'addConversationTopic', 'awardFestivalPrize'] },
      { label: locale === 'zh-CN' ? '其他' : 'Other', kind: 'action' as const, commands: [] as string[] },
    ]
    const grouped = new Set<string>()
    for (const g of groups) {
      for (const c of g.commands) grouped.add(c)
    }
    const remaining = Array.from(KNOWN_EVENT_COMMANDS).filter((c) => !grouped.has(c))
    groups[groups.length - 1]!.commands = remaining
    return groups
  }, [locale])

  const filteredGroups = useMemo(() => {
    if (!commandPickerSearch.trim()) return commandGroups
    const search = commandPickerSearch.toLowerCase()
    return commandGroups
      .map((g) => ({
        ...g,
        commands: g.commands.filter((c) =>
          c.toLowerCase().includes(search) ||
          getEventCommandTitle(c).toLowerCase().includes(search)
        ),
      }))
      .filter((g) => g.commands.length > 0)
  }, [commandGroups, commandPickerSearch])

  const isModified = selectedOriginalScript !== null && selectedOriginalScript !== selectedEntryString

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left: Event List */}
      <div className="flex w-44 shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Events ({entryList.length})
          </span>
          <button
            type="button"
            className="icon-button h-6 w-6"
            onClick={() => {
              const newKey = `newEvent${entryList.length + 1}`
              updateEntries({ ...entries, [newKey]: '' })
              setSelectedKey(newKey)
            }}
            title="Add event"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto py-1">
          {entryList.length === 0 ? (
            <div className="px-3 py-4 text-center text-[10px] text-[var(--text-secondary)]">
              No events yet.<br />Click + to add one.
            </div>
          ) : (
            entryList.map(([key]) => (
              <button
                key={key}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  selectedKey === key
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]'
                }`}
                onClick={() => setSelectedKey(key)}
              >
                <FileText className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{key}</span>
                {originalScripts[key] && originalScripts[key] !== entries[key] && (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" title="Modified from original" />
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Center: Canvas + Commands */}
      <div className="min-w-0 flex-1 flex flex-col">
        {/* Stage Preview */}
        <div className="relative min-h-0 flex-[2] border-b border-[var(--border-color)]">
          {eventScript ? (
            <EventStagePreview
              eventScript={eventScript}
              mapName={mapName}
              gameRootPath={gameRootPath}
              locale={locale}
              theme={theme}
              accentColor={accentColor}
              viewportLabels={viewportLabels}
              className="h-full"
              hideHeader
              onTileClick={pickingActorIndex !== null ? handleTileClick : undefined}
              onContextMenuAction={handleContextMenuAction}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
              <Map className="h-8 w-8 opacity-40" />
              <p className="text-xs">Select an event to preview stage.</p>
              {gameRootPath ? null : (
                <p className="text-[10px]">Configure game root path for map preview.</p>
              )}
            </div>
          )}
        </div>

        {/* Command Pipeline */}
        <div className="relative min-h-0 flex-1 flex flex-col bg-[var(--bg-app)]">
          {/* Toolbar */}
          <div className="flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Commands ({parsedEvent?.commands.length ?? 0})
            </span>
            <div className="flex items-center gap-1">
              {isModified && (
                <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_15%,transparent)] px-2 py-0.5 text-[9px] font-medium text-[var(--accent)]">
                  Modified
                </span>
              )}
              <div className="relative">
                <button
                  type="button"
                  ref={commandPickerRef}
                  className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--bg-active)]"
                  onClick={() => setShowCommandPicker((s) => !s)}
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
                {showCommandPicker && (
                  <div className="absolute bottom-full right-0 z-50 mb-1 w-72 max-h-80 overflow-hidden rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel)] shadow-[var(--shadow-panel)]">
                    <div className="border-b border-[var(--border-color)] p-2">
                      <input
                        type="text"
                        autoFocus
                        placeholder={locale === 'zh-CN' ? '搜索命令...' : 'Search commands...'}
                        className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        value={commandPickerSearch}
                        onChange={(e) => setCommandPickerSearch(e.target.value)}
                      />
                    </div>
                    <div className="max-h-64 overflow-auto p-2">
                      {filteredGroups.map((group) => (
                        <div key={group.label} className="mb-2">
                          <div className="mb-1 px-1 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                            {group.label}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {group.commands.map((cmd) => (
                              <button
                                key={cmd}
                                type="button"
                                className="rounded border border-[var(--border-color)] bg-[var(--bg-panel-muted)] px-2 py-0.5 text-[10px] text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                                onClick={() => addCommand(cmd)}
                                title={COMMAND_TEMPLATES[cmd] ?? cmd}
                              >
                                {getEventCommandTitle(cmd)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                      {filteredGroups.length === 0 && (
                        <div className="py-4 text-center text-[10px] text-[var(--text-secondary)]">
                          {locale === 'zh-CN' ? '未找到命令' : 'No commands found'}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-2">
            {parsedEvent ? (
              <EventCommandPipeline
                commands={parsedEvent.commands}
                selectedId={selectedCmdId}
                expandedId={expandedCmdId}
                onSelect={handleSelectCommand}
                onToggleExpand={(id) => setExpandedCmdId((prev) => (prev === id ? null : id))}
                onChange={(index, newRaw) => updateCommand(index, newRaw)}
                onDelete={handleDeleteCommand}
                onInsertAfter={insertCommandAfter}
                locale={locale === 'zh-CN' ? 'zh-CN' : 'en-US'}
              />
            ) : selectedEntry !== null ? (
              <div className="space-y-3 p-3">
                <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-3">
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Entry Value</div>
                  <p className="mb-2 text-[10px] text-[var(--text-secondary)]">This entry is not an event script. Edit the raw JSON below.</p>
                  <textarea
                    className="h-64 w-full resize-none rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 font-mono text-[10px] leading-4 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={JSON.stringify(selectedEntry, null, 2)}
                    onChange={(e) => {
                      if (!selectedKey) return
                      try {
                        updateEntries({ ...entries, [selectedKey]: JSON.parse(e.target.value) })
                      } catch {
                        // ignore invalid JSON while typing
                      }
                    }}
                    spellCheck={false}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
                <ListTree className="h-8 w-8 opacity-40" />
                <p className="text-xs">Select an event to edit commands.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Properties Panel */}
      <div className="flex w-72 shrink-0 flex-col border-l border-[var(--border-color)] bg-[var(--bg-panel)]">
        {/* Tabs */}
        <div className="flex border-b border-[var(--border-color)]">
          {(['scene', 'command', 'raw'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`flex-1 px-2 py-1.5 text-[10px] font-medium uppercase transition-colors ${
                rightPanelTab === tab
                  ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
              onClick={() => setRightPanelTab(tab)}
            >
              {tab}
              {tab === 'command' && selectedCmdId && (
                <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto">
          {rightPanelTab === 'scene' && parsedEvent && (
            <div className="space-y-4 p-3">
              {/* Scene Settings */}
              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Scene Setup</div>
                <div className="space-y-2">
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">Music Cue</label>
                    <input
                      type="text"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={parsedEvent.scene.musicCue ?? ''}
                      onChange={(e) => {
                        const newScene = { ...parsedEvent.scene, musicCue: e.target.value || null }
                        const newSegments = ensureSegmentPadding([newScene.musicCue ?? '', newScene.cameraInstruction ?? '', newScene.characterInstruction ?? '', ...parsedEvent.segments.slice(3)])
                        if (selectedKey) updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">Camera</label>
                    <input
                      type="text"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={parsedEvent.scene.cameraInstruction ?? ''}
                      onChange={(e) => {
                        const newScene = { ...parsedEvent.scene, cameraInstruction: e.target.value || null }
                        const newSegments = ensureSegmentPadding([newScene.musicCue ?? '', newScene.cameraInstruction ?? '', newScene.characterInstruction ?? '', ...parsedEvent.segments.slice(3)])
                        if (selectedKey) updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Actors */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Actors</span>
                  <span className="text-[9px] text-[var(--text-tertiary)]">{parsedEvent.scene.actors.length} total</span>
                </div>
                <div className="mb-2">
                  <input
                    type="text"
                    placeholder="Name X Y Dir"
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter') return
                      const input = e.currentTarget
                      const parts = input.value.trim().split(/\s+/)
                      if (parts.length < 1) return
                      const name = parts[0]
                      const x = Number.parseInt(parts[1] ?? '0', 10) || 0
                      const y = Number.parseInt(parts[2] ?? '0', 10) || 0
                      const dir = Number.parseInt(parts[3] ?? '2', 10) || 2
                      const newActor = { id: `actor-${Date.now()}`, actorName: name, tileX: x, tileY: y, facingDirection: dir }
                      const newScene = { ...parsedEvent.scene, actors: [...parsedEvent.scene.actors, newActor] }
                      const actorSegment = newScene.actors.map((a) => `${a.actorName} ${a.tileX} ${a.tileY} ${a.facingDirection}`).join(' ')
                      const newSegments = ensureSegmentPadding([newScene.musicCue ?? '', newScene.cameraInstruction ?? '', newScene.characterInstruction ?? '', ...parsedEvent.segments.slice(3)])
                      newSegments[2] = actorSegment
                      if (selectedKey) updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
                      input.value = ''
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  {parsedEvent.scene.actors.map((actor, idx) => (
                    <div key={actor.id} className="group rounded-md border border-[var(--border-color)] bg-[var(--bg-app)] p-2">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-[var(--text-primary)]">{actor.actorName}</span>
                        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            className={`rounded px-1.5 py-0 text-[9px] font-semibold transition-colors ${
                              pickingActorIndex === idx
                                ? 'bg-[var(--accent)] text-white'
                                : 'text-[var(--text-tertiary)] hover:text-[var(--accent)]'
                            }`}
                            onClick={() => setPickingActorIndex(pickingActorIndex === idx ? null : idx)}
                            title="Pick position from map"
                          >
                            Pick
                          </button>
                          <button
                            type="button"
                            className="text-red-400"
                            onClick={() => {
                              const newActors = parsedEvent.scene.actors.filter((_, i) => i !== idx)
                              const newScene = { ...parsedEvent.scene, actors: newActors }
                              const actorSegment = newScene.actors.length ? newScene.actors.map((a) => `${a.actorName} ${a.tileX} ${a.tileY} ${a.facingDirection}`).join(' ') : ''
                              const newSegments = ensureSegmentPadding([...parsedEvent.segments])
                              newSegments[2] = actorSegment
                              if (selectedKey) updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1">
                          <label className="mb-0.5 block text-[8px] uppercase text-[var(--text-tertiary)]">X</label>
                          <input
                            type="number"
                            className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-panel)] px-1 py-0.5 text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                            value={actor.tileX}
                            onChange={(e) => {
                              const x = Number.parseInt(e.target.value, 10) || 0
                              const newActors = parsedEvent.scene.actors.map((a, i) => i === idx ? { ...a, tileX: x } : a)
                              const newScene = { ...parsedEvent.scene, actors: newActors }
                              const actorSegment = newScene.actors.map((a) => `${a.actorName} ${a.tileX} ${a.tileY} ${a.facingDirection}`).join(' ')
                              const newSegments = ensureSegmentPadding([...parsedEvent.segments])
                              newSegments[2] = actorSegment
                              if (selectedKey) updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="mb-0.5 block text-[8px] uppercase text-[var(--text-tertiary)]">Y</label>
                          <input
                            type="number"
                            className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-panel)] px-1 py-0.5 text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                            value={actor.tileY}
                            onChange={(e) => {
                              const y = Number.parseInt(e.target.value, 10) || 0
                              const newActors = parsedEvent.scene.actors.map((a, i) => i === idx ? { ...a, tileY: y } : a)
                              const newScene = { ...parsedEvent.scene, actors: newActors }
                              const actorSegment = newScene.actors.map((a) => `${a.actorName} ${a.tileX} ${a.tileY} ${a.facingDirection}`).join(' ')
                              const newSegments = ensureSegmentPadding([...parsedEvent.segments])
                              newSegments[2] = actorSegment
                              if (selectedKey) updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="mb-0.5 block text-[8px] uppercase text-[var(--text-tertiary)]">Dir</label>
                          <select
                            className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-panel)] px-1 py-0.5 text-[10px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                            value={actor.facingDirection}
                            onChange={(e) => {
                              const dir = Number.parseInt(e.target.value, 10) || 2
                              const newActors = parsedEvent.scene.actors.map((a, i) => i === idx ? { ...a, facingDirection: dir } : a)
                              const newScene = { ...parsedEvent.scene, actors: newActors }
                              const actorSegment = newScene.actors.map((a) => `${a.actorName} ${a.tileX} ${a.tileY} ${a.facingDirection}`).join(' ')
                              const newSegments = ensureSegmentPadding([...parsedEvent.segments])
                              newSegments[2] = actorSegment
                              if (selectedKey) updateEntries({ ...entries, [selectedKey]: newSegments.join('/') })
                            }}
                          >
                            <option value={0}>Up</option>
                            <option value={1}>Right</option>
                            <option value={2}>Down</option>
                            <option value={3}>Left</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {parsedEvent.scene.actors.length === 0 && (
                  <div className="rounded border border-dashed border-[var(--border-color)] p-3 text-center">
                    <p className="text-[10px] text-[var(--text-secondary)]">No actors yet.</p>
                    <p className="mt-1 text-[9px] text-[var(--text-tertiary)]">Type "Name X Y Dir" above and press Enter to add.</p>
                    <p className="text-[9px] text-[var(--text-tertiary)]">Example: farmer 10 10 2</p>
                  </div>
                )}
              </div>

              {/* Original Script */}
              {selectedOriginalScript && selectedOriginalScript !== selectedEntryString && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)]">Original Script</span>
                    <span className="text-[9px] text-[var(--text-secondary)]">Read-only</span>
                  </div>
                  <textarea
                    className="h-20 w-full resize-none rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 font-mono text-[10px] leading-4 text-[var(--text-secondary)] outline-none"
                    value={selectedOriginalScript}
                    readOnly
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          )}

          {rightPanelTab === 'command' && selectedCommand && (
            <div className="p-3">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Edit Command</span>
                <span className="rounded bg-[var(--bg-panel-muted)] px-1.5 py-0.5 text-[9px] text-[var(--text-tertiary)]">{selectedCommand.command}</span>
              </div>
              <CommandEditor
                command={selectedCommand}
                onChange={(newRaw) => updateCommand(selectedCommand.index, newRaw)}
                onDelete={() => handleDeleteCommand(selectedCommand.index)}
              />
            </div>
          )}

          {rightPanelTab === 'command' && !selectedCommand && parsedEvent && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-[var(--text-secondary)]">
              <MousePointerClick className="h-8 w-8 opacity-40" />
              <p className="text-xs text-center">Select a command from the pipeline to edit.</p>
            </div>
          )}

          {rightPanelTab === 'raw' && selectedEntryString !== null && (
            <div className="p-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Raw Script</div>
              <textarea
                className="h-full min-h-[200px] w-full resize-none rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 font-mono text-[10px] leading-4 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                value={selectedEntryString}
                onChange={(e) => {
                  if (!selectedKey) return
                  updateEntries({ ...entries, [selectedKey]: e.target.value })
                }}
                spellCheck={false}
              />
            </div>
          )}

          {rightPanelTab === 'raw' && selectedEntryString === null && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-[var(--text-secondary)]">
              <Code className="h-8 w-8 opacity-40" />
              <p className="text-xs text-center">No event selected.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Fields Sub-Editor ───────────────────────────────────────────────────

function FieldsEditor({
  fields,
  selectedKey,
  setSelectedKey,
  updateFields,
}: {
  fields: Record<string, Record<string, string>>
  selectedKey: string | null
  setSelectedKey: (k: string | null) => void
  updateFields: (f: Record<string, Record<string, string>>) => void
}) {
  const entryList = Object.entries(fields)
  const selectedFieldMap = selectedKey ? fields[selectedKey] ?? null : null

  return (
    <div className="flex min-h-0 flex-1">
      {/* Left: Entry Key List */}
      <div className="flex w-56 shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Entries ({entryList.length})
          </span>
          <button
            type="button"
            className="icon-button h-6 w-6"
            onClick={() => {
              const newKey = `Entry${entryList.length + 1}`
              updateFields({ ...fields, [newKey]: {} })
              setSelectedKey(newKey)
            }}
            title="Add entry"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto py-1">
          {entryList.length === 0 ? (
            <div className="px-3 py-4 text-center text-[10px] text-[var(--text-secondary)]">
              No entries yet.
              <br />
              Click + to add one.
            </div>
          ) : (
            entryList.map(([key]) => (
              <button
                key={key}
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  selectedKey === key
                    ? 'bg-[var(--bg-active)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-panel-muted)]'
                }`}
                onClick={() => setSelectedKey(key)}
              >
                <Database className="h-3 w-3 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{key}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right: Field Editor */}
      <div className="min-w-0 flex-1 overflow-auto p-3">
        {selectedFieldMap ? (
          <div className="space-y-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Fields for entry: <span className="text-[var(--text-primary)]">{selectedKey}</span>
            </div>

            <div className="space-y-2">
              {Object.entries(selectedFieldMap).map(([fieldName, fieldValue]) => (
                <div key={fieldName} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Field name (e.g. Price)"
                    className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={fieldName}
                    onChange={(e) => {
                      const newMap: Record<string, string> = {}
                      for (const [k, v] of Object.entries(selectedFieldMap)) {
                        if (k === fieldName) {
                          newMap[e.target.value] = v
                        } else {
                          newMap[k] = v
                        }
                      }
                      if (selectedKey) updateFields({ ...fields, [selectedKey]: newMap })
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Value"
                    className="min-w-0 flex-1 rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={fieldValue}
                    onChange={(e) => {
                      const newMap = { ...selectedFieldMap, [fieldName]: e.target.value }
                      if (selectedKey) updateFields({ ...fields, [selectedKey]: newMap })
                    }}
                  />
                  <button
                    type="button"
                    className="icon-button h-7 w-7 shrink-0 text-red-400"
                    onClick={() => {
                      const newMap: Record<string, string> = {}
                      for (const [k, v] of Object.entries(selectedFieldMap)) {
                        if (k !== fieldName) newMap[k] = v
                      }
                      if (selectedKey) updateFields({ ...fields, [selectedKey]: newMap })
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className="flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
              onClick={() => {
                if (!selectedKey) return
                const newFieldName = `field${Object.keys(selectedFieldMap).length + 1}`
                updateFields({ ...fields, [selectedKey]: { ...selectedFieldMap, [newFieldName]: '' } })
              }}
            >
              <Plus className="h-3 w-3" /> Add field
            </button>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
            <Database className="h-8 w-8 opacity-40" />
            <p className="text-xs">Select an entry from the left to edit its fields.</p>
            <p className="text-[10px]">Fields let you modify specific columns within a data entry.</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── TextOps Sub-Editor ──────────────────────────────────────────────────

interface TextOperation {
  operation: 'Append' | 'Prepend' | 'ReplaceDelimited' | 'RemoveDelimited'
  target: string[]
  value: string
  search?: string
  delimiter?: string
  replaceMode?: 'First' | 'All'
}

function TextOpsEditor({
  textOperations,
  updateTextOperations,
}: {
  textOperations: unknown[]
  updateTextOperations: (ops: unknown[]) => void
}) {
  const ops = textOperations as TextOperation[]

  function updateOp(index: number, patch: Partial<TextOperation>) {
    const next = [...ops]
    next[index] = { ...next[index]!, ...patch }
    updateTextOperations(next)
  }

  function addOp() {
    updateTextOperations([
      ...ops,
      { operation: 'Append', target: ['Entries', ''], value: '' },
    ])
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          TextOperations ({ops.length})
        </span>
        <button
          type="button"
          className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
          onClick={addOp}
        >
          <Plus className="h-3 w-3" /> Add operation
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {ops.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
            <Text className="h-8 w-8 opacity-40" />
            <p className="text-xs">No text operations yet.</p>
            <p className="max-w-xs text-center text-[10px]">
              TextOperations let you Append, Prepend, ReplaceDelimited, or RemoveDelimited
              text within data entries (e.g. adding items to NPCGiftTastes).
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {ops.map((op, index) => (
              <div
                key={index}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-2.5"
              >
                <div className="mb-2 flex items-center gap-2">
                  <select
                    className="rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={op.operation}
                    onChange={(e) =>
                      updateOp(index, { operation: e.target.value as TextOperation['operation'] })
                    }
                  >
                    <option value="Append">Append</option>
                    <option value="Prepend">Prepend</option>
                    <option value="ReplaceDelimited">ReplaceDelimited</option>
                    <option value="RemoveDelimited">RemoveDelimited</option>
                  </select>
                  <button
                    type="button"
                    className="icon-button h-6 w-6 text-red-400"
                    onClick={() =>
                      updateTextOperations(ops.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                      Target (comma-separated path)
                    </label>
                    <input
                      type="text"
                      placeholder="Entries, Universal_Love"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={op.target.join(', ')}
                      onChange={(e) => {
                        const parts = e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                        updateOp(index, { target: parts.length > 0 ? parts : [''] })
                      }}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                      Delimiter
                    </label>
                    <input
                      type="text"
                      placeholder=" "
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={op.delimiter ?? ''}
                      onChange={(e) =>
                        updateOp(index, { delimiter: e.target.value || undefined })
                      }
                    />
                  </div>
                </div>

                <div className="mt-2">
                  <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                    {op.operation === 'RemoveDelimited' ? 'Value to remove' : 'Value'}
                  </label>
                  <input
                    type="text"
                    className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    value={op.value}
                    onChange={(e) => updateOp(index, { value: e.target.value })}
                  />
                </div>

                {(op.operation === 'ReplaceDelimited' || op.operation === 'RemoveDelimited') && (
                  <>
                    <div className="mt-2">
                      <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                        Search
                      </label>
                      <input
                        type="text"
                        className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        value={op.search ?? ''}
                        onChange={(e) =>
                          updateOp(index, { search: e.target.value || undefined })
                        }
                      />
                    </div>
                    <div className="mt-2">
                      <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">
                        ReplaceMode
                      </label>
                      <select
                        className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        value={op.replaceMode ?? 'First'}
                        onChange={(e) =>
                          updateOp(index, { replaceMode: e.target.value as 'First' | 'All' })
                        }
                      >
                        <option value="First">First</option>
                        <option value="All">All</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MoveEntries Sub-Editor ──────────────────────────────────────────────

function MoveEntriesEditor({
  moveEntries,
  updateMoveEntries,
}: {
  moveEntries: Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }>
  updateMoveEntries: (entries: Array<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }>) => void
}) {
  function addEntry() {
    updateMoveEntries([...moveEntries, { id: '' }])
  }

  function updateEntry(index: number, updates: Partial<{ id: string; beforeId?: string; afterId?: string; toPosition?: string }>) {
    const next = [...moveEntries]
    next[index] = { ...next[index], ...updates }
    // Clean up empty optional fields
    if (updates.beforeId === '') delete (next[index] as Record<string, unknown>)['beforeId']
    if (updates.afterId === '') delete (next[index] as Record<string, unknown>)['afterId']
    if (updates.toPosition === '') delete (next[index] as Record<string, unknown>)['toPosition']
    updateMoveEntries(next)
  }

  function removeEntry(index: number) {
    updateMoveEntries(moveEntries.filter((_, i) => i !== index))
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          MoveEntries ({moveEntries.length})
        </span>
        <button
          type="button"
          className="flex items-center gap-1 text-[10px] text-[var(--accent)] hover:underline"
          onClick={addEntry}
        >
          <Plus className="h-3 w-3" /> Add entry
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {moveEntries.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-secondary)]">
            <FileText className="h-8 w-8 opacity-40" />
            <p className="text-xs">No move entries yet.</p>
            <p className="max-w-xs text-center text-[10px]">
              MoveEntries let you reorder entries in an EditData patch by specifying
              ID, BeforeId, AfterId, or ToPosition.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {moveEntries.map((entry, index) => (
              <div
                key={index}
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-panel-muted)] p-2.5"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[10px] font-medium text-[var(--text-secondary)]">#{index + 1}</span>
                  <button
                    type="button"
                    className="icon-button h-6 w-6 text-red-400"
                    onClick={() => removeEntry(index)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">ID</label>
                    <input
                      type="text"
                      placeholder="Entry ID"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={entry.id}
                      onChange={(e) => updateEntry(index, { id: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">ToPosition</label>
                    <input
                      type="text"
                      placeholder="e.g. 5"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={entry.toPosition ?? ''}
                      onChange={(e) => updateEntry(index, { toPosition: e.target.value || undefined })}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">BeforeId</label>
                    <input
                      type="text"
                      placeholder="ID to insert before"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={entry.beforeId ?? ''}
                      onChange={(e) => updateEntry(index, { beforeId: e.target.value || undefined })}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[9px] uppercase text-[var(--text-secondary)]">AfterId</label>
                    <input
                      type="text"
                      placeholder="ID to insert after"
                      className="w-full rounded border border-[var(--border-color)] bg-[var(--bg-app)] px-2 py-1 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      value={entry.afterId ?? ''}
                      onChange={(e) => updateEntry(index, { afterId: e.target.value || undefined })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
