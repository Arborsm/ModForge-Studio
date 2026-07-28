/**
 * Visual field controls: reference pickers, the colour picker, the season chip
 * row and the localized-text field.
 *
 * These are the controls that need more than an input element — a browsable
 * dialog, a swatch, a resolved-text preview. They keep the same contract as the
 * primitives in `controls.tsx`: one commit callback, and committing `undefined`
 * removes the key so the game default applies.
 */

import { useMemo, useState } from 'react'
import { BookText, Eraser, Search } from 'lucide-react'
import { useLocalizedTextResolution } from '@entities/game/api'
import { useAssetAuthoringCopy, useLocale } from '@locales/provider'
import {
  COLOR_SWATCH_PRESETS,
  colorFromNameOrHex,
  colorNameFor,
  colorToCss,
  colorToCssHex,
  formatColorValue,
  parseColorValue,
  prefersLightForeground,
  type ColorRgb,
} from '../model/colorValue'
import { resourceOptionsFor, type AssetResources, type ResourceRefKind } from '../model/resources'
import { FieldGroup } from './controls'
import { GameTextLibraryDialog } from './GameTextLibraryDialog'
import { ResourcePickerDialog } from './ResourcePickerDialog'

type ResourcePickerFieldProps = {
  label: string
  hint?: string
  wide?: boolean
  kind: ResourceRefKind
  value: unknown
  resources: AssetResources
  onCommit: (next: string | undefined) => void
}

/**
 * Reference field: free text plus a browsable picker over the game's registry.
 *
 * The text input stays authoritative — an id the registry does not know (a mod's
 * own NPC, a texture this pack adds) is typed directly and never rejected. The
 * picker is an accelerator over what the registry does know, and an unknown id
 * is flagged as a hint rather than an error.
 */
export function ResourcePickerField({ label, hint, wide, kind, value, resources, onCommit }: ResourcePickerFieldProps) {
  const copy = useAssetAuthoringCopy().picker
  const [open, setOpen] = useState(false)
  const text = typeof value === 'string' ? value : ''
  const options = useMemo(() => resourceOptionsFor(resources, kind), [resources, kind])
  const unresolved = text !== '' && options.length > 0 && !options.some((option) => option.value === text)

  return (
    <FieldGroup label={label} hint={hint} wide={wide}>
      <div className="asset-field-picker-row">
        <input
          type="text"
          className="control-input"
          value={text}
          aria-label={label}
          onChange={(event) => onCommit(event.target.value === '' ? undefined : event.target.value)}
        />
        <button
          type="button"
          className="control-button"
          aria-label={copy.browseAction}
          title={copy.browseAction}
          disabled={options.length === 0}
          onClick={() => setOpen(true)}
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
      {unresolved ? <span className="asset-field-hint">{copy.unresolvedHint}</span> : null}
      <ResourcePickerDialog
        open={open}
        kindLabel={copy.kindLabels[kind]}
        value={text}
        options={options}
        onClose={() => setOpen(false)}
        onSelect={(next) => onCommit(next === '' ? undefined : next)}
      />
    </FieldGroup>
  )
}

type ColorFieldProps = {
  label: string
  hint?: string
  wide?: boolean
  value: unknown
  onCommit: (next: string | undefined) => void
}

const CHANNEL_KEYS = ['r', 'g', 'b'] as const

/** Swatch shown by the native picker while no parseable colour is stored. */
const SWATCH_FALLBACK: ColorRgb = { r: 255, g: 255, b: 255, a: 255 }

/**
 * Visual colour control for the game's colour strings.
 *
 * The stored spelling is preserved: editing `DarkOrchid` keeps writing a colour
 * name while one still matches, editing `34 139 34` keeps writing
 * space-separated channels. A value in a spelling the game does not read stays
 * editable as raw text and is flagged rather than silently overwritten.
 */
export function ColorField({ label, hint, wide, value, onCommit }: ColorFieldProps) {
  const copy = useAssetAuthoringCopy().color
  const text = typeof value === 'string' ? value : ''
  const parsed = parseColorValue(text)
  const format = parsed?.format ?? 'space'
  const color = parsed?.color ?? null
  const invalid = text.trim() !== '' && parsed === null
  const namedAs = color ? (parsed?.name ?? colorNameFor(color)) : null

  function commitColor(next: ColorRgb) {
    onCommit(formatColorValue(next, format))
  }

  return (
    <FieldGroup label={label} hint={hint} wide={wide}>
      <div className="asset-field-color">
        <div className="asset-field-color-head">
          <input
            type="color"
            className="asset-field-color-swatch"
            aria-label={copy.swatchLabel}
            value={colorToCssHex(color ?? SWATCH_FALLBACK)}
            onChange={(event) => {
              const next = colorFromNameOrHex(event.target.value)
              if (next) {
                commitColor({ ...next, a: color?.a ?? 255 })
              }
            }}
          />
          <input
            type="text"
            className="control-input asset-field-color-text"
            value={text}
            aria-label={copy.hexLabel}
            aria-invalid={invalid || undefined}
            spellCheck={false}
            onChange={(event) => onCommit(event.target.value === '' ? undefined : event.target.value)}
          />
          <button
            type="button"
            className="control-button"
            aria-label={copy.clearAction}
            title={copy.clearAction}
            disabled={text === ''}
            onClick={() => onCommit(undefined)}
          >
            <Eraser className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        {color ? (
          <div className="asset-field-color-channels">
            {CHANNEL_KEYS.map((channel) => (
              <label key={channel} className="asset-field-color-channel">
                <span>{copy.channelLabels[channel]}</span>
                <input
                  type="number"
                  className="control-input"
                  min={0}
                  max={255}
                  step={1}
                  value={color[channel]}
                  onChange={(event) => {
                    const raw = Number(event.target.value)
                    if (Number.isFinite(raw)) {
                      commitColor({ ...color, [channel]: Math.min(255, Math.max(0, Math.round(raw))) })
                    }
                  }}
                />
              </label>
            ))}
          </div>
        ) : null}

        <div className="asset-field-color-presets" role="group" aria-label={copy.presetsLabel}>
          {COLOR_SWATCH_PRESETS.map((preset) => {
            const presetColor = colorFromNameOrHex(preset)
            if (!presetColor) {
              return null
            }
            const selected = color !== null && color.r === presetColor.r && color.g === presetColor.g && color.b === presetColor.b
            return (
              <button
                key={preset}
                type="button"
                className="asset-field-color-preset"
                style={{ background: colorToCss(presetColor) }}
                data-selected={selected || undefined}
                data-light={prefersLightForeground(presetColor) || undefined}
                aria-label={preset}
                aria-pressed={selected}
                title={preset}
                onClick={() => onCommit(formatColorValue(presetColor, format))}
              />
            )
          })}
        </div>

        {invalid ? <span className="asset-field-error">{copy.invalid}</span> : null}
        {namedAs ? <span className="asset-field-hint">{copy.namedValueHint(namedAs)}</span> : null}
      </div>
    </FieldGroup>
  )
}

export type SeasonOption = { value: string; label: string }

type SeasonFieldProps = {
  label: string
  hint?: string
  wide?: boolean
  value: unknown
  options: readonly SeasonOption[]
  onCommit: (next: string | undefined) => void
}

/**
 * Season selector rendered as a chip row.
 *
 * Seasons are a closed four-value set with a strong visual identity, so chips
 * read faster than a select and show the current choice without opening
 * anything. A stored value outside the set is surfaced as an extra chip instead
 * of being dropped, since mods do ship custom season strings.
 */
export function SeasonField({ label, hint, wide, value, options, onCommit }: SeasonFieldProps) {
  const copy = useAssetAuthoringCopy()
  const raw = typeof value === 'string' ? value : ''
  const matched = options.find((option) => option.value.toLowerCase() === raw.toLowerCase()) ?? null
  const isUnknown = raw !== '' && matched === null

  return (
    <FieldGroup label={label} hint={hint} wide={wide}>
      <div className="asset-field-season" role="group" aria-label={copy.season.legend}>
        <button
          type="button"
          className="asset-field-season-chip"
          data-selected={raw === '' || undefined}
          aria-pressed={raw === ''}
          onClick={() => onCommit(undefined)}
        >
          {copy.season.anyOption}
        </button>
        {options.map((option) => {
          const selected = matched?.value === option.value
          return (
            <button
              key={option.value}
              type="button"
              className="asset-field-season-chip"
              data-season={option.value.toLowerCase()}
              data-selected={selected || undefined}
              aria-pressed={selected}
              onClick={() => onCommit(selected ? undefined : option.value)}
            >
              {option.label}
            </button>
          )
        })}
        {isUnknown ? (
          <span className="asset-field-season-chip is-unknown" data-selected="true">
            {copy.chrome.unknownValue(raw)}
          </span>
        ) : null}
      </div>
    </FieldGroup>
  )
}

type LocalizedTextFieldProps = {
  label: string
  hint?: string
  wide?: boolean
  multiline?: boolean
  value: unknown
  resources: AssetResources
  onCommit: (next: string | undefined) => void
}

/**
 * Text field for a value the game may read as a `[LocalizedText ...]` reference.
 *
 * Two things a plain input cannot do: show what a reference token actually says
 * in the current language, and let the author reuse an existing game string
 * instead of inventing an untranslated one. Both are additive — the raw value
 * stays editable and is never rewritten without an explicit action.
 */
export function LocalizedTextField({ label, hint, wide, multiline, value, resources, onCommit }: LocalizedTextFieldProps) {
  const copy = useAssetAuthoringCopy()
  const uiLocale = useLocale()
  const [libraryOpen, setLibraryOpen] = useState(false)
  const text = typeof value === 'string' ? value : ''
  const rootPath = resources.gameRootPath ?? null
  const locale = resources.locale ?? uiLocale
  const resolution = useLocalizedTextResolution(rootPath, locale, text)

  function commitFromLibrary(next: string) {
    onCommit(next === '' ? undefined : next)
    setLibraryOpen(false)
  }

  return (
    <FieldGroup label={label} hint={hint} wide={wide}>
      <div className="asset-field-localized">
        <div className="asset-field-picker-row">
          {multiline ? (
            <textarea
              className="control-input asset-field-textarea"
              value={text}
              aria-label={label}
              onChange={(event) => onCommit(event.target.value === '' ? undefined : event.target.value)}
            />
          ) : (
            <input
              type="text"
              className="control-input"
              value={text}
              aria-label={label}
              onChange={(event) => onCommit(event.target.value === '' ? undefined : event.target.value)}
            />
          )}
          {rootPath !== null ? (
            <button
              type="button"
              className="control-button"
              aria-label={copy.textLibrary.openAction}
              title={copy.textLibrary.openAction}
              onClick={() => setLibraryOpen(true)}
            >
              <BookText className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {resolution?.isReference ? (
          <div className="asset-field-localized-preview">
            {resolution.resolved ? (
              <>
                <span className="asset-field-localized-text">{copy.chrome.localizedResolvedHint(resolution.text)}</span>
                <button type="button" className="asset-field-localized-action" onClick={() => onCommit(resolution.text)}>
                  {copy.chrome.localizedRewriteAction}
                </button>
              </>
            ) : (
              <span className="asset-field-error">{copy.chrome.localizedTableFailed}</span>
            )}
          </div>
        ) : null}

        {rootPath !== null ? (
          <GameTextLibraryDialog
            open={libraryOpen}
            gameRootPath={rootPath}
            locale={locale}
            onClose={() => setLibraryOpen(false)}
            onInsertToken={commitFromLibrary}
            onInsertText={commitFromLibrary}
          />
        ) : null}
      </div>
    </FieldGroup>
  )
}
