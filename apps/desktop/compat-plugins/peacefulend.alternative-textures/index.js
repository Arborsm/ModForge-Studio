import React from 'react'
import { Fragment, jsx, jsxs } from 'react/jsx-runtime'
//#region compat-plugins/peacefulend.alternative-textures/src/AlternativeTexturesPage.tsx
const TEXTURE_TYPES = [
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
]
const FRAME_TYPES = ['Default', 'MachineIdle', 'MachineActive']
const ROOT = 'Textures'
const SEASONS = ['spring', 'summer', 'fall', 'winter']
const blank = {
  Type: 'Unknown',
  Variations: 1,
  TextureWidth: 16,
  TextureHeight: 16,
  ManualVariations: [],
  Animation: [],
}
const imageCache = /* @__PURE__ */ new Map()
function split(value) {
  return (
    value
      ?.split(',')
      .map((item) => item.trim())
      .filter(Boolean) ?? []
  )
}
function text(value) {
  return (value ?? []).join(', ')
}
/** Host command policies reject outdated calls with a supersede notice; that is normal task ownership, not a failure. */
function isSuperseded(reason) {
  return String(reason instanceof Error ? reason.message : reason)
    .toLowerCase()
    .includes('superseded')
}
/** Tints are RGBA quads; edited as `r,g,b,a; r,g,b,a`. */
function formatTints(tints) {
  return (tints ?? []).map((tint) => tint.join(', ')).join('; ')
}
function parseTints(value) {
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
function loadModImage(ctx, path) {
  if (!path) return Promise.resolve(null)
  const cached = imageCache.get(path)
  if (cached) return cached
  const request = ctx.commands.invoke('loadModImage', { path }).catch(() => null)
  imageCache.set(path, request)
  return request
}
/**
 * AT resolves an entry's texture as `texture.png` (all variations in one
 * sheet) or, when that file is absent, split per-variation `texture_1.png`,
 * `texture_2.png`, ... — so the preview candidates are the listed image path
 * plus the first split file.
 */
function previewCandidates(entry) {
  return [entry.entryImagePath, `${entry.entryDir}/texture_1.png`].filter((path) => Boolean(path))
}
/** Returns the first candidate image path that actually loads, or null. */
async function resolvePreviewPath(ctx, candidates) {
  for (const path of candidates) if (await loadModImage(ctx, path)) return path
  return null
}
function ModImage({ ctx, entryImagePath, entryDir, className, alt }) {
  const [src, setSrc] = React.useState(null)
  React.useEffect(() => {
    let alive = true
    const run = async () => {
      const path = await resolvePreviewPath(
        ctx,
        [entryImagePath, `${entryDir}/texture_1.png`].filter((candidate) => Boolean(candidate)),
      )
      if (!alive) return
      if (!path) {
        setSrc(null)
        return
      }
      const value = await loadModImage(ctx, path)
      if (alive) setSrc(value)
    }
    run().catch(() => {
      if (alive) setSrc(null)
    })
    return () => {
      alive = false
    }
  }, [ctx, entryImagePath, entryDir])
  return src
    ? /* @__PURE__ */ jsx('img', {
        className,
        src,
        alt,
      })
    : /* @__PURE__ */ jsx('span', {
        className: `${className ?? ''} at-image-placeholder`,
        'aria-label': alt,
      })
}
function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      resolve(typeof result === 'string' ? (result.split(',')[1] ?? '') : '')
    }
    reader.onerror = () => reject(reader.error ?? /* @__PURE__ */ new Error('image read failed'))
    reader.readAsDataURL(file)
  })
}
function AlternativeTexturesPage({ ctx }) {
  const { WorkspaceSplitView, CompactSelect, Disclosure, EmptyStateCard } = ctx.components
  const t = (key) => ctx.i18n.t(key)
  const [entries, setEntries] = React.useState([])
  const [selectedKey, setSelectedKey] = React.useState(null)
  const [query, setQuery] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [newOpen, setNewOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [furniture, setFurniture] = React.useState([])
  const [mountDialog, setMountDialog] = React.useState(null)
  const [draft, setDraft] = React.useState({
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
  const invoke = React.useCallback((name, args) => ctx.commands.invoke(name, args), [ctx])
  const reload = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    let superseded = false
    try {
      const loaded = await invoke('listModDirectory', {
        rootSubdir: ROOT,
        entryFile: 'texture.json',
        entryImage: 'texture.png',
        includeContentPacks: true,
      })
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
          const raw = await invoke('readModFile', {
            rootSubdir: ROOT,
            entryId: entry.id,
            entryFile: 'texture.json',
            sourceModRoot: entry.sourceModRoot,
          })
          setEntries((all) =>
            all.map((item) =>
              item.id === entry.id && item.sourceModRoot === entry.sourceModRoot
                ? {
                    ...item,
                    value: raw?.content ?? blank,
                  }
                : item,
            ),
          )
        }),
      )
    } catch (reason) {
      if (isSuperseded(reason)) superseded = true
      else setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (!superseded) setLoading(false)
    }
  }, [invoke])
  React.useEffect(() => {
    reload().catch(() => void 0)
    invoke('loadGameDataAsset', { assetPath: 'Data/Furniture' })
      .then((asset) => {
        if (!asset) return
        const data = JSON.parse(asset.content)
        setFurniture(
          Object.entries(data).flatMap(([id, value]) => {
            if (!value || typeof value !== 'object') return []
            const item = value
            const name = typeof item.Name === 'string' ? item.Name : id
            return [
              {
                id,
                name,
                displayName: typeof item.DisplayName === 'string' ? item.DisplayName : name,
              },
            ]
          }),
        )
      })
      .catch(() => void 0)
  }, [invoke, reload])
  const update = (patch) => {
    if (!selected) return
    setEntries((all) =>
      all.map((entry) =>
        entry.sourceModRoot === selected.sourceModRoot && entry.id === selected.id
          ? {
              ...entry,
              value: {
                ...entry.value,
                ...patch,
              },
            }
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
      ctx.notifications.publish({
        id: 'at-save',
        level: 'success',
        title: t('at.editor.saveSuccess'),
        autoDismissMs: 3e3,
      })
    } catch (reason) {
      ctx.notifications.publish({
        id: 'at-save',
        level: 'error',
        title: t('at.editor.saveError'),
        summary: reason instanceof Error ? reason.message : String(reason),
        autoDismissMs: 5e3,
      })
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    if (!selected || !window.confirm(t('at.editor.deleteConfirm'))) return
    try {
      await invoke('deleteModEntry', {
        rootSubdir: ROOT,
        entryId: selected.id,
        sourceModRoot: selected.sourceModRoot,
      })
      ctx.notifications.publish({
        id: 'at-delete',
        level: 'success',
        title: t('at.editor.deleteSuccess'),
        autoDismissMs: 3e3,
      })
      await reload()
    } catch (reason) {
      ctx.notifications.publish({
        id: 'at-delete',
        level: 'error',
        title: t('at.editor.deleteError'),
        summary: reason instanceof Error ? reason.message : String(reason),
        autoDismissMs: 5e3,
      })
    }
  }
  const create = async () => {
    if (!/^[^\\/:*?"<>|.][^\\/:*?"<>|]*$/.test(draft.id.trim())) return
    if (!draft.itemName && !draft.itemId && !draft.collectiveName) return
    const content = {
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
      await invoke('writeModFile', {
        rootSubdir: ROOT,
        entryId: draft.id.trim(),
        entryFile: 'texture.json',
        content,
      })
      if (draft.image) {
        const contentBase64 = await readImage(draft.image)
        await invoke('writeModEntryImage', {
          rootSubdir: ROOT,
          entryId: draft.id.trim(),
          imageFile: 'texture.png',
          contentBase64,
        })
      }
      const createdId = draft.id.trim()
      setNewOpen(false)
      setDraft({
        id: '',
        itemName: '',
        itemId: '',
        collectiveName: '',
        type: 'Furniture',
        width: 16,
        height: 16,
        variations: 1,
      })
      await reload()
      const createdEntry = (
        await invoke('listModDirectory', {
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
        autoDismissMs: 5e3,
      })
    }
  }
  const editVariation = (index, patch) => {
    if (selected?.value)
      update({
        ManualVariations: selected.value.ManualVariations?.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                ...patch,
              }
            : item,
        ),
      })
  }
  const editAnimation = (index, patch) => {
    if (selected?.value)
      update({
        Animation: selected.value.Animation?.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                ...patch,
              }
            : item,
        ),
      })
  }
  const field = (label, key, type = 'text') =>
    /* @__PURE__ */ jsxs('label', {
      className: 'at-field',
      children: [
        /* @__PURE__ */ jsx('span', { children: label }),
        /* @__PURE__ */ jsx('input', {
          className: 'control-input',
          type,
          value: entryValue(selected?.value, key, type),
          onChange: (event) => update({ [key]: type === 'number' ? Number(event.target.value) : event.target.value }),
        }),
      ],
    })
  const mountedListField = (label, key) => {
    const value = selected?.value?.[key]
    if (!value?.length) return null
    return /* @__PURE__ */ jsxs(
      'div',
      {
        className: 'at-field at-mounted',
        children: [
          /* @__PURE__ */ jsx('span', { children: label }),
          /* @__PURE__ */ jsx('input', {
            className: 'control-input',
            value: text(value),
            onChange: (event) => update({ [key]: split(event.target.value) }),
          }),
          /* @__PURE__ */ jsx('button', {
            className: 'control-button',
            type: 'button',
            onClick: () => update({ [key]: void 0 }),
            children: t('at.action.remove'),
          }),
        ],
      },
      key,
    )
  }
  const hasItemIdentity = Boolean(selected?.value?.ItemName || selected?.value?.ItemId)
  const editor = selected
    ? /* @__PURE__ */ jsxs('div', {
        className: 'at-editor',
        children: [
          /* @__PURE__ */ jsxs('div', {
            className: 'at-toolbar',
            children: [
              /* @__PURE__ */ jsx('span', {
                className: 'at-id',
                children: selected.id,
              }),
              /* @__PURE__ */ jsx('span', {
                className: 'at-meta',
                children: selected.sourceModName,
              }),
              /* @__PURE__ */ jsx('button', {
                className: 'control-button text-danger',
                type: 'button',
                onClick: () => void remove(),
                children: t('at.editor.delete'),
              }),
              /* @__PURE__ */ jsx('button', {
                className: 'control-button control-button-primary',
                type: 'button',
                disabled: saving,
                onClick: () => void save(),
                children: t('at.editor.save'),
              }),
            ],
          }),
          /* @__PURE__ */ jsxs('div', {
            className: 'at-preview',
            children: [
              /* @__PURE__ */ jsx(ModImage, {
                ctx,
                entryImagePath: selected.entryImagePath,
                entryDir: selected.entryDir,
                className: 'at-preview-image',
                alt: selected.id,
              }),
              /* @__PURE__ */ jsxs('label', {
                className: 'at-upload control-button',
                children: [
                  t('at.preview.replace'),
                  /* @__PURE__ */ jsx('input', {
                    className: 'at-file-input',
                    type: 'file',
                    accept: 'image/png,image/*',
                    onChange: (event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      if (!file) return
                      resolvePreviewPath(ctx, previewCandidates(selected))
                        .then(async (existing) => {
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
                          ctx.notifications.publish({
                            id: 'at-image',
                            level: 'success',
                            title: t('at.preview.uploadSuccess'),
                            autoDismissMs: 3e3,
                          })
                          return reload()
                        })
                        .catch((reason) =>
                          ctx.notifications.publish({
                            id: 'at-image',
                            level: 'error',
                            title: t('at.preview.uploadError'),
                            summary: reason instanceof Error ? reason.message : String(reason),
                            autoDismissMs: 5e3,
                          }),
                        )
                    },
                  }),
                ],
              }),
            ],
          }),
          /* @__PURE__ */ jsxs('section', {
            children: [
              /* @__PURE__ */ jsx('h3', { children: t('at.section.identity') }),
              selected.value && hasItemIdentity
                ? /* @__PURE__ */ jsxs('div', {
                    className: 'at-field at-mounted',
                    children: [
                      /* @__PURE__ */ jsx('span', { children: t('at.mount.item') }),
                      /* @__PURE__ */ jsxs('div', {
                        className: 'at-mounted-inputs',
                        children: [
                          /* @__PURE__ */ jsx('input', {
                            className: 'control-input',
                            'aria-label': t('at.field.itemName'),
                            placeholder: t('at.field.itemName'),
                            value: selected.value.ItemName ?? '',
                            onChange: (event) => update({ ItemName: event.target.value }),
                          }),
                          /* @__PURE__ */ jsx('input', {
                            className: 'control-input',
                            'aria-label': t('at.field.itemId'),
                            placeholder: t('at.field.itemId'),
                            value: selected.value.ItemId ?? '',
                            onChange: (event) => update({ ItemId: event.target.value }),
                          }),
                        ],
                      }),
                      /* @__PURE__ */ jsx('button', {
                        className: 'control-button',
                        type: 'button',
                        onClick: () =>
                          update({
                            ItemName: void 0,
                            ItemId: void 0,
                          }),
                        children: t('at.action.remove'),
                      }),
                    ],
                  })
                : null,
              mountedListField(t('at.field.collectiveNames'), 'CollectiveNames'),
              mountedListField(t('at.field.collectiveIds'), 'CollectiveIds'),
              !(hasItemIdentity && selected.value?.CollectiveNames?.length && selected.value?.CollectiveIds?.length)
                ? /* @__PURE__ */ jsx('button', {
                    className: 'control-button',
                    type: 'button',
                    onClick: () => setMountDialog({ section: 'identity' }),
                    children: t('at.mount.addIdentity'),
                  })
                : null,
            ],
          }),
          /* @__PURE__ */ jsxs('section', {
            children: [
              /* @__PURE__ */ jsx('h3', { children: t('at.section.texture') }),
              /* @__PURE__ */ jsxs('label', {
                className: 'at-field',
                children: [
                  /* @__PURE__ */ jsx('span', { children: t('at.field.type') }),
                  /* @__PURE__ */ jsx(CompactSelect, {
                    value: selected.value?.Type ?? 'Unknown',
                    ariaLabel: t('at.field.type'),
                    options: TEXTURE_TYPES.map((value) => ({
                      value,
                      label: value,
                    })),
                    onChange: (value) => update({ Type: value }),
                  }),
                ],
              }),
              field(t('at.field.textureWidth'), 'TextureWidth', 'number'),
              field(t('at.field.textureHeight'), 'TextureHeight', 'number'),
              field(t('at.field.variations'), 'Variations', 'number'),
              field(t('at.field.defaultVariation'), 'DefaultVariation', 'number'),
              /* @__PURE__ */ jsxs('label', {
                className: 'at-check',
                children: [
                  /* @__PURE__ */ jsx('input', {
                    type: 'checkbox',
                    checked: selected.value?.IgnoreBuildingColorMask ?? false,
                    onChange: (event) => update({ IgnoreBuildingColorMask: event.target.checked }),
                  }),
                  t('at.field.ignoreBuildingColorMask'),
                ],
              }),
            ],
          }),
          /* @__PURE__ */ jsxs('section', {
            children: [
              /* @__PURE__ */ jsx('h3', { children: t('at.section.appearance') }),
              selected.value?.Seasons?.length
                ? /* @__PURE__ */ jsxs('div', {
                    className: 'at-field at-mounted',
                    children: [
                      /* @__PURE__ */ jsx('span', { children: t('at.field.seasons') }),
                      /* @__PURE__ */ jsx('button', {
                        className: 'control-button at-mounted-value',
                        type: 'button',
                        onClick: () =>
                          setMountDialog({
                            section: 'appearance',
                            fixedType: 'seasons',
                            initialSeasons: selected.value?.Seasons ?? [],
                          }),
                        children: selected.value.Seasons.map((season) => t(`at.season.${season}`)).join(', '),
                      }),
                      /* @__PURE__ */ jsx('button', {
                        className: 'control-button',
                        type: 'button',
                        onClick: () => update({ Seasons: void 0 }),
                        children: t('at.action.remove'),
                      }),
                    ],
                  })
                : null,
              mountedListField(t('at.field.keywords'), 'Keywords'),
              !(selected.value?.Seasons?.length && selected.value?.Keywords?.length)
                ? /* @__PURE__ */ jsx('button', {
                    className: 'control-button',
                    type: 'button',
                    onClick: () => setMountDialog({ section: 'appearance' }),
                    children: t('at.mount.addAppearance'),
                  })
                : null,
            ],
          }),
          /* @__PURE__ */ jsxs('section', {
            children: [
              /* @__PURE__ */ jsx('h3', { children: t('at.field.manualVariations') }),
              (selected.value?.ManualVariations ?? []).map((variation, index) =>
                /* @__PURE__ */ jsxs(
                  'div',
                  {
                    className: 'at-row',
                    children: [
                      /* @__PURE__ */ jsx('input', {
                        className: 'control-input',
                        'aria-label': t('at.field.manualVariationId'),
                        type: 'number',
                        value: variation.Id,
                        onChange: (event) => editVariation(index, { Id: Number(event.target.value) }),
                      }),
                      /* @__PURE__ */ jsx('input', {
                        className: 'control-input',
                        'aria-label': t('at.field.manualVariationName'),
                        value: variation.Name ?? '',
                        onChange: (event) => editVariation(index, { Name: event.target.value }),
                      }),
                      /* @__PURE__ */ jsx('input', {
                        className: 'control-input',
                        'aria-label': t('at.field.manualVariationChanceWeight'),
                        type: 'number',
                        step: '0.01',
                        value: variation.ChanceWeight ?? 1,
                        onChange: (event) => editVariation(index, { ChanceWeight: Number(event.target.value) }),
                      }),
                      /* @__PURE__ */ jsx('input', {
                        className: 'control-input',
                        'aria-label': t('at.field.tints'),
                        placeholder: t('at.field.tints'),
                        value: formatTints(variation.Tints),
                        onChange: (event) => editVariation(index, { Tints: parseTints(event.target.value) }),
                      }),
                      /* @__PURE__ */ jsx('button', {
                        className: 'control-button',
                        type: 'button',
                        onClick: () =>
                          update({ ManualVariations: selected.value?.ManualVariations?.filter((_, itemIndex) => itemIndex !== index) }),
                        children: t('at.action.remove'),
                      }),
                    ],
                  },
                  index,
                ),
              ),
              /* @__PURE__ */ jsx('button', {
                className: 'control-button',
                type: 'button',
                onClick: () =>
                  update({
                    ManualVariations: [
                      ...(selected.value?.ManualVariations ?? []),
                      {
                        Id: (selected.value?.ManualVariations?.length ?? 0) + 1,
                        ChanceWeight: 1,
                      },
                    ],
                  }),
                children: t('at.action.add'),
              }),
            ],
          }),
          /* @__PURE__ */ jsx(Disclosure, {
            title: t('at.section.advanced'),
            children: /* @__PURE__ */ jsxs('section', {
              children: [
                /* @__PURE__ */ jsx('h3', { children: t('at.field.animation') }),
                (selected.value?.Animation ?? []).map((animation, index) =>
                  /* @__PURE__ */ jsxs(
                    'div',
                    {
                      className: 'at-row',
                      children: [
                        /* @__PURE__ */ jsx('input', {
                          className: 'control-input',
                          type: 'number',
                          value: animation.Frame,
                          onChange: (event) => editAnimation(index, { Frame: Number(event.target.value) }),
                        }),
                        /* @__PURE__ */ jsx('input', {
                          className: 'control-input',
                          type: 'number',
                          value: animation.Duration ?? 1e3,
                          onChange: (event) => editAnimation(index, { Duration: Number(event.target.value) }),
                        }),
                        /* @__PURE__ */ jsx(CompactSelect, {
                          value: animation.Type ?? 'Default',
                          ariaLabel: t('at.field.animationType'),
                          options: FRAME_TYPES.map((value) => ({
                            value,
                            label: value,
                          })),
                          onChange: (value) => editAnimation(index, { Type: value }),
                        }),
                        /* @__PURE__ */ jsx('button', {
                          className: 'control-button',
                          type: 'button',
                          onClick: () => update({ Animation: selected.value?.Animation?.filter((_, itemIndex) => itemIndex !== index) }),
                          children: t('at.action.remove'),
                        }),
                      ],
                    },
                    index,
                  ),
                ),
                /* @__PURE__ */ jsx('button', {
                  className: 'control-button',
                  type: 'button',
                  onClick: () =>
                    update({
                      Animation: [
                        ...(selected.value?.Animation ?? []),
                        {
                          Frame: 0,
                          Duration: 1e3,
                          Type: 'Default',
                        },
                      ],
                    }),
                  children: t('at.action.add'),
                }),
              ],
            }),
          }),
        ],
      })
    : /* @__PURE__ */ jsx(EmptyStateCard, {
        title: t('at.editor.noSelection'),
        detail: t('at.empty.detail'),
        density: 'compact',
      })
  const filtered = entries.filter(
    (entry) => entry.id.toLowerCase().includes(query.toLowerCase()) || entry.value?.ItemName?.toLowerCase().includes(query.toLowerCase()),
  )
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [
      /* @__PURE__ */ jsx(WorkspaceSplitView, {
        sidebar: /* @__PURE__ */ jsxs('aside', {
          className: 'at-sidebar',
          children: [
            /* @__PURE__ */ jsxs('div', {
              className: 'at-list-toolbar',
              children: [
                /* @__PURE__ */ jsx('input', {
                  className: 'control-input',
                  placeholder: t('at.entryList.search'),
                  value: query,
                  onChange: (event) => setQuery(event.target.value),
                }),
                /* @__PURE__ */ jsx('button', {
                  className: 'control-button',
                  type: 'button',
                  onClick: () => setNewOpen(true),
                  children: t('at.action.new'),
                }),
              ],
            }),
            loading
              ? /* @__PURE__ */ jsx('p', { children: t('at.loading') })
              : error
                ? /* @__PURE__ */ jsx('p', {
                    className: 'at-error',
                    children: error,
                  })
                : filtered.map((entry) =>
                    /* @__PURE__ */ jsxs(
                      'button',
                      {
                        type: 'button',
                        className: `at-entry${entry.sourceModRoot + ':' + entry.id === selectedKey ? ' is-selected' : ''}`,
                        onClick: () => setSelectedKey(entry.sourceModRoot + ':' + entry.id),
                        children: [
                          /* @__PURE__ */ jsx(ModImage, {
                            ctx,
                            entryImagePath: entry.entryImagePath,
                            entryDir: entry.entryDir,
                            alt: '',
                          }),
                          entry.id,
                          /* @__PURE__ */ jsx('small', { children: entry.sourceModName }),
                        ],
                      },
                      `${entry.sourceModRoot}:${entry.id}`,
                    ),
                  ),
          ],
        }),
        sidebarWidth: '17rem',
        sidebarLabel: t('at.entryList.title'),
        mainClassName: 'at-main',
        children: editor,
      }),
      newOpen
        ? /* @__PURE__ */ jsx(NewEntryDialog, {
            ctx,
            t,
            furniture,
            draft,
            setDraft,
            onCancel: () => setNewOpen(false),
            onCreate: () => void create(),
          })
        : null,
      mountDialog && selected?.value
        ? /* @__PURE__ */ jsx(MountFieldDialog, {
            t,
            furniture,
            section: mountDialog.section,
            fixedType: mountDialog.fixedType,
            initialSeasons: mountDialog.initialSeasons,
            value: selected.value,
            onCancel: () => setMountDialog(null),
            onApply: (patch) => {
              update(patch)
              setMountDialog(null)
            },
          })
        : null,
    ],
  })
}
/** Dialog for mounting an optional field: pick what to add, then supply its value. */
function MountFieldDialog({ t, furniture, section, fixedType, initialSeasons, value, onCancel, onApply }) {
  const available =
    section === 'identity'
      ? [
          ...(value.ItemName || value.ItemId ? [] : ['item']),
          ...(value.CollectiveNames?.length ? [] : ['collectiveNames']),
          ...(value.CollectiveIds?.length ? [] : ['collectiveIds']),
        ]
      : [...(value.Seasons?.length ? [] : ['seasons']), ...(value.Keywords?.length ? [] : ['keywords'])]
  const [type, setType] = React.useState(fixedType ?? available[0] ?? null)
  const [textValue, setTextValue] = React.useState('')
  const [furnitureId, setFurnitureId] = React.useState('')
  const [seasons, setSeasons] = React.useState(initialSeasons ?? [])
  const typeLabel = (fieldType) =>
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
      if (item)
        onApply({
          ItemName: item.name,
          ItemId: item.id,
        })
    } else if (type === 'collectiveNames') onApply({ CollectiveNames: split(textValue) })
    else if (type === 'collectiveIds') onApply({ CollectiveIds: split(textValue) })
    else if (type === 'seasons') onApply({ Seasons: seasons })
    else if (type === 'keywords') onApply({ Keywords: split(textValue) })
  }
  const canConfirm =
    (type === 'item' && furnitureId.length > 0) ||
    (type === 'seasons' && seasons.length > 0) ||
    ((type === 'collectiveNames' || type === 'collectiveIds' || type === 'keywords') && split(textValue).length > 0)
  if (!type) return null
  return /* @__PURE__ */ jsxs('div', {
    className: 'at-dialog',
    role: 'dialog',
    'aria-modal': 'true',
    children: [
      /* @__PURE__ */ jsx('h2', { children: typeLabel(type) }),
      fixedType
        ? null
        : /* @__PURE__ */ jsxs('label', {
            children: [
              t('at.mount.fieldType'),
              /* @__PURE__ */ jsx('select', {
                className: 'control-input',
                value: type,
                onChange: (event) => setType(event.target.value),
                children: available.map((fieldType) =>
                  /* @__PURE__ */ jsx(
                    'option',
                    {
                      value: fieldType,
                      children: typeLabel(fieldType),
                    },
                    fieldType,
                  ),
                ),
              }),
            ],
          }),
      type === 'item'
        ? /* @__PURE__ */ jsxs('label', {
            children: [
              t('at.new.chooseFurniture'),
              /* @__PURE__ */ jsxs('select', {
                className: 'control-input',
                value: furnitureId,
                onChange: (event) => setFurnitureId(event.target.value),
                children: [
                  /* @__PURE__ */ jsx('option', {
                    value: '',
                    children: t('at.new.chooseFurniture'),
                  }),
                  furniture.map((item) =>
                    /* @__PURE__ */ jsxs(
                      'option',
                      {
                        value: item.id,
                        children: [item.displayName, ' (', item.id, ')'],
                      },
                      item.id,
                    ),
                  ),
                ],
              }),
            ],
          })
        : null,
      type === 'collectiveNames' || type === 'collectiveIds' || type === 'keywords'
        ? /* @__PURE__ */ jsxs('label', {
            children: [
              typeLabel(type),
              /* @__PURE__ */ jsx('input', {
                className: 'control-input',
                autoFocus: true,
                value: textValue,
                onChange: (event) => setTextValue(event.target.value),
              }),
            ],
          })
        : null,
      type === 'seasons'
        ? /* @__PURE__ */ jsx('div', {
            children: SEASONS.map((season) =>
              /* @__PURE__ */ jsxs(
                'label',
                {
                  className: 'at-check',
                  children: [
                    /* @__PURE__ */ jsx('input', {
                      type: 'checkbox',
                      checked: seasons.includes(season),
                      onChange: (event) =>
                        setSeasons((current) => (event.target.checked ? [...current, season] : current.filter((item) => item !== season))),
                    }),
                    t(`at.season.${season}`),
                  ],
                },
                season,
              ),
            ),
          })
        : null,
      /* @__PURE__ */ jsxs('div', {
        className: 'at-dialog-actions',
        children: [
          /* @__PURE__ */ jsx('button', {
            className: 'control-button',
            type: 'button',
            onClick: onCancel,
            children: t('at.action.cancel'),
          }),
          /* @__PURE__ */ jsx('button', {
            className: 'control-button control-button-primary',
            type: 'button',
            disabled: !canConfirm,
            onClick: confirm,
            children: t('at.action.confirm'),
          }),
        ],
      }),
    ],
  })
}
function NewEntryDialog({ ctx, t, furniture, draft, setDraft, onCancel, onCreate }) {
  const validId = /^[^\\/:*?"<>|.][^\\/:*?"<>|]*$/.test(draft.id.trim())
  return /* @__PURE__ */ jsxs('div', {
    className: 'at-dialog',
    role: 'dialog',
    'aria-modal': 'true',
    children: [
      /* @__PURE__ */ jsx('h2', { children: t('at.action.new') }),
      /* @__PURE__ */ jsxs('label', {
        children: [
          t('at.new.entryName'),
          /* @__PURE__ */ jsx('input', {
            className: 'control-input',
            autoFocus: true,
            value: draft.id,
            onChange: (event) =>
              setDraft((value) => ({
                ...value,
                id: event.target.value,
              })),
          }),
        ],
      }),
      /* @__PURE__ */ jsxs('label', {
        children: [
          t('at.new.identifier'),
          /* @__PURE__ */ jsx(CompactItemSelect, {
            ctx,
            t,
            furniture,
            draft,
            setDraft,
          }),
        ],
      }),
      /* @__PURE__ */ jsxs('label', {
        children: [
          t('at.field.type'),
          /* @__PURE__ */ jsx('select', {
            className: 'control-input',
            value: draft.type,
            onChange: (event) =>
              setDraft((value) => ({
                ...value,
                type: event.target.value,
              })),
            children: TEXTURE_TYPES.map((value) => /* @__PURE__ */ jsx('option', { children: value }, value)),
          }),
        ],
      }),
      /* @__PURE__ */ jsxs('div', {
        className: 'at-new-grid',
        children: [
          /* @__PURE__ */ jsxs('label', {
            children: [
              t('at.field.textureWidth'),
              /* @__PURE__ */ jsx('input', {
                className: 'control-input',
                type: 'number',
                min: '1',
                value: draft.width,
                onChange: (event) =>
                  setDraft((value) => ({
                    ...value,
                    width: Number(event.target.value),
                  })),
              }),
            ],
          }),
          /* @__PURE__ */ jsxs('label', {
            children: [
              t('at.field.textureHeight'),
              /* @__PURE__ */ jsx('input', {
                className: 'control-input',
                type: 'number',
                min: '1',
                value: draft.height,
                onChange: (event) =>
                  setDraft((value) => ({
                    ...value,
                    height: Number(event.target.value),
                  })),
              }),
            ],
          }),
          /* @__PURE__ */ jsxs('label', {
            children: [
              t('at.field.variations'),
              /* @__PURE__ */ jsx('input', {
                className: 'control-input',
                type: 'number',
                min: '1',
                value: draft.variations,
                onChange: (event) =>
                  setDraft((value) => ({
                    ...value,
                    variations: Number(event.target.value),
                  })),
              }),
            ],
          }),
        ],
      }),
      /* @__PURE__ */ jsxs('label', {
        children: [
          t('at.preview.replace'),
          /* @__PURE__ */ jsxs('span', {
            className: 'at-upload control-button',
            children: [
              draft.image ? draft.image.name : t('at.preview.choose'),
              /* @__PURE__ */ jsx('input', {
                className: 'at-file-input',
                type: 'file',
                accept: 'image/png,image/*',
                onChange: (event) =>
                  setDraft((value) => ({
                    ...value,
                    image: event.target.files?.[0],
                  })),
              }),
            ],
          }),
        ],
      }),
      /* @__PURE__ */ jsxs('div', {
        className: 'at-dialog-actions',
        children: [
          /* @__PURE__ */ jsx('button', {
            className: 'control-button',
            type: 'button',
            onClick: onCancel,
            children: t('at.action.cancel'),
          }),
          /* @__PURE__ */ jsx('button', {
            className: 'control-button control-button-primary',
            type: 'button',
            disabled: !validId || (!draft.itemName && !draft.itemId && !draft.collectiveName),
            onClick: onCreate,
            children: t('at.action.new'),
          }),
        ],
      }),
    ],
  })
}
function CompactItemSelect({ t, furniture, draft, setDraft }) {
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [
      /* @__PURE__ */ jsxs('select', {
        className: 'control-input',
        value: draft.itemId,
        onChange: (event) => {
          const item = furniture.find((value) => value.id === event.target.value)
          setDraft((value) => ({
            ...value,
            itemId: event.target.value,
            itemName: item?.name ?? '',
          }))
        },
        children: [
          /* @__PURE__ */ jsx('option', {
            value: '',
            children: t('at.new.chooseFurniture'),
          }),
          furniture.map((item) =>
            /* @__PURE__ */ jsxs(
              'option',
              {
                value: item.id,
                children: [item.displayName, ' (', item.id, ')'],
              },
              item.id,
            ),
          ),
        ],
      }),
      /* @__PURE__ */ jsx('input', {
        className: 'control-input',
        placeholder: t('at.new.collectiveName'),
        value: draft.collectiveName,
        onChange: (event) =>
          setDraft((value) => ({
            ...value,
            collectiveName: event.target.value,
            itemId: '',
            itemName: '',
          })),
      }),
    ],
  })
}
function entryValue(value, key, type) {
  const result = value?.[key]
  return type === 'number' ? (typeof result === 'number' ? result : '') : typeof result === 'string' ? result : ''
}
//#endregion
//#region compat-plugins/peacefulend.alternative-textures/src/index.tsx
const pluginModule = {
  sdkVersion: '1.0.0',
  activate(ctx) {
    ctx.registerPage({
      id: 'at-texture-editor',
      section: 'tools',
      order: 900,
      icon: 'images',
      titleKey: 'at.page.title',
      presentation: 'standalone',
      projectAccess: 'none',
      component: () => /* @__PURE__ */ jsx(AlternativeTexturesPage, { ctx }),
    })
  },
}
//#endregion
export { pluginModule as default }
