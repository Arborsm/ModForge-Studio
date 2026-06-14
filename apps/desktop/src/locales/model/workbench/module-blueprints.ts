import type { CoreWorkspaceMode, ModuleBlueprint } from '../core'

export type ModuleBlueprintsCopy = Record<Exclude<CoreWorkspaceMode, 'map' | 'mod-i18n'>, ModuleBlueprint>
