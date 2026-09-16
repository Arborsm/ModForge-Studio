import React from 'react'
import type { PluginContext, PluginDirectoryEntry, PluginGameDataAsset } from '@modforge/plugin-sdk'

type Animation = { Frame: number; Duration?: number; Type?: string }
type Variation = { Id: number; Name?: string; ChanceWeight?: number; Keywords?: string[]; Animation?: Animation[]; Tints?: number[][] }
type Texture = {
  ItemName?: string
  ItemId?: string
  CollectiveNames?: string[]
  CollectiveIds?: string[]
  Type?: string
  IgnoreBuildingColorMask?: boolean
  Keywords?: string[]
  Seasons?: string[]
  TextureWidth?: number
  TextureHeight?: number
  Variations?: number
  DefaultVariation?: number
  ManualVariations?: Variation[]
  Animation?: Animation[]
}
type Entry = PluginDirectoryEntry & { value?: Texture }
type FurnitureItem = { id: string; name: string; displayName: string }

type NewDraft = {
  id: string
  itemName: string
  itemId: string
  collectiveName: string
  type: string
  width: number
  height: number
  variations: number
  image?: File
}

export const TEXTURE_TYPES = [
  'Unknown',
  'Craftable',
  'Grass',
  'Tree',
  'FruitTree',
  'Crop',
  'GiantCrop',
  'ResourceClump',
  'Bush',
  'Flooring',
  'Furniture',
  'Character',
  'Building',
  'Decoration',
  'ArtifactSpot',
] as const
export const FRAME_TYPES = ['Default', 'MachineIdle', 'MachineActive'] as const
const ROOT = 'Textures'
const SEASONS = ['spring', 'summer', 'fall', 'winter'] as const
type MountFieldType = 'item' | 'collectiveNames' | 'collectiveIds' | 'seasons' | 'keywords'
const blank: Texture = {
  Type: 'Unknown',
  Variations: 1,
  TextureWidth: 16,
  TextureHeight: 16,
  ManualVariations: [],
  Animation: [],
}
const imageCache = new Map<string, Promise<string | null>>()

function split(value: string | undefined): string[] {
  return (
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  )
}

function text(value: string[] | undefined): string {
  return (value ?? []).join(', ')
}

/** Host command policies reject outdated calls with a supersede notice; that is normal task ownership, not a failure. */
function isSuperseded(reason: unknown): boolean {
  return String(reason instanceof Error ? reason.message : reason)
    .toLowerCase()
    .includes('superseded')
}

/** Tints are RGBA quads; edited as `r,g,b,a; r,g,b,a`. */
function formatTints(tints: number[][] | undefined): string {
  return (tints ?? []).map((tint) => tint.join(', ')).join('; ')
}

function parseTints(value: string): number[][] {
  return value
    .split(';')
    .map((group) =>
      group
        .split(',')
        .map((channel) => Number(channel.trim()))
        .filter((channel) => Number.isFinite(channel)),
    )
    .filter((group) => group.length > 0)
}

function loadModImage(ctx: PluginContext, path: string | null): Promise<string | null> {
  if (!path) return Promise.resolve(null)
  const cached = imageCache.get(path)
  if (cached) return cached
  const request = ctx.commands.invoke<string | null>('loadModImage', { path }).catch(() => null)
  imageCache.set(path, request)
  return request
}

/**
 * AT resolves an entry's texture as `texture.png` (all variations in one
 * sheet) or, when that file is absent, split per-variation `texture_1.png`,
 * `texture_2.png`, ... — so the preview candidates are the listed image path
 * plus the first split file.
 */
function previewCandidates(entry: PluginDirectoryEntry): string[] {
  return [entry.entryImagePath, `${entry.entryDir}/texture_1.png`].filter((path): path is string => Boolean(path))
}

/** Returns the first candidate image path that actually loads, or null. */
async function resolvePreviewPath(ctx: PluginContext, candidates: string[]): Promise<string | null> {
  for (const path of candidates) {
    if (await loadModImage(ctx, path)) return path
  }
  return null
}

function ModImage({
  ctx,
  entryImagePath,
  entryDir,
  className,
  alt,
}: {
  ctx: PluginContext
  entryImagePath: string | null
  entryDir: string
  className?: string
  alt: string
}) {
  const [src, setSrc] = React.useState<string | null>(null)
  React.useEffect(() => {
    let alive = true
    const run = async () => {
      const path = await resolvePreviewPath(
        ctx,
        [entryImagePath, `${entryDir}/texture_1.png`].filter((candidate): candidate is string => Boolean(candidate)),
      )
      if (!alive) return
      if (!path) {
        setSrc(null)
        return
      }
      const value = await loadModImage(ctx, path)
      if (alive) setSrc(value)
    }
    // Terminated with .catch rather than `void`: oxc drops the void operator
    // from statement positions, which then trips no-floating-promises on the
    // shipped bundle.
    run().catch(() => {
      if (alive) setSrc(null)
    })
    return () => {
      alive = false
    }
  }, [ctx, entryImagePath, entryDir])
  return src ? (
    <img className={className} src={src} alt={alt} />
  ) : (
    <span className={`${className ?? ''} at-image-placeholder`} aria-label={alt} />
  )
}

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      resolve(typeof result === 'string' ? (result.split(',')[1] ?? '') : '')
    }
    reader.onerror = () => reject(reader.error ?? new Error('image read failed'))
    reader.readAsDataURL(file)
  })
}

export function AlternativeTexturesPage({ ctx }: { ctx: PluginContext }) {
  const { WorkspaceSplitView, CompactSelect, Disclosure, EmptyStateCard } = ctx.components
  const t = (key: string) => ctx.i18n.t(key)
  const [entries, setEntries] = React.useState<Entry[]>([])
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [furniture, setFurniture] = React.useState<FurnitureItem[]>([])
  const [mountDialog, setMountDialog] = React.useState<{
    section: 'identity' | 'appearance'
    fixedType?: MountFieldType
    initialSeasons?: string[]
  } | null>(null)
  const [draft, setDraft] = React.useState<NewDraft>({
    id: '',
    itemName: '',
    itemId: '',
    collectiveName: '',
    type: 'Furniture',
    width: 16,
    height: 16,
    variations: 1,
  })
  const selected = entries.find((entry) => entry.sourceModRoot + ':' + entry.id === selectedKey) ?? null
  // Stable identity: an inline arrow here would change every render and
  // retrigger the loading effect below in an endless request loop.
  const invoke = React.useCallback(
    <T,>(name: Parameters<PluginContext['commands']['invoke']>[0], args?: unknown) => ctx.commands.invoke<T>(name, args),
    [ctx],
  )

  const reload = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    let superseded = false
    try {
      const result = await invoke<PluginDirectoryEntry[]>('listModDirectory', {
        rootSubdir: ROOT,
        entryFile: 'texture.json',
        entryImage: 'texture.png',
        includeContentPacks: true,
      })
      const loaded: Entry[] = result
      setEntries(loaded)
      setSelectedKey((current) =>
        current && loaded.some((entry) => entry.sourceModRoot + ':' + entry.id === current)
          ? current
          : loaded[0]
            ? loaded[0].sourceModRoot + ':' + loaded[0].id
            : null,
      )
      await Promise.all(
        loaded.map(async (entry) => {
          const raw = await invoke<{ content: Texture } | null>('readModFile', {
            rootSubdir: ROOT,
            entryId: entry.id,
            entryFile: 'texture.json',
            sourceModRoot: entry.sourceModRoot,
          })
          setEntries((all) =>
            all.map((item) =>
              item.id === entry.id && item.sourceModRoot === entry.sourceModRoot ? { ...item, value: raw?.content ?? blank } : item,
            ),
          )
        }),
      )
    } catch (reason) {
      if (isSuperseded(reason)) {
        superseded = true
      } else {
        setError(reason instanceof Error ? reason.message : String(reason))
      }
    } finally {
      if (!superseded) setLoading(false)
    }
  }, [invoke])

  React.useEffect(() => {
    void reload().catch(() => undefined)
    void invoke<PluginGameDataAsset>('loadGameDataAsset', { assetPath: 'Data/Furniture' })
      .then((asset) => {
        if (!asset) return
        const data = JSON.parse(asset.content) as Record<string, unknown>
        setFurniture(
          Object.entries(data).flatMap(([id, value]) => {
            if (!value || typeof value !== 'object') return []
            const item = value as Record<string, unknown>
            const name = typeof item.Name === 'string' ? item.Name : id
            return [{ id, name, displayName: typeof item.DisplayName === 'string' ? item.DisplayName : name }]
          }),
        )
      })
      .catch(() => undefined)
  }, [invoke, reload])

  const update = (patch: Partial<Texture>) => {
    if (!selected) return
    setEntries((all) =>
      all.map((entry) =>
        entry.sourceModRoot === selected.sourceModRoot && entry.id === selected.id
          ? { ...entry, value: { ...entry.value, ...patch } }
          : entry,
      ),
    )
  }

  const save = async () => {
    if (!selected?.value) return
    setSaving(true)
    try {
      await invoke('writeModFile', {
        rootSubdir: ROOT,
        entryId: selected.id,
        entryFile: 'texture.json',
        content: selected.value,
        sourceModRoot: selected.sourceModRoot,
      })
      ctx.notifications.publish({ id: 'at-save', level: 'success', title: t('at.editor.saveSuccess'), autoDismissMs: 3000 })
    } catch (reason) {
      ctx.notifications.publish({
        id: 'at-save',
        level: 'error',
        title: t('at.editor.saveError'),
        summary: reason instanceof Error ? reason.message : String(reason),
        autoDismissMs: 5000,
      })
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!selected || !window.confirm(t('at.editor.deleteConfirm'))) return
    try {
      await invoke('deleteModEntry', { rootSubdir: ROOT, entryId: selected.id, sourceModRoot: selected.sourceModRoot })
      ctx.notifications.publish({ id: 'at-delete', level: 'success', title: t('at.editor.deleteSuccess'), autoDismissMs: 3000 })
      await reload()
    } catch (reason) {
      ctx.notifications.publish({
        id: 'at-delete',
        level: 'error',
        title: t('at.editor.deleteError'),
        summary: reason instanceof Error ? reason.message : String(reason),
        autoDismissMs: 5000,
      })
    }
  }

  const create = async () => {
    if (!/^[^\\/:*?"<>|.][^\\/:*?"<>|]*$/.test(draft.id.trim())) return
    if (!draft.itemName && !draft.itemId && !draft.collectiveName) return
    const content: Texture = {
      Type: draft.type,
      TextureWidth: draft.width,
      TextureHeight: draft.height,
      Variations: draft.variations,
      ...(draft.itemName ? { ItemName: draft.itemName } : {}),
      ...(draft.itemId ? { ItemId: draft.itemId } : {}),
      ...(draft.collectiveName ? { CollectiveNames: [draft.collectiveName] } : {}),
      ManualVariations: [],
      Animation: [],
    }
    try {
      await invoke('writeModFile', { rootSubdir: ROOT, entryId: draft.id.trim(), entryFile: 'texture.json', content })
      if (draft.image) {
        const contentBase64 = await readImage(draft.image)
        await invoke('writeModEntryImage', { rootSubdir: ROOT, entryId: draft.id.trim(), imageFile: 'texture.png', contentBase64 })
      }
      const createdId = draft.id.trim()
      setNewOpen(false)
      setDraft({ id: '', itemName: '', itemId: '', collectiveName: '', type: 'Furniture', width: 16, height: 16, variations: 1 })
      await reload()
      const createdEntry = (
        await invoke<PluginDirectoryEntry[]>('listModDirectory', {
          rootSubdir: ROOT,
          entryFile: 'texture.json',
          entryImage: 'texture.png',
        })
      ).find((entry) => entry.id === createdId)
      setSelectedKey(createdEntry ? `${createdEntry.sourceModRoot}:${createdId}` : null)
    } catch (reason) {
      ctx.notifications.publish({
        id: 'at-create',
        level: 'error',
        title: t('at.editor.createError'),
        summary: reason instanceof Error ? reason.message : String(reason),
        autoDismissMs: 5000,
      })
    }
  }

  const editVariation = (index: number, patch: Partial<Variation>) => {
    if (selected?.value)
      update({
        ManualVariations: selected.value.ManualVariations?.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
      })
  }
  const editAnimation = (index: number, patch: Partial<Animation>) => {
    if (selected?.value)
      update({ Animation: selected.value.Animation?.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)) })
  }
  const field = (label: string, key: keyof Texture, type: 'text' | 'number' = 'text') => (
    <label className="at-field">
      <span>{label}</span>
      <input
        className="control-input"
        type={type}
        value={entryValue(selected?.value, key, type)}
        onChange={(event) => update({ [key]: type === 'number' ? Number(event.target.value) : event.target.value })}
      />
    </label>
  )
  const mountedListField = (label: string, key: 'Keywords' | 'CollectiveNames' | 'CollectiveIds') => {
    const value = selected?.value?.[key]
    if (!value?.length) return null
    return (
      <div className="at-field at-mounted" key={key}>
        <span>{label}</span>
        <input className="control-input" value={text(value)} onChange={(event) => update({ [key]: split(event.target.value) })} />
        <button className="control-button" type="button" onClick={() => update({ [key]: undefined })}>
          {t('at.action.remove')}
        </button>
      </div>
    )
  }
  const hasItemIdentity = Boolean(selected?.value?.ItemName || selected?.value?.ItemId)

  const editor = selected ? (
    <div className="at-editor">
      <div className="at-toolbar">
        <span className="at-id">{selected.id}</span>
        <span className="at-meta">{selected.sourceModName}</span>
        <button className="control-button text-danger" type="button" onClick={() => void remove()}>
          {t('at.editor.delete')}
        </button>
        <button className="control-button control-button-primary" type="button" disabled={saving} onClick={() => void save()}>
          {t('at.editor.save')}
        </button>
      </div>
      <div className="at-preview">
        <ModImage
          ctx={ctx}
          entryImagePath={selected.entryImagePath}
          entryDir={selected.entryDir}
          className="at-preview-image"
          alt={selected.id}
        />
        <label className="at-upload control-button">
          {t('at.preview.replace')}
          <input
            className="at-file-input"
            type="file"
            accept="image/png,image/*"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              void resolvePreviewPath(ctx, previewCandidates(selected))
                .then(async (existing) => {
                  // Write back to the file AT actually reads: `texture.png`
                  // when present, otherwise the split `texture_1.png`.
                  const imageFile = existing ? (existing.split(/[\\/]/).pop() ?? 'texture.png') : 'texture.png'
                  const contentBase64 = await readImage(file)
                  await invoke('writeModEntryImage', {
                    rootSubdir: ROOT,
                    entryId: selected.id,
                    imageFile,
                    contentBase64,
                    sourceModRoot: selected.sourceModRoot,
                  })
                  for (const path of previewCandidates(selected)) imageCache.delete(path)
                  ctx.notifications.publish({ id: 'at-image', level: 'success', title: t('at.preview.uploadSuccess'), autoDismissMs: 3000 })
                  return reload()
                })
                .catch((reason) =>
                  ctx.notifications.publish({
                    id: 'at-image',
                    level: 'error',
                    title: t('at.preview.uploadError'),
                    summary: reason instanceof Error ? reason.message : String(reason),
                    autoDismissMs: 5000,
                  }),
                )
            }}
          />
        </label>
      </div>
      <section>
        <h3>{t('at.section.identity')}</h3>
        {selected.value && hasItemIdentity ? (
          <div className="at-field at-mounted">
            <span>{t('at.mount.item')}</span>
            <div className="at-mounted-inputs">
              <input
                className="control-input"
                aria-label={t('at.field.itemName')}
                placeholder={t('at.field.itemName')}
                value={selected.value.ItemName ?? ''}
                onChange={(event) => update({ ItemName: event.target.value })}
              />
              <input
                className="control-input"
                aria-label={t('at.field.itemId')}
                placeholder={t('at.field.itemId')}
                value={selected.value.ItemId ?? ''}
                onChange={(event) => update({ ItemId: event.target.value })}
              />
            </div>
            <button className="control-button" type="button" onClick={() => update({ ItemName: undefined, ItemId: undefined })}>
              {t('at.action.remove')}
            </button>
          </div>
        ) : null}
        {mountedListField(t('at.field.collectiveNames'), 'CollectiveNames')}
        {mountedListField(t('at.field.collectiveIds'), 'CollectiveIds')}
        {!(hasItemIdentity && selected.value?.CollectiveNames?.length && selected.value?.CollectiveIds?.length) ? (
          <button className="control-button" type="button" onClick={() => setMountDialog({ section: 'identity' })}>
            {t('at.mount.addIdentity')}
          </button>
        ) : null}
      </section>
      <section>
        <h3>{t('at.section.texture')}</h3>
        <label className="at-field">
          <span>{t('at.field.type')}</span>
          <CompactSelect
            value={selected.value?.Type ?? 'Unknown'}
            ariaLabel={t('at.field.type')}
            options={TEXTURE_TYPES.map((value) => ({ value, label: value }))}
            onChange={(value) => update({ Type: value })}
          />
        </label>
        {field(t('at.field.textureWidth'), 'TextureWidth', 'number')}
        {field(t('at.field.textureHeight'), 'TextureHeight', 'number')}
        {field(t('at.field.variations'), 'Variations', 'number')}
        {field(t('at.field.defaultVariation'), 'DefaultVariation', 'number')}
        <label className="at-check">
          <input
            type="checkbox"
            checked={selected.value?.IgnoreBuildingColorMask ?? false}
            onChange={(event) => update({ IgnoreBuildingColorMask: event.target.checked })}
          />
          {t('at.field.ignoreBuildingColorMask')}
        </label>
      </section>
      <section>
        <h3>{t('at.section.appearance')}</h3>
        {selected.value?.Seasons?.length ? (
          <div className="at-field at-mounted">
            <span>{t('at.field.seasons')}</span>
            <button
              className="control-button at-mounted-value"
              type="button"
              onClick={() => setMountDialog({ section: 'appearance', fixedType: 'seasons', initialSeasons: selected.value?.Seasons ?? [] })}
            >
              {selected.value.Seasons.map((season) => t(`at.season.${season}`)).join(', ')}
            </button>
            <button className="control-button" type="button" onClick={() => update({ Seasons: undefined })}>
              {t('at.action.remove')}
            </button>
          </div>
        ) : null}
        {mountedListField(t('at.field.keywords'), 'Keywords')}
        {!(selected.value?.Seasons?.length && selected.value?.Keywords?.length) ? (
          <button className="control-button" type="button" onClick={() => setMountDialog({ section: 'appearance' })}>
            {t('at.mount.addAppearance')}
          </button>
        ) : null}
      </section>
      <section>
        <h3>{t('at.field.manualVariations')}</h3>
        {(selected.value?.ManualVariations ?? []).map((variation, index) => (
          <div className="at-row" key={index}>
            <input
              className="control-input"
              aria-label={t('at.field.manualVariationId')}
              type="number"
              value={variation.Id}
              onChange={(event) => editVariation(index, { Id: Number(event.target.value) })}
            />
            <input
              className="control-input"
              aria-label={t('at.field.manualVariationName')}
              value={variation.Name ?? ''}
              onChange={(event) => editVariation(index, { Name: event.target.value })}
            />
            <input
              className="control-input"
              aria-label={t('at.field.manualVariationChanceWeight')}
              type="number"
              step="0.01"
              value={variation.ChanceWeight ?? 1}
              onChange={(event) => editVariation(index, { ChanceWeight: Number(event.target.value) })}
            />
            <input
              className="control-input"
              aria-label={t('at.field.tints')}
              placeholder={t('at.field.tints')}
              value={formatTints(variation.Tints)}
              onChange={(event) => editVariation(index, { Tints: parseTints(event.target.value) })}
            />
            <button
              className="control-button"
              type="button"
              onClick={() => update({ ManualVariations: selected.value?.ManualVariations?.filter((_, itemIndex) => itemIndex !== index) })}
            >
              {t('at.action.remove')}
            </button>
          </div>
        ))}
        <button
          className="control-button"
          type="button"
          onClick={() =>
            update({
              ManualVariations: [
                ...(selected.value?.ManualVariations ?? []),
                { Id: (selected.value?.ManualVariations?.length ?? 0) + 1, ChanceWeight: 1 },
              ],
            })
          }
        >
          {t('at.action.add')}
        </button>
      </section>
      <Disclosure title={t('at.section.advanced')}>
        <section>
          <h3>{t('at.field.animation')}</h3>
          {(selected.value?.Animation ?? []).map((animation, index) => (
            <div className="at-row" key={index}>
              <input
                className="control-input"
                type="number"
                value={animation.Frame}
                onChange={(event) => editAnimation(index, { Frame: Number(event.target.value) })}
              />
              <input
                className="control-input"
                type="number"
                value={animation.Duration ?? 1000}
                onChange={(event) => editAnimation(index, { Duration: Number(event.target.value) })}
              />
              <CompactSelect
                value={animation.Type ?? 'Default'}
                ariaLabel={t('at.field.animationType')}
                options={FRAME_TYPES.map((value) => ({ value, label: value }))}
                onChange={(value) => editAnimation(index, { Type: value })}
              />
              <button
                className="control-button"
                type="button"
                onClick={() => update({ Animation: selected.value?.Animation?.filter((_, itemIndex) => itemIndex !== index) })}
              >
                {t('at.action.remove')}
              </button>
            </div>
          ))}
          <button
            className="control-button"
            type="button"
            onClick={() => update({ Animation: [...(selected.value?.Animation ?? []), { Frame: 0, Duration: 1000, Type: 'Default' }] })}
          >
            {t('at.action.add')}
          </button>
        </section>
      </Disclosure>
    </div>
  ) : (
    <EmptyStateCard title={t('at.editor.noSelection')} detail={t('at.empty.detail')} density="compact" />
  )

  const filtered = entries.filter(
    (entry) => entry.id.toLowerCase().includes(query.toLowerCase()) || entry.value?.ItemName?.toLowerCase().includes(query.toLowerCase()),
  )
  const sidebar = (
    <aside className="at-sidebar">
      <div className="at-list-toolbar">
        <input
          className="control-input"
          placeholder={t('at.entryList.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="control-button" type="button" onClick={() => setNewOpen(true)}>
          {t('at.action.new')}
        </button>
      </div>
      {loading ? (
        <p>{t('at.loading')}</p>
      ) : error ? (
        <p className="at-error">{error}</p>
      ) : (
        filtered.map((entry) => (
          <button
            type="button"
            className={`at-entry${entry.sourceModRoot + ':' + entry.id === selectedKey ? ' is-selected' : ''}`}
            key={`${entry.sourceModRoot}:${entry.id}`}
            onClick={() => setSelectedKey(entry.sourceModRoot + ':' + entry.id)}
          >
            <ModImage ctx={ctx} entryImagePath={entry.entryImagePath} entryDir={entry.entryDir} alt="" />
            {entry.id}
            <small>{entry.sourceModName}</small>
          </button>
        ))
      )}
    </aside>
  )

  return (
    <>
      <WorkspaceSplitView sidebar={sidebar} sidebarWidth="17rem" sidebarLabel={t('at.entryList.title')} mainClassName="at-main">
        {editor}
      </WorkspaceSplitView>
      {newOpen ? (
        <NewEntryDialog
          ctx={ctx}
          t={t}
          furniture={furniture}
          draft={draft}
          setDraft={setDraft}
          onCancel={() => setNewOpen(false)}
          onCreate={() => void create()}
        />
      ) : null}
      {mountDialog && selected?.value ? (
        <MountFieldDialog
          t={t}
          furniture={furniture}
          section={mountDialog.section}
          fixedType={mountDialog.fixedType}
          initialSeasons={mountDialog.initialSeasons}
          value={selected.value}
          onCancel={() => setMountDialog(null)}
          onApply={(patch) => {
            update(patch)
            setMountDialog(null)
          }}
        />
      ) : null}
    </>
  )
}

/** Dialog for mounting an optional field: pick what to add, then supply its value. */
function MountFieldDialog({
  t,
  furniture,
  section,
  fixedType,
  initialSeasons,
  value,
  onCancel,
  onApply,
}: {
  t: (key: string) => string
  furniture: FurnitureItem[]
  section: 'identity' | 'appearance'
  fixedType?: MountFieldType
  initialSeasons?: string[]
  value: Texture
  onCancel: () => void
  onApply: (patch: Partial<Texture>) => void
}) {
  const available: MountFieldType[] =
    section === 'identity'
      ? [
          ...(value.ItemName || value.ItemId ? [] : (['item'] as const)),
          ...(value.CollectiveNames?.length ? [] : (['collectiveNames'] as const)),
          ...(value.CollectiveIds?.length ? [] : (['collectiveIds'] as const)),
        ]
      : [...(value.Seasons?.length ? [] : (['seasons'] as const)), ...(value.Keywords?.length ? [] : (['keywords'] as const))]
  const [type, setType] = React.useState<MountFieldType | null>(fixedType ?? available[0] ?? null)
  const [textValue, setTextValue] = React.useState('')
  const [furnitureId, setFurnitureId] = React.useState('')
  const [seasons, setSeasons] = React.useState<string[]>(initialSeasons ?? [])
  const typeLabel = (fieldType: MountFieldType) =>
    fieldType === 'item'
      ? t('at.mount.item')
      : fieldType === 'collectiveNames'
        ? t('at.field.collectiveNames')
        : fieldType === 'collectiveIds'
          ? t('at.field.collectiveIds')
          : fieldType === 'seasons'
            ? t('at.field.seasons')
            : t('at.field.keywords')
  const confirm = () => {
    if (type === 'item') {
      const item = furniture.find((entry) => entry.id === furnitureId)
      if (item) onApply({ ItemName: item.name, ItemId: item.id })
    } else if (type === 'collectiveNames') {
      onApply({ CollectiveNames: split(textValue) })
    } else if (type === 'collectiveIds') {
      onApply({ CollectiveIds: split(textValue) })
    } else if (type === 'seasons') {
      onApply({ Seasons: seasons })
    } else if (type === 'keywords') {
      onApply({ Keywords: split(textValue) })
    }
  }
  const canConfirm =
    (type === 'item' && furnitureId.length > 0) ||
    (type === 'seasons' && seasons.length > 0) ||
    ((type === 'collectiveNames' || type === 'collectiveIds' || type === 'keywords') && split(textValue).length > 0)
  if (!type) return null
  return (
    <div className="at-dialog" role="dialog" aria-modal="true">
      <h2>{typeLabel(type)}</h2>
      {fixedType ? null : (
        <label>
          {t('at.mount.fieldType')}
          <select className="control-input" value={type} onChange={(event) => setType(event.target.value as MountFieldType)}>
            {available.map((fieldType) => (
              <option key={fieldType} value={fieldType}>
                {typeLabel(fieldType)}
              </option>
            ))}
          </select>
        </label>
      )}
      {type === 'item' ? (
        <label>
          {t('at.new.chooseFurniture')}
          <select className="control-input" value={furnitureId} onChange={(event) => setFurnitureId(event.target.value)}>
            <option value="">{t('at.new.chooseFurniture')}</option>
            {furniture.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName} ({item.id})
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {type === 'collectiveNames' || type === 'collectiveIds' || type === 'keywords' ? (
        <label>
          {typeLabel(type)}
          <input className="control-input" autoFocus value={textValue} onChange={(event) => setTextValue(event.target.value)} />
        </label>
      ) : null}
      {type === 'seasons' ? (
        <div>
          {SEASONS.map((season) => (
            <label className="at-check" key={season}>
              <input
                type="checkbox"
                checked={seasons.includes(season)}
                onChange={(event) =>
                  setSeasons((current) => (event.target.checked ? [...current, season] : current.filter((item) => item !== season)))
                }
              />
              {t(`at.season.${season}`)}
            </label>
          ))}
        </div>
      ) : null}
      <div className="at-dialog-actions">
        <button className="control-button" type="button" onClick={onCancel}>
          {t('at.action.cancel')}
        </button>
        <button className="control-button control-button-primary" type="button" disabled={!canConfirm} onClick={confirm}>
          {t('at.action.confirm')}
        </button>
      </div>
    </div>
  )
}

function NewEntryDialog({
  ctx,
  t,
  furniture,
  draft,
  setDraft,
  onCancel,
  onCreate,
}: {
  ctx: PluginContext
  t: (key: string) => string
  furniture: FurnitureItem[]
  draft: NewDraft
  setDraft: React.Dispatch<React.SetStateAction<NewDraft>>
  onCancel: () => void
  onCreate: () => void
}) {
  const validId = /^[^\\/:*?"<>|.][^\\/:*?"<>|]*$/.test(draft.id.trim())
  return (
    <div className="at-dialog" role="dialog" aria-modal="true">
      <h2>{t('at.action.new')}</h2>
      <label>
        {t('at.new.entryName')}
        <input
          className="control-input"
          autoFocus
          value={draft.id}
          onChange={(event) => setDraft((value) => ({ ...value, id: event.target.value }))}
        />
      </label>
      <label>
        {t('at.new.identifier')}
        <CompactItemSelect ctx={ctx} t={t} furniture={furniture} draft={draft} setDraft={setDraft} />
      </label>
      <label>
        {t('at.field.type')}
        <select
          className="control-input"
          value={draft.type}
          onChange={(event) => setDraft((value) => ({ ...value, type: event.target.value }))}
        >
          {TEXTURE_TYPES.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </label>
      <div className="at-new-grid">
        <label>
          {t('at.field.textureWidth')}
          <input
            className="control-input"
            type="number"
            min="1"
            value={draft.width}
            onChange={(event) => setDraft((value) => ({ ...value, width: Number(event.target.value) }))}
          />
        </label>
        <label>
          {t('at.field.textureHeight')}
          <input
            className="control-input"
            type="number"
            min="1"
            value={draft.height}
            onChange={(event) => setDraft((value) => ({ ...value, height: Number(event.target.value) }))}
          />
        </label>
        <label>
          {t('at.field.variations')}
          <input
            className="control-input"
            type="number"
            min="1"
            value={draft.variations}
            onChange={(event) => setDraft((value) => ({ ...value, variations: Number(event.target.value) }))}
          />
        </label>
      </div>
      <label>
        {t('at.preview.replace')}
        <span className="at-upload control-button">
          {draft.image ? draft.image.name : t('at.preview.choose')}
          <input
            className="at-file-input"
            type="file"
            accept="image/png,image/*"
            onChange={(event) => setDraft((value) => ({ ...value, image: event.target.files?.[0] }))}
          />
        </span>
      </label>
      <div className="at-dialog-actions">
        <button className="control-button" type="button" onClick={onCancel}>
          {t('at.action.cancel')}
        </button>
        <button
          className="control-button control-button-primary"
          type="button"
          disabled={!validId || (!draft.itemName && !draft.itemId && !draft.collectiveName)}
          onClick={onCreate}
        >
          {t('at.action.new')}
        </button>
      </div>
    </div>
  )
}

function CompactItemSelect({
  t,
  furniture,
  draft,
  setDraft,
}: {
  ctx: PluginContext
  t: (key: string) => string
  furniture: FurnitureItem[]
  draft: NewDraft
  setDraft: React.Dispatch<React.SetStateAction<NewDraft>>
}) {
  return (
    <>
      <select
        className="control-input"
        value={draft.itemId}
        onChange={(event) => {
          const item = furniture.find((value) => value.id === event.target.value)
          setDraft((value) => ({ ...value, itemId: event.target.value, itemName: item?.name ?? '' }))
        }}
      >
        <option value="">{t('at.new.chooseFurniture')}</option>
        {furniture.map((item) => (
          <option key={item.id} value={item.id}>
            {item.displayName} ({item.id})
          </option>
        ))}
      </select>
      <input
        className="control-input"
        placeholder={t('at.new.collectiveName')}
        value={draft.collectiveName}
        onChange={(event) => setDraft((value) => ({ ...value, collectiveName: event.target.value, itemId: '', itemName: '' }))}
      />
    </>
  )
}

function entryValue(value: Texture | undefined, key: keyof Texture, type: 'text' | 'number'): string | number {
  const result = value?.[key]
  return type === 'number' ? (typeof result === 'number' ? result : '') : typeof result === 'string' ? result : ''
}
