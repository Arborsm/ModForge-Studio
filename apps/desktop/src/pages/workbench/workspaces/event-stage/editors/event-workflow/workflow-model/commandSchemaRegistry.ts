/**
 * @file Command schema registry: the single source of truth for all command UIs.
 */

import type { CommandSchema, CommandCategory } from './commandSchema'
import { animationCommandSchemas } from './command-schemas/animation'
import { audioCommandSchemas } from './command-schemas/audio'
import { dialogueCommandSchemas } from './command-schemas/dialogue'
import { itemCommandSchemas } from './command-schemas/item'
import { logicCommandSchemas } from './command-schemas/logic'
import { mailQuestCommandSchemas } from './command-schemas/mailQuest'
import { movementCommandSchemas } from './command-schemas/movement'
import { otherCommandSchemas } from './command-schemas/other'
import { sceneCommandSchemas } from './command-schemas/scene'
import { visualCommandSchemas } from './command-schemas/visual'

const commandSchemas = [
  ...dialogueCommandSchemas,
  ...movementCommandSchemas,
  ...visualCommandSchemas,
  ...audioCommandSchemas,
  ...logicCommandSchemas,
  ...sceneCommandSchemas,
  ...itemCommandSchemas,
  ...mailQuestCommandSchemas,
  ...animationCommandSchemas,
  ...otherCommandSchemas,
] satisfies CommandSchema[]

const registry = new Map(commandSchemas.map((schema) => [schema.key, schema]))

export function getSchema(key: string): CommandSchema | null {
  return registry.get(key) ?? null
}

export function hasSchema(key: string): boolean {
  return registry.has(key)
}

export function getAllSchemas(): CommandSchema[] {
  return Array.from(registry.values())
}

export function getSchemasByCategory(category: CommandCategory): CommandSchema[] {
  return Array.from(registry.values()).filter((s) => s.category === category)
}

export function searchSchemas(query: string): CommandSchema[] {
  const q = query.toLowerCase()
  return Array.from(registry.values()).filter((s) => s.key.toLowerCase().includes(q))
}

export function getKnownCommandKeys(): string[] {
  return Array.from(registry.keys())
}
