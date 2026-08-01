import { useId, useState } from 'react'
import { ChevronDown, Plus, Trash2, X } from 'lucide-react'
import { cx } from '@shared/lib/helper'
import { useEditorCopy } from '@locales/provider'
import {
  CP_BUILTIN_TOKENS,
  findCpToken,
  parseWhenValueAlternatives,
  toggleWhenValueAlternative,
  type CpTokenGroup,
  type WhenConditionRow,
} from '@entities/content-patcher'

type WhenConditionEditorProps = {
  rows: WhenConditionRow[]
  onChange: (rows: WhenConditionRow[]) => void
  /** Project token names that are also valid condition keys (config keys, dynamic tokens, aliases). */
  extraTokenNames?: readonly string[]
  /** Hide field-reference tokens, which only work inside a patch block (e.g. editing dynamic tokens). */
  excludePatchBlockOnly?: boolean
}

const inputClass =
  'w-full rounded-md border border-(--border-color) bg-(--bg-app) px-2 py-1.5 text-xs text-(--text-primary) outline-none focus:border-(--accent)'

/** Catalog order for the "more tokens" quick-add picker. */
const PRESET_GROUP_ORDER: readonly CpTokenGroup[] = [
  'dateWeather',
  'player',
  'relationship',
  'world',
  'number',
  'string',
  'metadata',
  'fieldReference',
  'specialized',
  'random',
]

/**
 * Structured `When` editor: each row is a token (with catalog completion and
 * an input-argument field when the token takes one), its expected values
 * (rendered as toggle chips when the docs enumerate a domain, otherwise a
 * plain text field), and an inline hint when the token is not a known built-in
 * or project token. Quick-add presets append a pre-filled row for the most
 * common conditions; the full token catalog stays available under "More".
 */
export function WhenConditionEditor({ rows, onChange, extraTokenNames = [], excludePatchBlockOnly = false }: WhenConditionEditorProps) {
  const copy = useEditorCopy().studioDesk.configSchemaDialog
  const datalistId = useId()
  const [pendingFocusIndex, setPendingFocusIndex] = useState<number | null>(null)
  const [openMenu, setOpenMenu] = useState<'more' | 'config' | null>(null)

  const catalogTokens = excludePatchBlockOnly ? CP_BUILTIN_TOKENS.filter((token) => token.patchBlockOnly !== true) : CP_BUILTIN_TOKENS
  const extras = extraTokenNames.filter((name) => findCpToken(name) === undefined)

  function patchRow(index: number, updates: Partial<WhenConditionRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...updates } : row)))
  }

  function isKnown(token: string): boolean {
    if (token.trim() === '') return true
    return findCpToken(token) !== undefined || extraTokenNames.some((name) => name.toLowerCase() === token.trim().toLowerCase())
  }

  function appendPreset(seed: Partial<WhenConditionRow>) {
    const index = rows.length
    onChange([...rows, { token: '', value: '', ...seed }])
    setPendingFocusIndex(index)
    setOpenMenu(null)
  }

  return (
    <div className="space-y-2">
      <datalist id={datalistId}>
        {catalogTokens.map((token) => (
          <option key={token.name} value={token.name} />
        ))}
        {extras.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {rows.map((row, index) => {
        const definition = findCpToken(row.token)
        const unknown = !isKnown(row.token)
        const showInput = definition?.takesInput === true || (row.input !== undefined && row.input !== '')
        const hasDomain = definition?.values !== undefined && !unknown
        const isHasMod = row.token.trim().toLowerCase() === 'hasmod'
        return (
          <div key={index} className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="text"
                list={datalistId}
                placeholder={copy.whenKeyPlaceholder}
                className={`flex-1 ${inputClass}`}
                value={row.token}
                onChange={(e) => patchRow(index, { token: e.target.value })}
              />
              {showInput ? (
                <input
                  type="text"
                  placeholder={copy.tokenInputPlaceholder}
                  className={`w-32 ${inputClass}`}
                  value={row.input ?? ''}
                  onChange={(e) => patchRow(index, { input: e.target.value })}
                />
              ) : null}
              {!hasDomain ? (
                <input
                  type="text"
                  placeholder={isHasMod ? copy.whenHasModValuePlaceholder : copy.whenValuePlaceholder}
                  className={`flex-1 ${inputClass}`}
                  value={row.value}
                  autoFocus={index === pendingFocusIndex}
                  onChange={(e) => patchRow(index, { value: e.target.value })}
                />
              ) : null}
              <button
                type="button"
                className="icon-button h-7 w-7 shrink-0 text-(--danger)"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {hasDomain && definition?.values !== undefined ? (
              <ChipValueField
                value={row.value}
                domain={definition.values}
                placeholder={copy.whenCustomValuePlaceholder}
                addLabel={copy.whenCustomValueAdd}
                focusRequested={index === pendingFocusIndex}
                onChange={(value) => patchRow(index, { value })}
              />
            ) : null}
            {unknown ? <p className="text-[11px] text-(--text-secondary)">{copy.unknownTokenHint(row.token)}</p> : null}
          </div>
        )
      })}

      {/* Quick-add presets: append a pre-filled row without touching the manual add flow. */}
      <div className="when-preset-bar">
        <span className="when-preset-label">{copy.whenPresetsLabel}</span>
        <button type="button" className="when-preset-button" onClick={() => appendPreset({ token: 'Season' })}>
          {copy.whenPresetSeason}
        </button>
        <button type="button" className="when-preset-button" onClick={() => appendPreset({ token: 'Weather' })}>
          {copy.whenPresetWeather}
        </button>
        <button type="button" className="when-preset-button" onClick={() => appendPreset({ token: 'DayOfWeek' })}>
          {copy.whenPresetDayOfWeek}
        </button>
        <button type="button" className="when-preset-button" onClick={() => appendPreset({ token: 'HasMod' })}>
          {copy.whenPresetHasMod}
        </button>
        {extraTokenNames.length > 0 ? (
          extraTokenNames.length === 1 ? (
            <button type="button" className="when-preset-button" onClick={() => appendPreset({ token: extraTokenNames[0], value: 'true' })}>
              {copy.whenPresetConfig}
            </button>
          ) : (
            <span className="when-preset-menu">
              <button
                type="button"
                className={cx('when-preset-button', openMenu === 'config' && 'is-open')}
                aria-expanded={openMenu === 'config'}
                onClick={() => setOpenMenu(openMenu === 'config' ? null : 'config')}
              >
                {copy.whenPresetConfig}
                <ChevronDown className={cx('h-3 w-3', openMenu === 'config' && 'rotate-180')} />
              </button>
              {openMenu === 'config' ? (
                <div className="when-preset-catalog">
                  {extraTokenNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="when-preset-token"
                      onClick={() => appendPreset({ token: name, value: 'true' })}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              ) : null}
            </span>
          )
        ) : null}
        <span className="when-preset-menu">
          <button
            type="button"
            className={cx('when-preset-button', openMenu === 'more' && 'is-open')}
            aria-expanded={openMenu === 'more'}
            onClick={() => setOpenMenu(openMenu === 'more' ? null : 'more')}
          >
            {copy.whenPresetMore}
            <ChevronDown className={cx('h-3 w-3', openMenu === 'more' && 'rotate-180')} />
          </button>
          {openMenu === 'more' ? (
            <div className="when-preset-catalog">
              {PRESET_GROUP_ORDER.map((group) => {
                const groupTokens = catalogTokens.filter((token) => token.group === group)
                return groupTokens.length > 0 ? (
                  <div key={group} className="when-preset-group">
                    <div className="when-preset-group-title">{copy.whenPresetGroups[group]}</div>
                    <div className="when-preset-token-grid">
                      {groupTokens.map((token) => (
                        <button
                          key={token.name}
                          type="button"
                          className="when-preset-token"
                          onClick={() => appendPreset({ token: token.name })}
                        >
                          {token.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null
              })}
            </div>
          ) : null}
        </span>
      </div>

      <button
        type="button"
        className="flex items-center gap-1 text-xs text-(--accent) hover:underline"
        onClick={() => onChange([...rows, { token: '', value: '' }])}
      >
        <Plus className="h-3 w-3" /> {copy.addCondition}
      </button>
    </div>
  )
}

type ChipValueFieldProps = {
  value: string
  domain: readonly string[]
  placeholder: string
  addLabel: string
  focusRequested: boolean
  onChange: (value: string) => void
}

/**
 * Value editor for tokens with an enumerable domain: one toggle chip per domain
 * value, chips for custom values already present in the row (click to remove),
 * and a small input to add out-of-domain values or `{{Token}}` interpolation.
 */
function ChipValueField({ value, domain, placeholder, addLabel, focusRequested, onChange }: ChipValueFieldProps) {
  const [draft, setDraft] = useState('')
  const alternatives = parseWhenValueAlternatives(value)
  const selectedKeys = new Set(alternatives.map((alternative) => alternative.toLowerCase()))
  const domainKeys = new Set(domain.map((entry) => entry.toLowerCase()))
  const seen = new Set<string>()
  const customValues = alternatives.filter((alternative) => {
    const key = alternative.toLowerCase()
    if (domainKeys.has(key) || seen.has(key)) return false
    seen.add(key)
    return true
  })

  function toggle(alternative: string) {
    onChange(toggleWhenValueAlternative(value, alternative, domain))
  }

  function addCustom() {
    const candidate = draft.trim()
    if (candidate === '') return
    if (!selectedKeys.has(candidate.toLowerCase())) {
      onChange(toggleWhenValueAlternative(value, candidate, domain))
    }
    setDraft('')
  }

  return (
    <div className="when-value-chips">
      {domain.map((domainValue) => {
        const selected = selectedKeys.has(domainValue.toLowerCase())
        return (
          <button
            key={domainValue}
            type="button"
            className={cx('when-value-chip', selected && 'is-selected')}
            aria-pressed={selected}
            onClick={() => toggle(domainValue)}
          >
            {domainValue}
          </button>
        )
      })}
      {customValues.map((customValue) => (
        <button
          key={customValue}
          type="button"
          className="when-value-chip is-selected is-custom"
          aria-pressed="true"
          onClick={() => toggle(customValue)}
        >
          {customValue}
          <X className="h-3 w-3" aria-hidden />
        </button>
      ))}
      <input
        type="text"
        className="when-value-custom-input"
        value={draft}
        autoFocus={focusRequested}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            addCustom()
          }
        }}
      />
      <button type="button" className="icon-button h-6 w-6 shrink-0" title={addLabel} aria-label={addLabel} onClick={addCustom}>
        <Plus className="h-3 w-3" />
      </button>
    </div>
  )
}
