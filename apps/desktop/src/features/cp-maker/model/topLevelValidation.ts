/**
 * Validation for the `content.json` top-level triplets: DynamicTokens,
 * CustomLocations and AliasTokenNames. These fail silently in-game (a token
 * that never resolves, a location that does not exist), so the workbench
 * flags them before export.
 */

import type { AssetIssue } from '@entities/asset-schema'
import { findCpToken } from '@entities/content-patcher'
import type { CpMakerDraft } from './types'

/** Collects findings for the draft's top-level content.json structures. */
export function collectTopLevelIssues(draft: CpMakerDraft): AssetIssue[] {
  const issues: AssetIssue[] = []
  const configKeys = new Set(draft.configSchema.map((entry) => entry.key.trim().toLowerCase()).filter((key) => key !== ''))

  const seenTokenNames = new Set<string>()
  for (const [index, token] of draft.dynamicTokens.entries()) {
    const name = token.name.trim()
    if (name === '') {
      issues.push({
        severity: 'error',
        code: 'dynamicTokenNameMissing',
        messageKey: 'topLevel.dynamicTokenNameMissing',
        path: ['dynamicTokens', index],
      })
      continue
    }
    const dedupeKey = name.toLowerCase()
    if (seenTokenNames.has(dedupeKey)) {
      issues.push({
        severity: 'warning',
        code: 'dynamicTokenDuplicate',
        messageKey: 'topLevel.dynamicTokenDuplicate',
        path: ['dynamicTokens', index, 'name'],
        params: { name },
      })
    }
    seenTokenNames.add(dedupeKey)
    // CP ignores dynamic tokens that shadow a global or config token name.
    if (findCpToken(name) !== undefined) {
      issues.push({
        severity: 'warning',
        code: 'dynamicTokenShadowsBuiltin',
        messageKey: 'topLevel.dynamicTokenShadowsBuiltin',
        path: ['dynamicTokens', index, 'name'],
        params: { name },
      })
    }
    if (configKeys.has(dedupeKey)) {
      issues.push({
        severity: 'warning',
        code: 'dynamicTokenShadowsConfig',
        messageKey: 'topLevel.dynamicTokenShadowsConfig',
        path: ['dynamicTokens', index, 'name'],
        params: { name },
      })
    }
  }

  for (const [index, location] of draft.customLocations.entries()) {
    const name = location.name.trim()
    if (name === '') {
      issues.push({
        severity: 'error',
        code: 'customLocationNameMissing',
        messageKey: 'topLevel.customLocationNameMissing',
        path: ['customLocations', index],
      })
      continue
    }
    if ((location.fromMapFile ?? '').trim() === '') {
      issues.push({
        severity: 'warning',
        code: 'customLocationMapMissing',
        messageKey: 'topLevel.customLocationMapMissing',
        path: ['customLocations', index, 'fromMapFile'],
        params: { name },
      })
    }
  }

  const aliasKeys = new Set(Object.keys(draft.aliasTokenNames).map((alias) => alias.trim().toLowerCase()))
  for (const [alias, target] of Object.entries(draft.aliasTokenNames)) {
    if (alias.trim() === '' || target.trim() === '') {
      issues.push({
        severity: 'error',
        code: 'aliasTokenEmpty',
        messageKey: 'topLevel.aliasEmpty',
        path: ['aliasTokenNames', alias],
      })
      continue
    }
    if (alias.trim().toLowerCase() === target.trim().toLowerCase()) {
      issues.push({
        severity: 'warning',
        code: 'aliasTokenSelfReference',
        messageKey: 'topLevel.aliasSelfReference',
        path: ['aliasTokenNames', alias],
        params: { alias },
      })
      continue
    }
    // The alias target must resolve to a token that actually exists.
    const targetKey = target.trim().toLowerCase()
    const targetExists =
      findCpToken(target) !== undefined || configKeys.has(targetKey) || seenTokenNames.has(targetKey) || aliasKeys.has(targetKey)
    if (!targetExists) {
      issues.push({
        severity: 'warning',
        code: 'aliasTokenUnknownTarget',
        messageKey: 'topLevel.aliasTokenUnknownTarget',
        path: ['aliasTokenNames', alias],
        params: { alias, target },
      })
    }
  }

  return issues
}
