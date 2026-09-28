/** Memory Match game page component. */

import React from 'react'
import type { PluginContext, PluginAudioCueSummary } from '@modforge/plugin-sdk'
import { DIFFICULTIES, MISMATCH_REVEAL_MS } from './constants.js'
import { stopBgm, playBgm, playSfx, pickCue, pickDefaultTrack, getBgmCue } from './audio.js'
import { loadFaces, type CardFace } from './sprites.js'
import { dealDeck, formatSeconds, getBest, setBest } from './game.js'

/** Dynamic grid columns must stay inline (depends on the chosen difficulty). */
function gridStyle(columns: number): React.CSSProperties {
  return { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
}

interface MemoryMatchPageProps {
  ctx: PluginContext
}

export function MemoryMatchPage({ ctx }: MemoryMatchPageProps) {
  const { PanelFrame, EmptyStateCard, CompactSelect, WorkspaceSplitView } = ctx.components
  // Arrow wrapper keeps `this` binding and avoids unbound-method lint on the SDK method reference.
  const t = (key: string) => ctx.i18n.t(key)

  const [faces, setFaces] = React.useState<CardFace[] | null>(null)
  const [usedFallback, setUsedFallback] = React.useState(false)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [difficulty, setDifficulty] = React.useState('easy')
  const [deck, setDeck] = React.useState<CardFace[]>([])
  const [flipped, setFlipped] = React.useState<number[]>([])
  const [matched, setMatched] = React.useState<Set<number>>(() => new Set())
  const [locked, setLocked] = React.useState(false)
  const [moves, setMoves] = React.useState(0)
  const [seconds, setSeconds] = React.useState(0)
  const [started, setStarted] = React.useState(false)
  const [lastMatch, setLastMatch] = React.useState<CardFace | null>(null)
  const [musicCues, setMusicCues] = React.useState<string[]>([])
  const [selectedTrack, setSelectedTrack] = React.useState<string | null>(null)
  const [musicOn, setMusicOn] = React.useState(true)
  const sfxRef = React.useRef<{ flip: string | null; match: string | null; win: string | null }>({ flip: null, match: null, win: null })

  const won = deck.length > 0 && matched.size === deck.length
  const best = getBest(difficulty)

  // Load card faces (game items, or the bundled emoji fallback) and audio cues.
  React.useEffect(() => {
    let alive = true
    const locale = String((ctx.capabilities.get('host.locale') as string | undefined) || 'en-US')
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
      .invoke<PluginAudioCueSummary[]>('scanGameAudio')
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
    const previous = getBest(difficulty)
    const isNewBest = !previous || moves < previous.moves
    if (isNewBest) setBest(difficulty, { moves, seconds })
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

  const changeTrack = (cue: string) => {
    setSelectedTrack(cue)
    if (musicOn && started) void playBgm(ctx, cue)
  }

  const flipCard = (index: number) => {
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
    return (
      <PanelFrame flat title={t('game.error.title')}>
        <EmptyStateCard title={t('game.error.title')} detail={t('game.error.detail')} density="compact" />
      </PanelFrame>
    )
  }
  if (!faces) {
    return (
      <PanelFrame flat title={t('game.loading.title')}>
        <EmptyStateCard title={t('game.loading.title')} detail={t('game.loading.detail')} density="compact" />
      </PanelFrame>
    )
  }

  const pairsDone = matched.size / 2
  const pairsTotal = deck.length / 2
  const progressPct = pairsTotal > 0 ? (pairsDone / pairsTotal) * 100 : 0

  const sidebar = (
    <div>
      <div className="mmg-sidebar-section">
        <p className="panel-title mmg-section-title">{t('game.board')}</p>
        <div className="mmg-stat-grid">
          <div className="metric-card compact-metric-card">
            <div className="metric-label">{t('game.moves')}</div>
            <div className="metric-value">{moves}</div>
          </div>
          <div className="metric-card compact-metric-card">
            <div className="metric-label">{t('game.time')}</div>
            <div className="metric-value">{formatSeconds(seconds)}</div>
          </div>
          <div className="metric-card compact-metric-card mmg-stat-card-has-bar">
            <div className="metric-label">{t('game.pairs')}</div>
            <div className="metric-value">
              {pairsDone}
              <span className="mmg-stat-unit">/{pairsTotal}</span>
            </div>
            <div className="mmg-stat-mini-bar">
              <div className="mmg-stat-mini-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <div className="metric-card compact-metric-card">
            <div className="metric-label">{t('game.best')}</div>
            <div className="metric-value">
              {best ? best.moves : '—'}
              {best ? <span className="mmg-stat-unit">{t('game.best.moves')}</span> : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  const grid = (
    <div className="mmg-grid" style={gridStyle(DIFFICULTIES[difficulty].columns)}>
      {deck.map((face, index) => {
        const isMatched = matched.has(index)
        const faceUp = flipped.includes(index) || isMatched
        return (
          <button
            key={index}
            type="button"
            className={`mmg-card${faceUp ? ' is-up' : ''}${isMatched ? ' is-matched' : ''}`}
            onClick={() => flipCard(index)}
            aria-label={faceUp ? face.label : t('game.card.hidden')}
          >
            <span className="mmg-card-inner">
              <span className="mmg-card-face mmg-card-back" aria-hidden="true">
                <span className="mmg-card-glyph">✦</span>
              </span>
              <span className="mmg-card-face mmg-card-front">
                {face.image ? <img src={face.image} alt={face.label} /> : <span className="mmg-card-emoji">{face.emoji}</span>}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )

  const board = (
    <div className="mmg-board-wrap">
      <div className="mmg-board-card">
        {usedFallback ? <div className="status-pill status-pill-warning mmg-fallback-note">{t('game.fallbackNote')}</div> : null}
        {won ? (
          <EmptyStateCard
            title={t('game.win.title')}
            detail={t('game.win.detail').replace('{time}', formatSeconds(seconds)).replace('{moves}', String(moves))}
            density="compact"
            primaryAction={
              <button type="button" className="control-button control-button-primary" onClick={restart}>
                {t('game.win.action')}
              </button>
            }
          />
        ) : (
          grid
        )}
      </div>
    </div>
  )

  const showcase = (
    <div className="mmg-right-section">
      <p className="panel-title mmg-section-title">{t('game.showcase')}</p>
      {lastMatch ? (
        <div className="mmg-showcase-body">
          <div className="mmg-showcase-tile">
            {lastMatch.showcaseImage ? (
              <img src={lastMatch.showcaseImage} alt={lastMatch.label} />
            ) : (
              <span className="mmg-showcase-emoji">{lastMatch.emoji}</span>
            )}
          </div>
          <div>
            <div className="mmg-showcase-name">{lastMatch.label}</div>
            {lastMatch.price != null ? (
              <div className="mmg-showcase-price">{t('game.price').replace('{price}', String(lastMatch.price))}</div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mmg-muted">{t('game.showcase.empty')}</div>
      )}
    </div>
  )

  const nowPlaying = musicCues.length > 0 && musicOn && getBgmCue()

  // Right panel: controls + showcase + soundtrack
  const rightPanel = (
    <div>
      {/* ── Controls group: difficulty + music toggle ── */}
      <div className="mmg-right-section">
        <p className="panel-title mmg-section-title">{t('game.difficulty')}</p>
        <div className="mmg-control-row">
          <span className="mmg-control-label">{t('game.difficulty')}</span>
          <CompactSelect
            value={difficulty}
            ariaLabel={t('game.difficulty')}
            options={Object.keys(DIFFICULTIES).map((key) => ({ value: key, label: t(`game.difficulty.${key}`) }))}
            onChange={setDifficulty}
          />
        </div>
        <div className="mmg-control-row">
          <span className="mmg-control-label">{t('game.soundtrack')}</span>
          <button
            type="button"
            className={`control-button${musicOn ? ' control-button-primary' : ''}`}
            onClick={toggleMusic}
            disabled={musicCues.length === 0}
          >
            {musicOn ? t('game.soundtrack.on') : t('game.soundtrack.off')}
          </button>
        </div>
      </div>
      {/* ── Showcase: last matched pair ── */}
      {showcase}
      {/* ── Soundtrack group: track selector + now playing (merged) ── */}
      <div className="mmg-right-section">
        <p className="panel-title mmg-section-title">{t('game.soundtrack')}</p>
        {musicCues.length > 0 ? (
          <CompactSelect
            value={selectedTrack ?? ''}
            ariaLabel={t('game.soundtrack.track')}
            placeholder={t('game.soundtrack.track')}
            options={musicCues.map((cue) => ({ value: cue, label: cue }))}
            onChange={changeTrack}
          />
        ) : (
          <div className="mmg-muted">{t('game.soundtrack.none')}</div>
        )}
        {musicCues.length > 0 ? (
          <div className="mmg-now-playing">
            {nowPlaying ? <span className="mmg-now-playing-dot" aria-hidden="true" /> : null}
            {nowPlaying ? t('game.soundtrack.nowPlaying').replace('{cue}', getBgmCue() ?? '') : t('game.soundtrack.idle')}
          </div>
        ) : null}
      </div>
      {/* ── Restart: primary action pinned to bottom ── */}
      <div className="mmg-right-section">
        <button type="button" className="control-button control-button-primary mmg-block-btn" onClick={restart}>
          {t('game.restart')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="mmg-root">
      <WorkspaceSplitView
        sidebar={sidebar}
        rightPanel={rightPanel}
        sidebarWidth="15rem"
        rightPanelWidth="16rem"
        sidebarLabel={t('game.board')}
        rightPanelLabel={t('game.difficulty')}
      >
        {board}
      </WorkspaceSplitView>
    </div>
  )
}
