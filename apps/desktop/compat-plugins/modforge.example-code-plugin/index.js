/**
 * Example code plugin: a Stardew item-dex memory match game.
 * Exercises the full SDK surface in one real interaction flow:
 * - registerPage with a stateful React component (shared React instance)
 * - components (PanelFrame / PanelSection / EmptyStateCard / CompactSelect)
 * - game asset commands: loadGameDataAsset (Data/Objects), loadGameImage
 *   (Maps/springobjects atlas, cropped and upscaled 4x with smoothing off),
 *   scanGameAudio + loadGameAudioCue (XACT music cues as BGM, sound cues as SFX)
 * - resolveGameRoot fallback: without a game directory the game deals emoji
 *   faces from the bundled cards.json (readPluginAsset)
 * - notifications (win toast with session-best note; retracted on dispose)
 * - capabilities (plugin.id, host.locale for localized item names)
 * - i18n (t) for all user-visible copy
 * - module state + onDispose (session bests and the audio cache are cleared)
 * Styling is inline but token-based (var(--…)) — plugins have no stylesheet
 * entry, so colors must come from the design tokens.
 */
import React from 'react'

const h = React.createElement

const SPRITE_SIZE = 16
const RENDER_SCALE = 4
const SHOWCASE_SCALE = 6
const BGM_VOLUME = 0.35
const MISMATCH_REVEAL_MS = 700
const MAX_PAIRS = 10

const DIFFICULTIES = {
  easy: { pairs: 6, columns: 4 },
  normal: { pairs: 8, columns: 4 },
  hard: { pairs: 10, columns: 5 },
}

// Iconic items preferred as card faces; remaining slots fill from Data/Objects order.
const PREFERRED_ITEMS = [
  'Parsnip',
  'Potato',
  'Cauliflower',
  'Pumpkin',
  'Strawberry',
  'Blueberry',
  'Melon',
  'Starfruit',
  'Ancient Fruit',
  'Sweet Gem Berry',
  'Fiddlehead Fern',
  'Red Cabbage',
]

// Module-scoped session state: survives page unmounts because the plugin module
// stays loaded; cleared via ctx.onDispose when the plugin is torn down.
const sessionBest = new Map()
const audioCache = new Map()
const audioState = { bgm: null, bgmCue: null }

function stopBgm() {
  if (audioState.bgm) {
    audioState.bgm.pause()
    audioState.bgm.currentTime = 0
  }
  audioState.bgm = null
  audioState.bgmCue = null
}

async function ensureAudio(ctx, cue) {
  let audio = audioCache.get(cue)
  if (!audio) {
    const dataUrl = await ctx.commands.invoke('loadGameAudioCue', { cue })
    audio = new Audio(dataUrl)
    audioCache.set(cue, audio)
  }
  return audio
}

async function playBgm(ctx, cue) {
  if (!cue || audioState.bgmCue === cue) return
  stopBgm()
  try {
    const audio = await ensureAudio(ctx, cue)
    audio.loop = true
    audio.volume = BGM_VOLUME
    await audio.play()
    audioState.bgm = audio
    audioState.bgmCue = cue
  } catch {
    // BGM is best-effort; autoplay policies may still block it.
  }
}

async function playSfx(ctx, cue, volume = 0.5) {
  if (!cue) return
  try {
    const audio = await ensureAudio(ctx, cue)
    audio.loop = false
    audio.volume = volume
    audio.currentTime = 0
    await audio.play()
  } catch {
    // SFX are best-effort.
  }
}

function pickCue(cues, patterns, kind) {
  for (const pattern of patterns) {
    const hit = cues.find((entry) => entry.kind === kind && pattern.test(entry.cue))
    if (hit) return hit.cue
  }
  return null
}

function pickDefaultTrack(musicCues) {
  const preferred = [/stardew/i, /spring/i, /overture|main|theme/i]
  for (const pattern of preferred) {
    const hit = musicCues.find((cue) => pattern.test(cue))
    if (hit) return hit
  }
  return musicCues[0] ?? null
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('image decode failed'))
    image.src = src
  })
}

/** Crops one 16x16 sprite from the atlas and returns it upscaled with smoothing off. */
function renderSprite(atlas, columns, spriteIndex, scale = RENDER_SCALE) {
  const canvas = document.createElement('canvas')
  canvas.width = SPRITE_SIZE * scale
  canvas.height = SPRITE_SIZE * scale
  const context = canvas.getContext('2d')
  context.imageSmoothingEnabled = false
  context.drawImage(
    atlas,
    (spriteIndex % columns) * SPRITE_SIZE,
    Math.floor(spriteIndex / columns) * SPRITE_SIZE,
    SPRITE_SIZE,
    SPRITE_SIZE,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas.toDataURL()
}

/** Picks card faces from parsed Data/Objects and renders their atlas sprites. */
function extractItemFaces(objects, atlas, count) {
  const columns = Math.max(1, Math.floor(atlas.width / SPRITE_SIZE))
  const items = []
  for (const [id, data] of Object.entries(objects)) {
    if (!data || typeof data !== 'object') continue
    if (data.Texture && !String(data.Texture).endsWith('springobjects')) continue
    if (typeof data.SpriteIndex !== 'number' || !data.Name) continue
    items.push({
      key: id,
      label: data.DisplayName || data.Name,
      name: data.Name,
      spriteIndex: data.SpriteIndex,
      price: typeof data.Price === 'number' ? data.Price : null,
    })
  }
  const byName = new Map(items.map((item) => [item.name, item]))
  const chosen = []
  for (const name of PREFERRED_ITEMS) {
    const hit = byName.get(name)
    if (hit && !chosen.includes(hit)) chosen.push(hit)
    if (chosen.length >= count) break
  }
  for (const item of items) {
    if (chosen.length >= count) break
    if (!chosen.includes(item)) chosen.push(item)
  }
  return chosen.slice(0, count).map((item) => ({
    key: item.key,
    label: item.label,
    price: item.price,
    emoji: null,
    image: renderSprite(atlas, columns, item.spriteIndex),
    showcaseImage: renderSprite(atlas, columns, item.spriteIndex, SHOWCASE_SCALE),
  }))
}

/** Loads card faces from the game, falling back to bundled emoji without one. */
async function loadFaces(ctx, locale) {
  try {
    const [objectsAsset, atlasUrl] = await Promise.all([
      ctx.commands.invoke('loadGameDataAsset', { assetPath: 'Data/Objects', locale }),
      ctx.commands.invoke('loadGameImage', { contentPath: 'Maps/springobjects', locale }),
    ])
    const atlas = await loadImage(atlasUrl)
    const faces = extractItemFaces(JSON.parse(objectsAsset.content), atlas, MAX_PAIRS)
    if (faces.length >= DIFFICULTIES.easy.pairs) return { faces, usedFallback: false }
    throw new Error('not enough item sprites')
  } catch {
    const raw = await ctx.commands.invoke('readPluginAsset', { path: 'cards.json' })
    const faces = JSON.parse(raw).faces.map((emoji) => ({
      key: emoji,
      label: emoji,
      price: null,
      emoji,
      image: null,
      showcaseImage: null,
    }))
    return { faces, usedFallback: true }
  }
}

function shuffle(items) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

function dealDeck(faces, pairs) {
  return shuffle(faces.slice(0, pairs).flatMap((face) => [face, face]))
}

function formatSeconds(total) {
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// Token-based inline styles — no hardcoded colors, everything follows the theme.
const styles = {
  toolbar: { display: 'flex', alignItems: 'center', gap: 8 },
  button: {
    padding: '6px 12px',
    borderRadius: 6,
    border: '1px solid var(--border-color)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 12,
  },
  primaryButton: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid transparent',
    background: 'var(--accent)',
    color: 'var(--accent-contrast)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  columns: { display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' },
  boardColumn: { flex: '1 1 380px', minWidth: 320 },
  sideColumn: { flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 12 },
  stats: {
    display: 'flex',
    gap: 16,
    marginBottom: 12,
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  fallbackNote: { marginBottom: 12, fontSize: 12, color: 'var(--warning)' },
  grid: (columns) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: 8,
    maxWidth: 560,
  }),
  card: (faceUp, matched) => ({
    aspectRatio: '1',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 30,
    borderRadius: 8,
    border: '1px solid var(--border-color)',
    background: matched ? 'var(--success-soft)' : faceUp ? 'var(--bg-elevated)' : 'var(--bg-panel-muted)',
    color: faceUp ? 'var(--text-primary)' : 'var(--text-secondary)',
    cursor: matched ? 'default' : 'pointer',
    transition: 'background 120ms ease, transform 120ms ease',
    userSelect: 'none',
    padding: 6,
  }),
  cardImage: { width: '100%', height: '100%', objectFit: 'contain', imageRendering: 'pixelated' },
  showcaseBody: { display: 'flex', alignItems: 'center', gap: 12, minHeight: 96 },
  showcaseImage: { width: 96, height: 96, imageRendering: 'pixelated', flexShrink: 0 },
  showcaseEmoji: { fontSize: 64, lineHeight: 1, flexShrink: 0 },
  showcaseName: { fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' },
  showcasePrice: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 },
  showcaseEmpty: { fontSize: 12, color: 'var(--text-secondary)' },
  soundtrackStatus: { marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' },
}

function MemoryMatchPage({ ctx }) {
  const { PanelFrame, PanelSection, EmptyStateCard, CompactSelect } = ctx.components
  const t = ctx.i18n.t

  const [faces, setFaces] = React.useState(null)
  const [usedFallback, setUsedFallback] = React.useState(false)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [difficulty, setDifficulty] = React.useState('easy')
  const [deck, setDeck] = React.useState([])
  const [flipped, setFlipped] = React.useState([])
  const [matched, setMatched] = React.useState(() => new Set())
  const [locked, setLocked] = React.useState(false)
  const [moves, setMoves] = React.useState(0)
  const [seconds, setSeconds] = React.useState(0)
  const [started, setStarted] = React.useState(false)
  const [lastMatch, setLastMatch] = React.useState(null)
  const [musicCues, setMusicCues] = React.useState([])
  const [selectedTrack, setSelectedTrack] = React.useState(null)
  const [musicOn, setMusicOn] = React.useState(true)
  const sfxRef = React.useRef({ flip: null, match: null, win: null })

  const won = deck.length > 0 && matched.size === deck.length
  const best = sessionBest.get(difficulty)

  // Load card faces (game items, or the bundled emoji fallback) and audio cues.
  React.useEffect(() => {
    let alive = true
    const locale = String(ctx.capabilities.get('host.locale') || 'en-US')
    loadFaces(ctx, locale)
      .then((result) => {
        if (!alive) return
        setFaces(result.faces)
        setUsedFallback(result.usedFallback)
      })
      .catch(() => {
        if (alive) setLoadFailed(true)
      })
    ctx.commands
      .invoke('scanGameAudio')
      .then((cues) => {
        if (!alive || !Array.isArray(cues)) return
        sfxRef.current = {
          flip: pickCue(cues, [/^(shwip|select|pickup)$/i, /select|click|shwip/i], 'sound'),
          match: pickCue(cues, [/^coin$/i, /coin|reward|purchase/i], 'sound'),
          win: pickCue(cues, [/reward|level.?up|achievement|yoba/i, /^coin$/i], 'sound'),
        }
        const music = cues.filter((entry) => entry.kind === 'music').map((entry) => entry.cue)
        setMusicCues(music)
        setSelectedTrack((current) => current ?? pickDefaultTrack(music))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [ctx])

  // Deal a fresh deck once faces arrive or the difficulty changes.
  React.useEffect(() => {
    if (!faces) return
    setDeck(dealDeck(faces, DIFFICULTIES[difficulty].pairs))
    setFlipped([])
    setMatched(new Set())
    setLocked(false)
    setMoves(0)
    setSeconds(0)
    setStarted(false)
    setLastMatch(null)
  }, [faces, difficulty])

  // Game clock: runs from the first flip until the board is cleared.
  React.useEffect(() => {
    if (!started || won) return undefined
    const timer = setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [started, won])

  // Stop the BGM when the page unmounts.
  React.useEffect(() => () => stopBgm(), [])

  // Victory: record the session best, play the jingle, raise a toast.
  React.useEffect(() => {
    if (!won) return
    void playSfx(ctx, sfxRef.current.win, 0.6)
    const previous = sessionBest.get(difficulty)
    const isNewBest = !previous || moves < previous.moves
    if (isNewBest) sessionBest.set(difficulty, { moves, seconds })
    ctx.notifications.publish({
      id: 'memory-match-win',
      level: 'success',
      title: t('game.win.title'),
      summary: t('game.win.detail').replace('{time}', formatSeconds(seconds)).replace('{moves}', String(moves)),
      note: isNewBest ? t('game.win.newBest') : undefined,
      autoDismissMs: 5000,
    })
  }, [won]) // fire once per victory; ctx/t/moves/seconds are fresh in the winning render

  const restart = () => {
    if (!faces) return
    setDeck(dealDeck(faces, DIFFICULTIES[difficulty].pairs))
    setFlipped([])
    setMatched(new Set())
    setLocked(false)
    setMoves(0)
    setSeconds(0)
    setStarted(false)
    setLastMatch(null)
  }

  const toggleMusic = () => {
    if (musicOn) {
      setMusicOn(false)
      stopBgm()
      return
    }
    setMusicOn(true)
    if (started && selectedTrack) void playBgm(ctx, selectedTrack)
  }

  const changeTrack = (cue) => {
    setSelectedTrack(cue)
    if (musicOn && started) void playBgm(ctx, cue)
  }

  const flipCard = (index) => {
    if (locked || won || flipped.includes(index) || matched.has(index)) return
    if (!started) {
      setStarted(true)
      // First click doubles as the audio autoplay gesture.
      if (musicOn && selectedTrack) void playBgm(ctx, selectedTrack)
    }
    void playSfx(ctx, sfxRef.current.flip, 0.4)
    const next = [...flipped, index]
    setFlipped(next)
    if (next.length < 2) return
    setMoves((value) => value + 1)
    if (deck[next[0]].key === deck[next[1]].key) {
      setMatched((current) => new Set([...current, next[0], next[1]]))
      setLastMatch(deck[next[0]])
      setFlipped([])
      void playSfx(ctx, sfxRef.current.match, 0.5)
      return
    }
    setLocked(true)
    setTimeout(() => {
      setFlipped([])
      setLocked(false)
    }, MISMATCH_REVEAL_MS)
  }

  if (loadFailed) {
    return h(PanelFrame, {
      title: t('game.error.title'),
      children: h(EmptyStateCard, { title: t('game.error.title'), detail: t('game.error.detail'), density: 'compact' }),
    })
  }
  if (!faces) {
    return h(PanelFrame, {
      title: t('game.loading.title'),
      children: h(EmptyStateCard, { title: t('game.loading.title'), detail: t('game.loading.detail'), density: 'compact' }),
    })
  }

  const headerAction = h(
    'div',
    { style: styles.toolbar },
    h(CompactSelect, {
      value: difficulty,
      ariaLabel: t('game.difficulty'),
      options: Object.keys(DIFFICULTIES).map((key) => ({ value: key, label: t(`game.difficulty.${key}`) })),
      onChange: setDifficulty,
    }),
    h(
      'button',
      {
        type: 'button',
        style: { ...styles.button, opacity: musicCues.length === 0 ? 0.5 : 1 },
        onClick: toggleMusic,
        disabled: musicCues.length === 0,
      },
      musicOn ? t('game.soundtrack.on') : t('game.soundtrack.off'),
    ),
    h('button', { type: 'button', style: styles.button, onClick: restart }, t('game.restart')),
  )

  const stats = h(
    'div',
    { style: styles.stats },
    h('span', null, `${t('game.moves')}: ${moves}`),
    h('span', null, `${t('game.time')}: ${formatSeconds(seconds)}`),
    h('span', null, `${t('game.pairs')}: ${matched.size / 2}/${deck.length / 2}`),
    h('span', null, `${t('game.best')}: ${best ? `${best.moves} ${t('game.best.moves')}` : '—'}`),
  )

  const grid = h(
    'div',
    { style: styles.grid(DIFFICULTIES[difficulty].columns) },
    deck.map((face, index) => {
      const faceUp = flipped.includes(index) || matched.has(index)
      return h(
        'button',
        {
          key: index,
          type: 'button',
          style: styles.card(faceUp, matched.has(index)),
          onClick: () => flipCard(index),
          'aria-label': faceUp ? face.label : t('game.card.hidden'),
        },
        faceUp ? (face.image ? h('img', { src: face.image, alt: face.label, style: styles.cardImage }) : face.emoji) : '✦',
      )
    }),
  )

  const board = h(
    'div',
    { style: styles.boardColumn },
    h(
      PanelSection,
      { title: t('game.board') },
      usedFallback ? h('div', { style: styles.fallbackNote }, t('game.fallbackNote')) : null,
      stats,
      won
        ? h(EmptyStateCard, {
            title: t('game.win.title'),
            detail: t('game.win.detail').replace('{time}', formatSeconds(seconds)).replace('{moves}', String(moves)),
            density: 'compact',
            primaryAction: h('button', { type: 'button', style: styles.primaryButton, onClick: restart }, t('game.win.action')),
          })
        : grid,
    ),
  )

  const showcase = h(
    PanelSection,
    { title: t('game.showcase') },
    lastMatch
      ? h(
          'div',
          { style: styles.showcaseBody },
          lastMatch.showcaseImage
            ? h('img', { src: lastMatch.showcaseImage, alt: lastMatch.label, style: styles.showcaseImage })
            : h('span', { style: styles.showcaseEmoji }, lastMatch.emoji),
          h(
            'div',
            null,
            h('div', { style: styles.showcaseName }, lastMatch.label),
            lastMatch.price != null
              ? h('div', { style: styles.showcasePrice }, t('game.price').replace('{price}', String(lastMatch.price)))
              : null,
          ),
        )
      : h('div', { style: styles.showcaseEmpty }, t('game.showcase.empty')),
  )

  const soundtrack = h(
    PanelSection,
    { title: t('game.soundtrack') },
    musicCues.length > 0
      ? h(CompactSelect, {
          value: selectedTrack ?? '',
          ariaLabel: t('game.soundtrack.track'),
          placeholder: t('game.soundtrack.track'),
          options: musicCues.map((cue) => ({ value: cue, label: cue })),
          onChange: changeTrack,
        })
      : h('div', { style: styles.showcaseEmpty }, t('game.soundtrack.none')),
    h(
      'div',
      { style: styles.soundtrackStatus },
      musicCues.length > 0
        ? musicOn && audioState.bgmCue
          ? t('game.soundtrack.nowPlaying').replace('{cue}', audioState.bgmCue)
          : t('game.soundtrack.idle')
        : null,
    ),
  )

  return h(
    PanelFrame,
    {
      title: t('example.page.title'),
      subtitle: t('game.subtitle').replace('{pluginId}', String(ctx.capabilities.get('plugin.id'))),
      headerAction,
    },
    h('div', { style: styles.columns }, board, h('div', { style: styles.sideColumn }, showcase, soundtrack)),
  )
}

const pluginModule = {
  sdkVersion: '1.0.0',
  activate(ctx) {
    ctx.registerPage({
      id: 'example-code-page',
      section: 'tools',
      order: 990,
      icon: 'beaker',
      titleKey: 'example.page.title',
      presentation: 'standalone',
      projectAccess: 'none',
      component: () => h(MemoryMatchPage, { ctx }),
    })

    // Session bests and decoded audio live in module scope; dispose clears them.
    ctx.onDispose(() => {
      sessionBest.clear()
      stopBgm()
      audioCache.clear()
    })
  },
}

export default pluginModule
