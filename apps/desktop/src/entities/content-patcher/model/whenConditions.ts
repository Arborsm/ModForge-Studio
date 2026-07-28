/**
 * Content Patcher domain knowledge: token parsing shared by the condition
 * editor and validation. The catalog of built-in tokens lives in
 * `./tokens.ts`; this module only knows the *syntax* of token references.
 *
 * Syntax notes (CP author guide):
 * - Plain token reference: `{{TokenName}}`; with input: `{{TokenName:Input}}`.
 * - A `When` condition key is a token name without braces (`Season`), or the
 *   bare input form (`Relationship:Abigail`; nested tokens keep their braces,
 *   e.g. `HasValue:{{Spouse}}`). The braced form `{{Token:Input}}` is accepted
 *   on parse for compatibility but never emitted.
 * - Condition values are comma-separated alternative values (OR), matched
 *   case-insensitively against the token's current value.
 */

export type WhenConditionRow = {
  /** Token name as written (no braces), e.g. `Season` or `Relationship`. */
  token: string
  /** Input argument for tokens that take one, e.g. `Abigail`. */
  input?: string
  /** Expected value(s), comma-separated. */
  value: string
}

const BRACED_KEY_PATTERN = /^\{\{\s*([^{}:\s]+)\s*:\s*([^{}]+?)\s*\}\}$/
const BARE_KEY_PATTERN = /^([A-Za-z][A-Za-z0-9]*)\s*(?::\s*(.+?)\s*)?$/

/**
 * Parses one `When` condition key. Bare token names (`Season`), the bare input
 * form (`Relationship:Abigail`) and the legacy braced form
 * (`{{Relationship:Abigail}}`) parse; anything else returns null and the
 * caller should keep the raw key editable instead of dropping it.
 */
export function parseWhenKey(key: string): { token: string; input?: string } | null {
  const trimmed = key.trim()
  const braced = trimmed.match(BRACED_KEY_PATTERN)
  if (braced !== null && braced[1] !== undefined && braced[2] !== undefined) {
    return { token: braced[1], input: braced[2].trim() }
  }
  const bare = trimmed.match(BARE_KEY_PATTERN)
  if (bare !== null && bare[1] !== undefined) {
    const input = bare[2]?.trim()
    return input === undefined || input === '' ? { token: bare[1] } : { token: bare[1], input }
  }
  return null
}

/** Serializes a token + optional input into the canonical `When` key form. */
export function formatWhenKey(token: string, input?: string): string {
  const trimmedToken = token.trim()
  const trimmedInput = input?.trim() ?? ''
  if (trimmedInput === '') {
    return trimmedToken
  }
  return `${trimmedToken}:${trimmedInput}`
}

/** Splits a `When` value into its comma-separated alternatives. */
export function parseWhenValueAlternatives(value: string): string[] {
  return value
    .split(',')
    .map((alternative) => alternative.trim())
    .filter((alternative) => alternative !== '')
}

/**
 * Parses a persisted `When` record into editor rows. Values normalize to
 * strings the way the export does; keys that do not parse keep their raw form
 * in `token` so a hand-written exotic key is never silently rewritten.
 */
export function parseWhenConditions(when: Record<string, unknown> | undefined): WhenConditionRow[] {
  if (when === undefined) return []
  return Object.entries(when).map(([key, value]) => {
    const parsed = parseWhenKey(key)
    return {
      token: parsed?.token ?? key,
      input: parsed?.input,
      value: typeof value === 'string' ? value : JSON.stringify(value),
    }
  })
}

/**
 * Serializes editor rows back into a `When` record, dropping rows without a
 * token. Returns undefined when nothing remains, so the patch omits the key.
 */
export function serializeWhenConditions(rows: readonly WhenConditionRow[]): Record<string, string> | undefined {
  const result: Record<string, string> = {}
  for (const row of rows) {
    const key = formatWhenKey(row.token, row.input)
    if (key === '') continue
    result[key] = row.value
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/** Extracts `{{Token}}` / `{{Token:Input}}` references from an interpolated string. */
export function extractTokenReferences(text: string): Array<{ token: string; input?: string }> {
  const references: Array<{ token: string; input?: string }> = []
  for (const match of text.matchAll(/\{\{\s*([^{}:\s]+)\s*(?::\s*([^{}]+?)\s*)?\}\}/g)) {
    const token = match[1]
    if (token === undefined) continue
    const input = match[2]?.trim()
    references.push(input === undefined || input === '' ? { token } : { token, input })
  }
  return references
}
