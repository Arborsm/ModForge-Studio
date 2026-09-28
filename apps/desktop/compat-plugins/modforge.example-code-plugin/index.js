import React from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'
//#region compat-plugins/modforge.example-code-plugin/src/constants.ts
const BGM_VOLUME = 0.35
const DIFFICULTIES = {
  easy: {
    pairs: 6,
    columns: 4,
  },
  normal: {
    pairs: 8,
    columns: 4,
  },
  hard: {
    pairs: 10,
    columns: 5,
  },
}
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
//#endregion
//#region compat-plugins/modforge.example-code-plugin/src/audio.ts
const audioCache = /* @__PURE__ */ new Map()
const audioState = {
  bgm: null,
  bgmCue: null,
}
function getBgmCue() {
  return audioState.bgmCue
}
function stopBgm() {
  if (audioState.bgm) {
    audioState.bgm.pause()
    audioState.bgm.currentTime = 0
  }
  audioState.bgm = null
  audioState.bgmCue = null
}
function clearAudioCache() {
  audioCache.clear()
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
  } catch {}
}
async function playSfx(ctx, cue, volume = 0.5) {
  if (!cue) return
  try {
    const audio = await ensureAudio(ctx, cue)
    audio.loop = false
    audio.volume = volume
    audio.currentTime = 0
    await audio.play()
  } catch {}
}
function pickCue(cues, patterns, kind) {
  for (const pattern of patterns) {
    const hit = cues.find((entry) => entry.kind === kind && pattern.test(entry.cue))
    if (hit) return hit.cue
  }
  return null
}
function pickDefaultTrack(musicCues) {
  for (const pattern of [/stardew/i, /spring/i, /overture|main|theme/i]) {
    const hit = musicCues.find((cue) => pattern.test(cue))
    if (hit) return hit
  }
  return musicCues[0] ?? null
}
//#endregion
//#region compat-plugins/modforge.example-code-plugin/src/sprites.ts
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(/* @__PURE__ */ new Error('image decode failed'))
    image.src = src
  })
}
/** Crops one 16x16 sprite from the atlas and returns it upscaled with smoothing off. */
function renderSprite(atlas, columns, spriteIndex, scale = 4) {
  const canvas = document.createElement('canvas')
  canvas.width = 16 * scale
  canvas.height = 16 * scale
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2d context unavailable')
  context.imageSmoothingEnabled = false
  context.drawImage(atlas, (spriteIndex % columns) * 16, Math.floor(spriteIndex / columns) * 16, 16, 16, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL()
}
/** Picks card faces from parsed Data/Objects and renders their atlas sprites. */
function extractItemFaces(objects, atlas, count) {
  const columns = Math.max(1, Math.floor(atlas.width / 16))
  const items = []
  for (const [id, data] of Object.entries(objects)) {
    if (!data || typeof data !== 'object') continue
    if (data.Texture && !String(data.Texture).endsWith('springobjects')) continue
    if (typeof data.SpriteIndex !== 'number' || !data.Name) continue
    items.push({
      key: id,
      label: data.DisplayName || data.Name,
      name: String(data.Name),
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
    showcaseImage: renderSprite(atlas, columns, item.spriteIndex, 6),
  }))
}
/** Loads card faces from the game, falling back to bundled emoji without one. */
async function loadFaces(ctx, locale) {
  try {
    const [objectsAsset, atlasUrl] = await Promise.all([
      ctx.commands.invoke('loadGameDataAsset', {
        assetPath: 'Data/Objects',
        locale,
      }),
      ctx.commands.invoke('loadGameImage', {
        contentPath: 'Maps/springobjects',
        locale,
      }),
    ])
    const atlas = await loadImage(atlasUrl)
    const faces = extractItemFaces(JSON.parse(objectsAsset.content), atlas, 10)
    if (faces.length >= DIFFICULTIES.easy.pairs)
      return {
        faces,
        usedFallback: false,
      }
    throw new Error('not enough item sprites')
  } catch {
    const raw = await ctx.commands.invoke('readPluginAsset', { path: 'cards.json' })
    return {
      faces: JSON.parse(raw).faces.map((emoji) => ({
        key: emoji,
        label: emoji,
        price: null,
        emoji,
        image: null,
        showcaseImage: null,
      })),
      usedFallback: true,
    }
  }
}
//#endregion
//#region compat-plugins/modforge.example-code-plugin/src/game.ts
const sessionBest = /* @__PURE__ */ new Map()
function getBest(difficulty) {
  return sessionBest.get(difficulty)
}
function setBest(difficulty, record) {
  sessionBest.set(difficulty, record)
}
function clearBests() {
  sessionBest.clear()
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
//#endregion
//#region compat-plugins/modforge.example-code-plugin/src/MemoryMatchPage.tsx
/** Memory Match game page component. */
/** Dynamic grid columns must stay inline (depends on the chosen difficulty). */
function gridStyle(columns) {
  return { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
}
function MemoryMatchPage({ ctx }) {
  const { PanelFrame, EmptyStateCard, CompactSelect, WorkspaceSplitView } = ctx.components
  const t = (key) => ctx.i18n.t(key)
  const [faces, setFaces] = React.useState(null)
  const [usedFallback, setUsedFallback] = React.useState(false)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [difficulty, setDifficulty] = React.useState('easy')
  const [deck, setDeck] = React.useState([])
  const [flipped, setFlipped] = React.useState([])
  const [matched, setMatched] = React.useState(() => /* @__PURE__ */ new Set())
  const [locked, setLocked] = React.useState(false)
  const [moves, setMoves] = React.useState(0)
  const [seconds, setSeconds] = React.useState(0)
  const [started, setStarted] = React.useState(false)
  const [lastMatch, setLastMatch] = React.useState(null)
  const [musicCues, setMusicCues] = React.useState([])
  const [selectedTrack, setSelectedTrack] = React.useState(null)
  const [musicOn, setMusicOn] = React.useState(true)
  const sfxRef = React.useRef({
    flip: null,
    match: null,
    win: null,
  })
  const won = deck.length > 0 && matched.size === deck.length
  const best = getBest(difficulty)
  React.useEffect(() => {
    let alive = true
    loadFaces(ctx, String(ctx.capabilities.get('host.locale') || 'en-US'))
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
  React.useEffect(() => {
    if (!faces) return
    setDeck(dealDeck(faces, DIFFICULTIES[difficulty].pairs))
    setFlipped([])
    setMatched(/* @__PURE__ */ new Set())
    setLocked(false)
    setMoves(0)
    setSeconds(0)
    setStarted(false)
    setLastMatch(null)
  }, [faces, difficulty])
  React.useEffect(() => {
    if (!started || won) return void 0
    const timer = setInterval(() => setSeconds((value) => value + 1), 1e3)
    return () => clearInterval(timer)
  }, [started, won])
  React.useEffect(() => () => stopBgm(), [])
  React.useEffect(() => {
    if (!won) return
    void playSfx(ctx, sfxRef.current.win, 0.6)
    const previous = getBest(difficulty)
    const isNewBest = !previous || moves < previous.moves
    if (isNewBest)
      setBest(difficulty, {
        moves,
        seconds,
      })
    ctx.notifications.publish({
      id: 'memory-match-win',
      level: 'success',
      title: t('game.win.title'),
      summary: t('game.win.detail').replace('{time}', formatSeconds(seconds)).replace('{moves}', String(moves)),
      note: isNewBest ? t('game.win.newBest') : void 0,
      autoDismissMs: 5e3,
    })
  }, [won])
  const restart = () => {
    if (!faces) return
    setDeck(dealDeck(faces, DIFFICULTIES[difficulty].pairs))
    setFlipped([])
    setMatched(/* @__PURE__ */ new Set())
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
      if (musicOn && selectedTrack) void playBgm(ctx, selectedTrack)
    }
    void playSfx(ctx, sfxRef.current.flip, 0.4)
    const next = [...flipped, index]
    setFlipped(next)
    if (next.length < 2) return
    setMoves((value) => value + 1)
    if (deck[next[0]].key === deck[next[1]].key) {
      setMatched((current) => /* @__PURE__ */ new Set([...current, next[0], next[1]]))
      setLastMatch(deck[next[0]])
      setFlipped([])
      void playSfx(ctx, sfxRef.current.match, 0.5)
      return
    }
    setLocked(true)
    setTimeout(() => {
      setFlipped([])
      setLocked(false)
    }, 700)
  }
  if (loadFailed)
    return /* @__PURE__ */ jsx(PanelFrame, {
      flat: true,
      title: t('game.error.title'),
      children: /* @__PURE__ */ jsx(EmptyStateCard, {
        title: t('game.error.title'),
        detail: t('game.error.detail'),
        density: 'compact',
      }),
    })
  if (!faces)
    return /* @__PURE__ */ jsx(PanelFrame, {
      flat: true,
      title: t('game.loading.title'),
      children: /* @__PURE__ */ jsx(EmptyStateCard, {
        title: t('game.loading.title'),
        detail: t('game.loading.detail'),
        density: 'compact',
      }),
    })
  const pairsDone = matched.size / 2
  const pairsTotal = deck.length / 2
  const progressPct = pairsTotal > 0 ? (pairsDone / pairsTotal) * 100 : 0
  const sidebar = /* @__PURE__ */ jsx('div', {
    children: /* @__PURE__ */ jsxs('div', {
      className: 'mmg-sidebar-section',
      children: [
        /* @__PURE__ */ jsx('p', {
          className: 'panel-title mmg-section-title',
          children: t('game.board'),
        }),
        /* @__PURE__ */ jsxs('div', {
          className: 'mmg-stat-grid',
          children: [
            /* @__PURE__ */ jsxs('div', {
              className: 'metric-card compact-metric-card',
              children: [
                /* @__PURE__ */ jsx('div', {
                  className: 'metric-label',
                  children: t('game.moves'),
                }),
                /* @__PURE__ */ jsx('div', {
                  className: 'metric-value',
                  children: moves,
                }),
              ],
            }),
            /* @__PURE__ */ jsxs('div', {
              className: 'metric-card compact-metric-card',
              children: [
                /* @__PURE__ */ jsx('div', {
                  className: 'metric-label',
                  children: t('game.time'),
                }),
                /* @__PURE__ */ jsx('div', {
                  className: 'metric-value',
                  children: formatSeconds(seconds),
                }),
              ],
            }),
            /* @__PURE__ */ jsxs('div', {
              className: 'metric-card compact-metric-card mmg-stat-card-has-bar',
              children: [
                /* @__PURE__ */ jsx('div', {
                  className: 'metric-label',
                  children: t('game.pairs'),
                }),
                /* @__PURE__ */ jsxs('div', {
                  className: 'metric-value',
                  children: [
                    pairsDone,
                    /* @__PURE__ */ jsxs('span', {
                      className: 'mmg-stat-unit',
                      children: ['/', pairsTotal],
                    }),
                  ],
                }),
                /* @__PURE__ */ jsx('div', {
                  className: 'mmg-stat-mini-bar',
                  children: /* @__PURE__ */ jsx('div', {
                    className: 'mmg-stat-mini-fill',
                    style: { width: `${progressPct}%` },
                  }),
                }),
              ],
            }),
            /* @__PURE__ */ jsxs('div', {
              className: 'metric-card compact-metric-card',
              children: [
                /* @__PURE__ */ jsx('div', {
                  className: 'metric-label',
                  children: t('game.best'),
                }),
                /* @__PURE__ */ jsxs('div', {
                  className: 'metric-value',
                  children: [
                    best ? best.moves : '—',
                    best
                      ? /* @__PURE__ */ jsx('span', {
                          className: 'mmg-stat-unit',
                          children: t('game.best.moves'),
                        })
                      : null,
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  })
  const grid = /* @__PURE__ */ jsx('div', {
    className: 'mmg-grid',
    style: gridStyle(DIFFICULTIES[difficulty].columns),
    children: deck.map((face, index) => {
      const isMatched = matched.has(index)
      const faceUp = flipped.includes(index) || isMatched
      return /* @__PURE__ */ jsx(
        'button',
        {
          type: 'button',
          className: `mmg-card${faceUp ? ' is-up' : ''}${isMatched ? ' is-matched' : ''}`,
          onClick: () => flipCard(index),
          'aria-label': faceUp ? face.label : t('game.card.hidden'),
          children: /* @__PURE__ */ jsxs('span', {
            className: 'mmg-card-inner',
            children: [
              /* @__PURE__ */ jsx('span', {
                className: 'mmg-card-face mmg-card-back',
                'aria-hidden': 'true',
                children: /* @__PURE__ */ jsx('span', {
                  className: 'mmg-card-glyph',
                  children: '✦',
                }),
              }),
              /* @__PURE__ */ jsx('span', {
                className: 'mmg-card-face mmg-card-front',
                children: face.image
                  ? /* @__PURE__ */ jsx('img', {
                      src: face.image,
                      alt: face.label,
                    })
                  : /* @__PURE__ */ jsx('span', {
                      className: 'mmg-card-emoji',
                      children: face.emoji,
                    }),
              }),
            ],
          }),
        },
        index,
      )
    }),
  })
  const board = /* @__PURE__ */ jsx('div', {
    className: 'mmg-board-wrap',
    children: /* @__PURE__ */ jsxs('div', {
      className: 'mmg-board-card',
      children: [
        usedFallback
          ? /* @__PURE__ */ jsx('div', {
              className: 'status-pill status-pill-warning mmg-fallback-note',
              children: t('game.fallbackNote'),
            })
          : null,
        won
          ? /* @__PURE__ */ jsx(EmptyStateCard, {
              title: t('game.win.title'),
              detail: t('game.win.detail').replace('{time}', formatSeconds(seconds)).replace('{moves}', String(moves)),
              density: 'compact',
              primaryAction: /* @__PURE__ */ jsx('button', {
                type: 'button',
                className: 'control-button control-button-primary',
                onClick: restart,
                children: t('game.win.action'),
              }),
            })
          : grid,
      ],
    }),
  })
  const showcase = /* @__PURE__ */ jsxs('div', {
    className: 'mmg-right-section',
    children: [
      /* @__PURE__ */ jsx('p', {
        className: 'panel-title mmg-section-title',
        children: t('game.showcase'),
      }),
      lastMatch
        ? /* @__PURE__ */ jsxs('div', {
            className: 'mmg-showcase-body',
            children: [
              /* @__PURE__ */ jsx('div', {
                className: 'mmg-showcase-tile',
                children: lastMatch.showcaseImage
                  ? /* @__PURE__ */ jsx('img', {
                      src: lastMatch.showcaseImage,
                      alt: lastMatch.label,
                    })
                  : /* @__PURE__ */ jsx('span', {
                      className: 'mmg-showcase-emoji',
                      children: lastMatch.emoji,
                    }),
              }),
              /* @__PURE__ */ jsxs('div', {
                children: [
                  /* @__PURE__ */ jsx('div', {
                    className: 'mmg-showcase-name',
                    children: lastMatch.label,
                  }),
                  lastMatch.price != null
                    ? /* @__PURE__ */ jsx('div', {
                        className: 'mmg-showcase-price',
                        children: t('game.price').replace('{price}', String(lastMatch.price)),
                      })
                    : null,
                ],
              }),
            ],
          })
        : /* @__PURE__ */ jsx('div', {
            className: 'mmg-muted',
            children: t('game.showcase.empty'),
          }),
    ],
  })
  const nowPlaying = musicCues.length > 0 && musicOn && getBgmCue()
  return /* @__PURE__ */ jsx('div', {
    className: 'mmg-root',
    children: /* @__PURE__ */ jsx(WorkspaceSplitView, {
      sidebar,
      rightPanel: /* @__PURE__ */ jsxs('div', {
        children: [
          /* @__PURE__ */ jsxs('div', {
            className: 'mmg-right-section',
            children: [
              /* @__PURE__ */ jsx('p', {
                className: 'panel-title mmg-section-title',
                children: t('game.difficulty'),
              }),
              /* @__PURE__ */ jsxs('div', {
                className: 'mmg-control-row',
                children: [
                  /* @__PURE__ */ jsx('span', {
                    className: 'mmg-control-label',
                    children: t('game.difficulty'),
                  }),
                  /* @__PURE__ */ jsx(CompactSelect, {
                    value: difficulty,
                    ariaLabel: t('game.difficulty'),
                    options: Object.keys(DIFFICULTIES).map((key) => ({
                      value: key,
                      label: t(`game.difficulty.${key}`),
                    })),
                    onChange: setDifficulty,
                  }),
                ],
              }),
              /* @__PURE__ */ jsxs('div', {
                className: 'mmg-control-row',
                children: [
                  /* @__PURE__ */ jsx('span', {
                    className: 'mmg-control-label',
                    children: t('game.soundtrack'),
                  }),
                  /* @__PURE__ */ jsx('button', {
                    type: 'button',
                    className: `control-button${musicOn ? ' control-button-primary' : ''}`,
                    onClick: toggleMusic,
                    disabled: musicCues.length === 0,
                    children: musicOn ? t('game.soundtrack.on') : t('game.soundtrack.off'),
                  }),
                ],
              }),
            ],
          }),
          showcase,
          /* @__PURE__ */ jsxs('div', {
            className: 'mmg-right-section',
            children: [
              /* @__PURE__ */ jsx('p', {
                className: 'panel-title mmg-section-title',
                children: t('game.soundtrack'),
              }),
              musicCues.length > 0
                ? /* @__PURE__ */ jsx(CompactSelect, {
                    value: selectedTrack ?? '',
                    ariaLabel: t('game.soundtrack.track'),
                    placeholder: t('game.soundtrack.track'),
                    options: musicCues.map((cue) => ({
                      value: cue,
                      label: cue,
                    })),
                    onChange: changeTrack,
                  })
                : /* @__PURE__ */ jsx('div', {
                    className: 'mmg-muted',
                    children: t('game.soundtrack.none'),
                  }),
              musicCues.length > 0
                ? /* @__PURE__ */ jsxs('div', {
                    className: 'mmg-now-playing',
                    children: [
                      nowPlaying
                        ? /* @__PURE__ */ jsx('span', {
                            className: 'mmg-now-playing-dot',
                            'aria-hidden': 'true',
                          })
                        : null,
                      nowPlaying ? t('game.soundtrack.nowPlaying').replace('{cue}', getBgmCue() ?? '') : t('game.soundtrack.idle'),
                    ],
                  })
                : null,
            ],
          }),
          /* @__PURE__ */ jsx('div', {
            className: 'mmg-right-section',
            children: /* @__PURE__ */ jsx('button', {
              type: 'button',
              className: 'control-button control-button-primary mmg-block-btn',
              onClick: restart,
              children: t('game.restart'),
            }),
          }),
        ],
      }),
      sidebarWidth: '15rem',
      rightPanelWidth: '16rem',
      sidebarLabel: t('game.board'),
      rightPanelLabel: t('game.difficulty'),
      children: board,
    }),
  })
}
//#endregion
//#region compat-plugins/modforge.example-code-plugin/src/index.tsx
/**
 * Example code plugin: a Stardew item-dex memory match game.
 * Exercises the full SDK surface in one real interaction flow:
 * - registerPage with a stateful React component (shared React instance)
 * - components (PanelFrame / EmptyStateCard / CompactSelect)
 * - game asset commands: loadGameDataAsset (Data/Objects), loadGameImage
 *   (Maps/springobjects atlas, cropped and upscaled 4x with smoothing off),
 *   scanGameAudio + loadGameAudioCue (XACT music cues as BGM, sound cues as SFX)
 * - resolveGameRoot fallback: without a game directory the game deals emoji
 *   faces from the bundled cards.json (readPluginAsset)
 * - notifications (win toast with session-best note; retracted on dispose)
 * - capabilities (plugin.id, host.locale for localized item names)
 * - i18n (t) for all user-visible copy
 * - module state + onDispose (session bests and the audio cache are cleared)
 * Styling lives in styles.css (declared via the manifest "styles" field; the
 * host injects it and removes it on unload) with all colors from the host
 * design tokens (var(--…)).
 */
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
      component: () => /* @__PURE__ */ jsx(MemoryMatchPage, { ctx }),
    })
    ctx.onDispose(() => {
      clearBests()
      stopBgm()
      clearAudioCache()
    })
  },
}
//#endregion
export { pluginModule as default }
