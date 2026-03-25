import type { EventAssetSummary } from '../desktop'
import type {
  EventBranchChoice,
  EventCommand,
  EventCommandKind,
  EventDialoguePage,
  EventGraph,
  EventGraphEdge,
  EventGraphNode,
  EventSceneActor,
  EventSceneSetup,
  EventScript,
  ParsedEventAsset,
} from './types'

const DIALOGUE_PAGE_BREAK_PATTERN = /#\$(?:b|e)#/giu
const DIALOGUE_PORTRAIT_ALIAS_INDEX: Record<string, number> = {
  h: 1,
  s: 2,
  u: 3,
  l: 4,
  a: 5,
}

function splitOutsideQuotes(source: string, delimiter: string) {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const previous = index > 0 ? source[index - 1] : ''

    if (char === '"' && previous !== '\\') {
      inQuotes = !inQuotes
      current += char
      continue
    }

    if (!inQuotes && source.startsWith(delimiter, index)) {
      const trimmed = current.trim()
      if (trimmed) {
        result.push(trimmed)
      }
      current = ''
      index += delimiter.length - 1
      continue
    }

    current += char
  }

  const tail = current.trim()
  if (tail) {
    result.push(tail)
  }

  return result
}

function splitSpaceQuoteAware(source: string) {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const previous = index > 0 ? source[index - 1] : ''

    if (char === '"' && previous !== '\\') {
      inQuotes = !inQuotes
      current += char
      continue
    }

    if (!inQuotes && /\s/u.test(char)) {
      const trimmed = current.trim()
      if (trimmed) {
        result.push(trimmed)
      }
      current = ''
      continue
    }

    current += char
  }

  const tail = current.trim()
  if (tail) {
    result.push(tail)
  }

  return result
}

function stripOuterQuotes(value: string) {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\"/gu, '"')
  }

  return value
}

function truncate(value: string, maxLength = 88) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 3)}...`
}

function resolveGenderSwitch(value: string) {
  return value.replace(/\$\{([^{}]+)\}\$/gu, (_match, options) => {
    const variants = String(options).split('^')
    return variants[0] ?? ''
  })
}

function stripPortraitCommand(value: string) {
  let text = value.trim()
  let portraitIndex = 0

  while (true) {
    const match = /\$(\d+|[a-z])$/iu.exec(text)
    if (!match) {
      return { text, portraitIndex }
    }

    const command = match[1].toLowerCase()
    const resolvedPortraitIndex =
      /^\d+$/u.test(command) ? Number.parseInt(command, 10) : (DIALOGUE_PORTRAIT_ALIAS_INDEX[command] ?? null)

    if (resolvedPortraitIndex == null) {
      return { text, portraitIndex }
    }

    portraitIndex = resolvedPortraitIndex
    text = text.slice(0, match.index).trimEnd()
  }
}

function parseDialoguePage(raw: string, index: number): EventDialoguePage | null {
  const normalized = resolveGenderSwitch(raw).replace(/\\n/gu, '\n').trim()
  if (!normalized) {
    return null
  }

  const { text, portraitIndex } = stripPortraitCommand(normalized)
  return {
    id: `page:${index}`,
    text: text || normalized,
    portraitIndex,
  }
}

export function parseDialoguePages(raw: string): EventDialoguePage[] {
  const pages = raw
    .split(DIALOGUE_PAGE_BREAK_PATTERN)
    .map((page, index) => parseDialoguePage(page, index))
    .filter((page): page is EventDialoguePage => page !== null)

  if (pages.length > 0) {
    return pages
  }

  const fallback = parseDialoguePage(raw, 0)
  return fallback ? [fallback] : []
}

function summarizeDialoguePages(raw: string) {
  const pages = parseDialoguePages(raw)
  const firstText = pages[0]?.text ?? stripOuterQuotes(raw)
  return truncate(pages.length > 1 ? `${firstText} (+${pages.length - 1} more)` : firstText)
}

function formatActorMoveGroups(args: string[]) {
  const groups: string[] = []

  for (let index = 1; index + 3 < args.length; index += 4) {
    const actorName = args[index]
    const tileX = args[index + 1]
    const tileY = args[index + 2]
    const facingDirection = args[index + 3]

    if (!actorName || tileX == null || tileY == null || facingDirection == null) {
      break
    }

    groups.push(`${actorName} -> (${tileX}, ${tileY}) dir ${facingDirection}`)
  }

  return groups
}

export function splitEventPreconditions(rawKey: string) {
  return splitOutsideQuotes(rawKey, '/')
}

export function parseEventCommands(rawScript: string) {
  return splitOutsideQuotes(rawScript, '/')
}

export function parseEventSceneSetup(rawSegments: string[]): EventSceneSetup {
  const musicCue = rawSegments[0] ?? null
  const cameraInstruction = rawSegments[1] ?? null
  const characterInstruction = rawSegments[2] ?? null
  const actorTokens = characterInstruction ? splitSpaceQuoteAware(characterInstruction) : []
  const actors: EventSceneActor[] = []

  for (let index = 0; index + 3 < actorTokens.length; index += 4) {
    const actorName = actorTokens[index]
    const tileX = Number.parseInt(actorTokens[index + 1] ?? '', 10)
    const tileY = Number.parseInt(actorTokens[index + 2] ?? '', 10)
    const facingDirection = Number.parseInt(actorTokens[index + 3] ?? '', 10)

    if (!actorName || !Number.isFinite(tileX) || !Number.isFinite(tileY) || !Number.isFinite(facingDirection)) {
      continue
    }

    actors.push({
      id: `${actorName}:${index / 4}`,
      actorName,
      tileX,
      tileY,
      facingDirection,
    })
  }

  return {
    musicCue,
    cameraInstruction,
    characterInstruction,
    actors,
  }
}

function extractQuickQuestionChoices(raw: string): { prompt: string; choices: EventBranchChoice[] } {
  const rawPayload = raw.includes(' ') ? raw.slice(raw.indexOf(' ') + 1) : ''
  const sections = splitOutsideQuotes(rawPayload, '(break)')
  const labels = sections[0] ? splitOutsideQuotes(sections[0], '#') : []
  const prompt = stripOuterQuotes(labels[0] ?? '')

  return {
    prompt,
    choices: labels.slice(1).map((label, index) => ({
      id: `choice:${index}`,
      label: stripOuterQuotes(label),
      branchRawCommands: splitOutsideQuotes(sections[index + 1] ?? '', '\\'),
    })),
  }
}

function extractQuestionChoices(args: string[]) {
  const questionKey = args[1] ?? ''
  const labels = splitOutsideQuotes(stripOuterQuotes(args[2] ?? ''), '#')
  const forkMatch = /^fork(\d+)$/iu.exec(questionKey)

  return {
    questionKey,
    prompt: stripOuterQuotes(labels[0] ?? ''),
    forkChoiceIndex: forkMatch ? Number(forkMatch[1]) : null,
    choices: labels.slice(1).map((label, index) => ({
      id: `choice:${index}`,
      label: stripOuterQuotes(label),
      branchRawCommands: [],
    })),
  }
}

function getCommandKind(command: string): EventCommandKind {
  switch (command) {
    case 'speak':
      return 'dialogue'
    case 'message':
      return 'message'
    case 'question':
    case 'quickQuestion':
      return 'choice'
    case 'fork':
    case 'switchEvent':
      return 'branch'
    case 'pause':
      return 'timing'
    case 'end':
      return 'flow'
    default:
      return 'action'
  }
}

function parseCommandTitle(command: string, args: string[]) {
  switch (command) {
    case 'speak':
      return `Speak | ${args[1] ?? 'Unknown'}`
    case 'changePortrait':
      return `Change Portrait | ${args[1] ?? 'Unknown'}`
    case 'message':
      return 'Message'
    case 'move':
      return 'Move'
    case 'warp':
      return 'Warp'
    case 'faceDirection':
      return 'Face Direction'
    case 'showFrame':
      return 'Show Frame'
    case 'viewport':
      return 'Viewport'
    case 'pause':
      return `Pause | ${args[1] ?? '0'} ms`
    case 'question':
      return 'Question'
    case 'quickQuestion':
      return 'Quick Question'
    case 'fork':
      return `Fork | ${args[2] ?? args[1] ?? 'target'}`
    case 'switchEvent':
      return `Switch Event | ${args[1] ?? 'target'}`
    case 'end':
      return args[1] === 'dialogue' ? `End Dialogue | ${args[2] ?? 'Unknown'}` : 'End'
    default:
      return command
  }
}

function parseCommandDetail(command: string, args: string[]) {
  switch (command) {
    case 'speak':
      return summarizeDialoguePages(stripOuterQuotes(args[2] ?? ''))
    case 'changePortrait':
      return args[2] ? `${args[1] ?? 'actor'} -> ${args[2]}` : `${args[1] ?? 'actor'} -> default`
    case 'message':
      return truncate(stripOuterQuotes(args[1] ?? ''))
    case 'move':
      return truncate(formatActorMoveGroups(args).join(' | ') || args.slice(1).join(' '))
    case 'warp':
      return `${args[1] ?? 'actor'} -> (${args[2] ?? '?'}, ${args[3] ?? '?'})`
    case 'faceDirection':
      return `${args[1] ?? 'actor'} -> ${args[2] ?? '?'}`
    case 'showFrame': {
      const actorName = args.length === 2 ? 'farmer' : (args[1] ?? 'actor')
      const frame = args.length === 2 ? args[1] : (args[2] ?? '?')
      return `${actorName} -> frame ${frame}`
    }
    case 'viewport':
      return truncate(args.slice(1).join(' '))
    case 'pause':
      return `${args[1] ?? '0'} ms`
    case 'question': {
      const { prompt, choices, forkChoiceIndex } = extractQuestionChoices(args)
      const forkLabel = forkChoiceIndex == null ? '' : ` | fork ${forkChoiceIndex}`
      return `${truncate(prompt)} | ${choices.length} choices${forkLabel}`
    }
    case 'quickQuestion': {
      const { prompt, choices } = extractQuickQuestionChoices(args.join(' '))
      return `${truncate(prompt)} | ${choices.length} branches`
    }
    case 'fork':
      return args.length >= 3 ? `if ${args[1]} -> ${args[2]}` : `if event flag -> ${args[1] ?? ''}`
    case 'switchEvent':
      return args[1] ?? ''
    case 'end':
      return args[1] === 'dialogue' ? summarizeDialoguePages(stripOuterQuotes(args[3] ?? '')) : truncate(args.slice(1).join(' '))
    default:
      return truncate(args.slice(1).map(stripOuterQuotes).join(' '))
  }
}

export function parseEventCommand(raw: string, index: number): EventCommand {
  const args = splitSpaceQuoteAware(raw)
  const command = (args[0] ?? '').trim()
  const kind = getCommandKind(command)
  const eventCommand: EventCommand = {
    id: `cmd:${index}`,
    index,
    raw,
    command,
    args,
    kind,
    title: parseCommandTitle(command, args),
    detail: parseCommandDetail(command, args),
  }

  if (command === 'speak') {
    eventCommand.actorName = args[1]
    eventCommand.text = stripOuterQuotes(args[2] ?? '')
    eventCommand.dialoguePages = parseDialoguePages(eventCommand.text)
  } else if (command === 'message') {
    eventCommand.text = stripOuterQuotes(args[1] ?? '')
  } else if (command === 'pause') {
    eventCommand.delayMs = Number(args[1] ?? 0)
  } else if (command === 'changePortrait') {
    eventCommand.actorName = args[1]
    eventCommand.portraitSuffix = args[2] ?? null
  } else if (command === 'question') {
    const { questionKey, prompt, choices, forkChoiceIndex } = extractQuestionChoices(args)
    eventCommand.questionKey = questionKey
    eventCommand.prompt = prompt
    eventCommand.choices = choices
    eventCommand.forkChoiceIndex = forkChoiceIndex
  } else if (command === 'quickQuestion') {
    const { prompt, choices } = extractQuickQuestionChoices(raw)
    eventCommand.questionKey = 'quickQuestion'
    eventCommand.prompt = prompt
    eventCommand.choices = choices
  } else if (command === 'end' && args[1] === 'dialogue') {
    eventCommand.actorName = args[2]
    eventCommand.text = stripOuterQuotes(args[3] ?? '')
    eventCommand.dialoguePages = parseDialoguePages(eventCommand.text)
  } else if (command === 'fork') {
    eventCommand.targetConditionId = args.length >= 3 ? args[1] : null
    eventCommand.targetEventKey = args.length >= 3 ? args[2] : args[1]
    eventCommand.isTranslationKey = args[3] === 'true'
  } else if (command === 'switchEvent') {
    eventCommand.targetEventKey = args[1]
  }

  return eventCommand
}

export function parseEventAssetContent(
  content: string,
  asset: EventAssetSummary,
  locale: string | null,
  resolvedRelativePath: string,
): ParsedEventAsset {
  const data = JSON.parse(content) as Record<string, string>
  const events = Object.entries(data)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, rawScript]) => {
      const preconditions = splitEventPreconditions(key)
      const rawSegments = parseEventCommands(rawScript)

      return {
        key,
        eventId: preconditions[0] ?? key,
        preconditions,
        rawScript,
        rawSegments,
        scene: parseEventSceneSetup(rawSegments),
        commands: rawSegments.slice(3).map((rawCommand, index) => parseEventCommand(rawCommand, index)),
      } satisfies EventScript
    })
    .sort((left, right) => left.eventId.localeCompare(right.eventId, undefined, { numeric: true }))

  const eventIndex = Object.fromEntries(events.map((event) => [event.key, event]))

  return {
    asset,
    locale,
    resolvedRelativePath,
    events,
    eventIndex,
  }
}

type PositionedEvent = {
  firstNodeId: string | null
  nextY: number
}

export function buildEventGraph(rootEvent: EventScript | null, eventIndex: Record<string, EventScript>): EventGraph {
  if (!rootEvent) {
    return { nodes: [], edges: [] }
  }

  const nodes: EventGraphNode[] = []
  const edges: EventGraphEdge[] = []
  const placedEvents = new Map<string, PositionedEvent>()
  const activeKeys = new Set<string>()

  const addEdge = (source: string, target: string, label?: string, style: EventGraphEdge['style'] = 'default') => {
    edges.push({
      id: `${source}->${target}:${style}:${label ?? ''}`,
      source,
      target,
      label,
      style,
    })
  }

  const placeEvent = (event: EventScript, depth: number, startY: number): PositionedEvent => {
    const existing = placedEvents.get(event.key)
    if (existing) {
      return existing
    }

    const placeholder: PositionedEvent = { firstNodeId: null, nextY: startY }
    placedEvents.set(event.key, placeholder)
    activeKeys.add(event.key)

    const baseX = depth * 420
    let currentY = startY

    nodes.push({
      id: `${event.key}::header`,
      x: baseX,
      y: currentY - 96,
      kind: 'event',
      title: event.eventId,
      detail: truncate(event.preconditions.slice(1).join(' / ') || event.key),
      eventKey: event.key,
      synthetic: true,
    })

    let previousNodeId: string | null = null

    for (const command of event.commands) {
      const nodeId = `${event.key}::${command.index}`
      const nextRealNodeId =
        command.index + 1 < event.commands.length ? `${event.key}::${command.index + 1}` : null

      nodes.push({
        id: nodeId,
        x: baseX,
        y: currentY,
        kind: command.kind,
        title: command.title,
        detail: command.detail,
        eventKey: event.key,
        raw: command.raw,
      })

      if (!placeholder.firstNodeId) {
        placeholder.firstNodeId = nodeId
      }

      if (previousNodeId) {
        addEdge(previousNodeId, nodeId)
      }

      if (command.choices?.length) {
        const optionStartY = currentY - ((command.choices.length - 1) * 92) / 2

        command.choices.forEach((choice, choiceIndex) => {
          const optionId = `${nodeId}::option:${choiceIndex}`
          const optionY = optionStartY + choiceIndex * 92

          nodes.push({
            id: optionId,
            x: baseX + 220,
            y: optionY,
            kind: 'option',
            title: choice.label,
            detail:
              command.command === 'question' && command.forkChoiceIndex === choiceIndex
                ? 'sets event fork flag'
                : choice.branchRawCommands.length
                  ? truncate(choice.branchRawCommands.join(' / '))
                  : 'continue',
            eventKey: event.key,
            synthetic: true,
          })
          addEdge(nodeId, optionId, choice.label, 'choice')

          if (command.command === 'quickQuestion' && choice.branchRawCommands.length) {
            let previousBranchNodeId = optionId

            choice.branchRawCommands.forEach((rawBranchCommand, branchIndex) => {
              const parsedBranchCommand = parseEventCommand(rawBranchCommand, branchIndex)
              const branchNodeId = `${optionId}::${branchIndex}`

              nodes.push({
                id: branchNodeId,
                x: baseX + 440,
                y: optionY + branchIndex * 84,
                kind: parsedBranchCommand.kind,
                title: parsedBranchCommand.title,
                detail: parsedBranchCommand.detail,
                eventKey: event.key,
                raw: parsedBranchCommand.raw,
                synthetic: true,
              })
              addEdge(previousBranchNodeId, branchNodeId, undefined, 'choice')
              previousBranchNodeId = branchNodeId
            })

            if (nextRealNodeId) {
              addEdge(previousBranchNodeId, nextRealNodeId, 'resume')
            }
          } else if (nextRealNodeId) {
            addEdge(optionId, nextRealNodeId, 'resume')
          }
        })
      }

      if (command.targetEventKey && !command.isTranslationKey) {
        const targetEvent = eventIndex[command.targetEventKey]
        if (targetEvent && !activeKeys.has(targetEvent.key)) {
          const targetPlacement = placeEvent(targetEvent, depth + 1, currentY)
          if (targetPlacement.firstNodeId) {
            addEdge(
              nodeId,
              targetPlacement.firstNodeId,
              command.targetEventKey,
              command.command === 'switchEvent' ? 'switch' : 'branch',
            )
          }
        } else if (targetEvent) {
          const targetPlacement = placedEvents.get(targetEvent.key)
          if (targetPlacement?.firstNodeId) {
            addEdge(
              nodeId,
              targetPlacement.firstNodeId,
              command.targetEventKey,
              command.command === 'switchEvent' ? 'switch' : 'branch',
            )
          }
        }
      }

      previousNodeId = command.command === 'switchEvent' ? null : nodeId
      currentY += 140
    }

    activeKeys.delete(event.key)
    placeholder.nextY = currentY
    return placeholder
  }

  placeEvent(rootEvent, 0, 120)
  return { nodes, edges }
}
