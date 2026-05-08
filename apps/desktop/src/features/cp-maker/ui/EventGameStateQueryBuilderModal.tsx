import {
  Clock,
  Code2,
  Compass,
  Database,
  Layers3,
  PackageSearch,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { cx } from '@shared/lib/cx'
import type { EditorCopy } from '@locales'
import {
  createDefaultGameStateQueryClause,
  GAME_STATE_QUERY_DEFINITIONS,
  parseGameStateQueryClauses,
  serializeGameStateQueryClause,
  serializeGameStateQueryClauses,
  type GameStateQueryCategory,
  type GameStateQueryClauseDraft,
  type GameStateQueryDefinition,
  type GameStateQueryFieldDefinition,
} from '@entities/event'
import { formatGameStateQueryForHub, type GameStateQueryKey } from '@entities/event'

type HubCopy = EditorCopy['studioDesk']['eventPatchHub']
type GameStateQueryBuilderCopy = HubCopy['conditionBuilder']['gameStateQueryBuilder']
type ActiveCategory = GameStateQueryCategory | 'all'

export interface GameStateQueryBuilderResult {
  query: string
  natural: string
}

interface EventGameStateQueryBuilderModalProps {
  copy: GameStateQueryBuilderCopy
  hubCopy: HubCopy
  initialQuery?: string
  onApply: (result: GameStateQueryBuilderResult) => void
  onCancel: () => void
}

const CATEGORY_IDS: ActiveCategory[] = ['world', 'location', 'player', 'item', 'system', 'all']
const CATEGORY_ICONS = {
  all: Database,
  logic: Layers3,
  world: Clock,
  location: Compass,
  player: UserRound,
  item: PackageSearch,
  system: Code2,
} satisfies Record<ActiveCategory, typeof Clock>

const DEFINITION_BY_KEY = new Map(GAME_STATE_QUERY_DEFINITIONS.map((definition) => [definition.key, definition]))
const CATALOG_DEFINITIONS = GAME_STATE_QUERY_DEFINITIONS.filter((definition) => definition.key !== 'ANY')

function makeClauseId(key: GameStateQueryKey) {
  return `${key.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function cloneClause(clause: GameStateQueryClauseDraft): GameStateQueryClauseDraft {
  return {
    id: makeClauseId(clause.key),
    key: clause.key,
    negated: clause.negated,
    values: { ...clause.values },
    branches: clause.branches?.map(cloneClause),
  }
}

function copyForDefinition(definition: GameStateQueryDefinition, hubCopy: HubCopy) {
  return {
    title: hubCopy.gameStateQuerySemantics.label(definition.key),
    description: hubCopy.gameStateQuerySemantics.description(definition.key),
  }
}

function selectedValues(value: string) {
  return new Set(value.split(/\s+/u).filter(Boolean))
}

function compactText(value: string, maxLength = 16) {
  const trimmed = value.trim()
  return trimmed.length <= maxLength ? trimmed : `${trimmed.slice(0, Math.max(0, maxLength - 3))}...`
}

function compactLabelForClause(clause: GameStateQueryClauseDraft, label: string) {
  const min = clause.values.min
  const max = clause.values.max
  if (clause.key === 'TIME' && min && max) {
    return `${min.slice(0, -2) || min}-${max.slice(0, -2) || max}`
  }

  if (clause.key === 'SEASON' && clause.values.season) {
    return clause.values.season.split(/\s+/u).filter(Boolean).map((season) => season.slice(0, 3)).join('/')
  }

  if (clause.key === 'WEATHER' && clause.values.weather) {
    return clause.values.weather
  }

  return compactText(label)
}

export function EventGameStateQueryBuilderModal({
  copy,
  hubCopy,
  initialQuery,
  onApply,
  onCancel,
}: EventGameStateQueryBuilderModalProps) {
  const [activeCategory, setActiveCategory] = useState<ActiveCategory>('world')
  const [searchText, setSearchText] = useState('')
  const [draftsByKey, setDraftsByKey] = useState<Partial<Record<GameStateQueryKey, GameStateQueryClauseDraft>>>({})
  const [clauses, setClauses] = useState<GameStateQueryClauseDraft[]>(() => parseGameStateQueryClauses(initialQuery ?? ''))
  const [anyBranches, setAnyBranches] = useState<GameStateQueryClauseDraft[]>([])

  const filteredDefinitions = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase()
    return CATALOG_DEFINITIONS.filter((definition) => {
      const definitionCopy = copyForDefinition(definition, hubCopy)
      const matchesCategory = normalizedSearch.length > 0 || activeCategory === 'all' || definition.category === activeCategory
      const matchesSearch = !normalizedSearch
        || definition.key.toLowerCase().includes(normalizedSearch)
        || definitionCopy.title.toLowerCase().includes(normalizedSearch)
        || definitionCopy.description.toLowerCase().includes(normalizedSearch)
      return matchesCategory && matchesSearch
    })
  }, [activeCategory, hubCopy, searchText])

  const query = serializeGameStateQueryClauses(clauses)
  const natural = query ? formatGameStateQueryForHub(query, hubCopy) : copy.emptyPreview
  const canApply = query.length > 0
  const canBuildAny = anyBranches.length > 0

  function draftForDefinition(definition: GameStateQueryDefinition) {
    return draftsByKey[definition.key as GameStateQueryKey] ?? createDefaultGameStateQueryClause(definition.key, `draft-${definition.key}`)
  }

  function updateDraftValue(definition: GameStateQueryDefinition, fieldId: string, value: string) {
    setDraftsByKey((current) => {
      const key = definition.key as GameStateQueryKey
      const existing = current[key] ?? createDefaultGameStateQueryClause(definition.key, `draft-${definition.key}`)
      return {
        ...current,
        [key]: {
          ...existing,
          values: {
            ...existing.values,
            [fieldId]: value,
          },
        },
      }
    })
  }

  function toggleMultiValue(definition: GameStateQueryDefinition, field: GameStateQueryFieldDefinition, option: string) {
    const draft = draftForDefinition(definition)
    const values = selectedValues(draft.values[field.id] ?? '')
    if (values.has(option)) {
      values.delete(option)
    } else {
      values.add(option)
    }
    updateDraftValue(definition, field.id, Array.from(values).join(' ') || field.defaultValue)
  }

  function addDefinitionClause(definition: GameStateQueryDefinition) {
    if (definition.key === 'ANY') {
      return
    }
    setClauses((current) => [...current, cloneClause(draftForDefinition(definition))])
  }

  function addDefinitionBranch(definition: GameStateQueryDefinition) {
    if (definition.key === 'ANY') {
      return
    }
    setAnyBranches((current) => [...current, cloneClause(draftForDefinition(definition))])
  }

  function addAnyGroup() {
    if (!canBuildAny) {
      return
    }
    const anyClause = createDefaultGameStateQueryClause('ANY', makeClauseId('ANY'))
    anyClause.branches = anyBranches.map(cloneClause)
    setClauses((current) => [...current, anyClause])
    setAnyBranches([])
  }

  function removeClause(clauseId: string) {
    setClauses((current) => current.filter((clause) => clause.id !== clauseId))
  }

  function removeBranch(clauseId: string) {
    setAnyBranches((current) => current.filter((clause) => clause.id !== clauseId))
  }

  function toggleClauseNegation(clauseId: string) {
    setClauses((current) => current.map((clause) => clause.id === clauseId ? { ...clause, negated: !clause.negated } : clause))
  }

  function toggleBranchNegation(clauseId: string) {
    setAnyBranches((current) => current.map((clause) => clause.id === clauseId ? { ...clause, negated: !clause.negated } : clause))
  }

  function applyQuery() {
    if (!canApply) {
      return
    }
    onApply({ query, natural })
  }

  function renderField(definition: GameStateQueryDefinition, field: GameStateQueryFieldDefinition) {
    const draft = draftForDefinition(definition)
    const value = draft.values[field.id] ?? field.defaultValue
    const label = copy.fieldLabels[field.label]

    if (field.kind === 'choice' && field.options) {
      return (
        <div key={field.id} className="game-state-query-field">
          <span>{label}</span>
          <div className="game-state-query-option-grid">
            {field.options.map((option) => (
              <button
                key={option}
                type="button"
                className={cx(value === option && 'active')}
                aria-pressed={value === option}
                onClick={() => updateDraftValue(definition, field.id, option)}
              >
                {copy.optionLabels[option] ?? option}
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (field.kind === 'multi-choice' && field.options) {
      const values = selectedValues(value)
      return (
        <div key={field.id} className="game-state-query-field">
          <span>{label}</span>
          <div className="game-state-query-option-grid">
            {field.options.map((option) => (
              <button
                key={option}
                type="button"
                className={cx(values.has(option) && 'active')}
                aria-pressed={values.has(option)}
                onClick={() => toggleMultiValue(definition, field, option)}
              >
                {copy.optionLabels[option] ?? option}
              </button>
            ))}
          </div>
        </div>
      )
    }

    return (
      <label key={field.id} className="game-state-query-field">
        <span>{label}</span>
        <input
          value={value}
          inputMode={field.kind === 'number' ? 'decimal' : undefined}
          onChange={(event) => updateDraftValue(definition, field.id, event.target.value)}
        />
      </label>
    )
  }

  function renderDefinitionCard(definition: GameStateQueryDefinition) {
    const DefinitionIcon = CATEGORY_ICONS[definition.category]
    const definitionCopy = copyForDefinition(definition, hubCopy)
    const canAddDefinition = definition.key !== 'ANY'

    return (
      <article
        key={definition.key}
        className={cx('condition-catalog-option game-state-query-catalog-option', definition.fields.length === 0 && 'no-controls')}
      >
        <div className="condition-catalog-option-head">
          <span className="condition-catalog-icon"><DefinitionIcon className="h-4 w-4" aria-hidden="true" /></span>
          <span>
            <strong>{definitionCopy.title}</strong>
            <small>{definitionCopy.description}</small>
          </span>
          <div className="game-state-query-card-button-stack">
            <button
              type="button"
              className="condition-catalog-add-button"
              disabled={!canAddDefinition}
              onClick={() => addDefinitionClause(definition)}
            >
              {copy.addClauseAction}
            </button>
            <button
              type="button"
              className="condition-catalog-add-button secondary"
              disabled={!canAddDefinition}
              onClick={() => addDefinitionBranch(definition)}
            >
              {copy.addBranchAction}
            </button>
          </div>
        </div>
        {definition.fields.length > 0 ? (
          <div className="game-state-query-field-grid">
            {definition.fields.map((field) => renderField(definition, field))}
          </div>
        ) : null}
      </article>
    )
  }

  function renderClauseChip(
    clause: GameStateQueryClauseDraft,
    onToggleNegation: (clauseId: string) => void,
    onRemove: (clauseId: string) => void,
  ) {
    const label = formatGameStateQueryForHub(serializeGameStateQueryClause({ ...clause, negated: false }), hubCopy)
    const compactLabel = compactLabelForClause(clause, label)
    const definition = DEFINITION_BY_KEY.get(clause.key)
    const ClauseIcon = CATEGORY_ICONS[definition?.category ?? 'system']
    return (
      <div key={clause.id} className={cx('condition-chip', clause.negated && 'negated')}>
        <button
          type="button"
          className="condition-chip-negate"
          aria-label={copy.negateClauseLabel(label)}
          onClick={() => onToggleNegation(clause.id)}
        >
          !
        </button>
        <ClauseIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="condition-chip-compact">{compactLabel}</span>
        <span className="condition-chip-full">{label}</span>
        <button
          type="button"
          aria-label={copy.removeClauseLabel(label)}
          onClick={() => onRemove(clause.id)}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div className="game-state-query-backdrop" role="presentation" onClick={onCancel}>
      <div className="game-state-query-stack" onClick={(event) => event.stopPropagation()}>
        <section
          className="game-state-query-modal"
          role="dialog"
          aria-modal="true"
          aria-label={copy.title}
        >
          <header className="game-state-query-header">
            <div>
              <h2>{copy.title}</h2>
              <p>{copy.subtitle}</p>
            </div>
            <button type="button" className="icon-button h-8 w-8" aria-label={copy.closeLabel} onClick={onCancel}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div className="game-state-query-body">
            <aside className="game-state-query-category-rail" aria-label={copy.templateRailLabel}>
              <label className="game-state-query-search">
                <Search className="h-3.5 w-3.5" aria-hidden="true" />
                <input
                  value={searchText}
                  onChange={(event) => setSearchText(event.target.value)}
                  placeholder={copy.catalogSearchPlaceholder}
                  aria-label={copy.catalogSearchPlaceholder}
                />
              </label>
              <div className="game-state-query-category-list">
                {CATEGORY_IDS.map((category) => {
                  const CategoryIcon = CATEGORY_ICONS[category]
                  return (
                    <button
                      key={category}
                      type="button"
                      className={cx(activeCategory === category && 'active')}
                      aria-pressed={activeCategory === category}
                      onClick={() => setActiveCategory(category)}
                    >
                      <CategoryIcon className="h-4 w-4" aria-hidden="true" />
                      <span>{category === 'all' ? copy.categoryAllLabel : copy.categoryLabels[category]}</span>
                    </button>
                  )
                })}
              </div>
              <div className="game-state-query-result-count">{copy.matchesCountLabel(filteredDefinitions.length)}</div>
            </aside>

            <main className="game-state-query-workbench">
              <section className="condition-builder-card condition-catalog-card game-state-query-catalog-card">
                <div className="condition-catalog-grid game-state-query-catalog-grid">
                  {filteredDefinitions.map(renderDefinitionCard)}
                </div>
              </section>
            </main>
          </div>
        </section>

        <aside className="condition-builder-chain-dock game-state-query-chain-dock" aria-label={copy.chainTitle}>
          <section className="game-state-query-chain-panel">
            <div className="game-state-query-card-heading">
              <strong>{copy.chainTitle}</strong>
              <span>{copy.logicAllLabel}</span>
            </div>
            <div className={cx('condition-chip-scroll', clauses.length > 8 && 'compact')}>
              {clauses.length > 0
                ? clauses.map((clause) => renderClauseChip(clause, toggleClauseNegation, removeClause))
                : <span className="condition-chip-empty">{copy.emptyChainLabel}</span>}
            </div>
          </section>

          <section className="game-state-query-chain-panel">
            <div className="game-state-query-card-heading">
              <strong>{copy.branchTitle}</strong>
              <button type="button" className="control-button" disabled={!canBuildAny} onClick={addAnyGroup}>
                <Layers3 className="h-4 w-4" aria-hidden="true" />
                {copy.addAnyGroupAction}
              </button>
            </div>
            <div className={cx('condition-chip-scroll', anyBranches.length > 8 && 'compact')}>
              {anyBranches.length > 0
                ? anyBranches.map((clause) => renderClauseChip(clause, toggleBranchNegation, removeBranch))
                : <span className="condition-chip-empty">{copy.emptyBranchLabel}</span>}
            </div>
          </section>
        </aside>

        <aside className="condition-builder-preview-dock game-state-query-preview-dock" aria-label={copy.naturalPreviewLabel}>
          <div className="condition-builder-previews">
            <p><strong>{copy.naturalPreviewLabel}</strong>{natural}</p>
            <p><strong>{copy.codePreviewLabel}</strong><code>{query || copy.emptyPreview}</code></p>
          </div>
          <div className="condition-builder-actions">
            <button type="button" className="control-button" onClick={onCancel}>{copy.cancelAction}</button>
            <button type="button" className="control-button control-button-primary" disabled={!canApply} onClick={applyQuery}>
              {copy.applyAction}
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}
