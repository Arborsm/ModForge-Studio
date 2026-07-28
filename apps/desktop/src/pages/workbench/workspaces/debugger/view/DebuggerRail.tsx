import { useGameDebuggerCopy } from '@locales/provider'
import { formatBridgeTime } from '@entities/debug-bridge'
import { cx } from '@shared/lib/helper'
import type { GameDebuggerWorkspaceState } from '../state/useGameDebuggerWorkspace'

function BridgeModCard({ workspace }: { workspace: GameDebuggerWorkspaceState }) {
  const copy = useGameDebuggerCopy()
  const { gameRootPath, modState, modStateError, installing, installBridgeMod } = workspace

  const needsUpdate =
    modState?.installed &&
    modState.payloadVersion !== null &&
    modState.installedVersion !== null &&
    modState.payloadVersion !== modState.installedVersion
  const actionLabel = installing
    ? copy.bridgeMod.installing
    : modState?.installed
      ? needsUpdate
        ? copy.bridgeMod.updateAction
        : copy.bridgeMod.reinstallAction
      : copy.bridgeMod.installAction

  return (
    <section className="game-debugger-card">
      <div className="game-debugger-card-title">{copy.bridgeMod.title}</div>
      {gameRootPath === null ? (
        <p className="game-debugger-card-hint">{copy.bridgeMod.noGameDirectory}</p>
      ) : (
        <>
          <div className={cx('game-debugger-mod-state', modState?.installed ? 'is-ok' : 'is-missing')}>
            {modState?.installed ? copy.bridgeMod.installedLabel : copy.bridgeMod.notInstalledLabel}
          </div>
          {modState?.installedVersion ? (
            <div className="game-debugger-card-line">{copy.bridgeMod.installedVersionTemplate(modState.installedVersion)}</div>
          ) : null}
          {modState?.payloadVersion ? (
            <div className="game-debugger-card-line">{copy.bridgeMod.payloadVersionTemplate(modState.payloadVersion)}</div>
          ) : modState ? (
            <div className="game-debugger-card-line is-warn">
              {copy.bridgeMod.payloadMissing} {copy.bridgeMod.payloadMissingHint}
            </div>
          ) : null}
          {modStateError !== null ? <div className="game-debugger-card-line is-warn">{modStateError}</div> : null}
          <div className="game-debugger-card-line game-debugger-mods-path">
            <span>{copy.bridgeMod.modsPathLabel}</span>
            <span className="game-debugger-mods-path-value">{modState?.modsPath ?? ''}</span>
          </div>
          <button
            type="button"
            className="control-button game-debugger-install-button"
            disabled={installing || !modState?.payloadAvailable}
            onClick={() => void installBridgeMod()}
          >
            {actionLabel}
          </button>
          <p className="game-debugger-card-hint">{copy.bridgeMod.restartHint}</p>
        </>
      )}
    </section>
  )
}

function GameStateCard({ workspace }: { workspace: GameDebuggerWorkspaceState }) {
  const copy = useGameDebuggerCopy()
  const { status, gameState, refreshGameState } = workspace
  const connected = status?.reachable === true

  const seasonKey = gameState?.season as keyof typeof copy.gameState.seasonNames | undefined
  const seasonLabel = seasonKey && copy.gameState.seasonNames[seasonKey] ? copy.gameState.seasonNames[seasonKey] : (gameState?.season ?? '')
  const weatherKey = gameState?.weather as keyof typeof copy.gameState.weatherNames | undefined
  const weatherLabel =
    weatherKey && copy.gameState.weatherNames[weatherKey] ? copy.gameState.weatherNames[weatherKey] : (gameState?.weather ?? '')

  const rows: Array<{ label: string; value: string; tone?: 'ok' | 'warn' }> = [
    {
      label: copy.gameState.connectionLabel,
      value: connected ? copy.gameState.connectedLabel : copy.gameState.disconnectedLabel,
      tone: connected ? 'ok' : 'warn',
    },
    {
      label: copy.gameState.saveLabel,
      value: connected ? (gameState?.saveLoaded ? copy.gameState.saveLoaded : copy.gameState.saveWaiting) : copy.gameState.saveWaiting,
    },
    { label: copy.gameState.playerLabel, value: gameState?.playerName ?? copy.gameState.emptyValue },
    {
      label: copy.gameState.locationLabel,
      value: gameState?.location ? `${gameState.location} (${gameState.tileX ?? 0}, ${gameState.tileY ?? 0})` : copy.gameState.emptyValue,
    },
    {
      label: copy.gameState.dateLabel,
      value:
        gameState?.season && gameState.day !== undefined && gameState.year !== undefined
          ? copy.gameState.dateTemplate(seasonLabel, gameState.day, gameState.year)
          : copy.gameState.emptyValue,
    },
    {
      label: copy.gameState.timeLabel,
      value: gameState?.timeOfDay !== undefined ? formatBridgeTime(gameState.timeOfDay) : copy.gameState.emptyValue,
    },
    { label: copy.gameState.weatherLabel, value: weatherLabel || copy.gameState.emptyValue },
    {
      label: copy.gameState.moneyLabel,
      value: gameState?.money !== undefined ? String(gameState.money) : copy.gameState.emptyValue,
    },
    {
      label: copy.gameState.eventLabel,
      value: gameState?.currentEventId ? copy.gameState.eventRunningTemplate(gameState.currentEventId) : copy.gameState.eventNone,
    },
  ]

  return (
    <section className="game-debugger-card">
      <div className="game-debugger-card-title game-debugger-card-title-row">
        <span>{copy.gameState.title}</span>
        <button type="button" className="control-button is-compact" disabled={!connected} onClick={() => void refreshGameState()}>
          {copy.gameState.refreshAction}
        </button>
      </div>
      <dl className="game-debugger-state-list">
        {rows.map((row) => (
          <div key={row.label} className="game-debugger-state-row">
            <dt>{row.label}</dt>
            <dd className={cx(row.tone === 'ok' && 'is-ok', row.tone === 'warn' && 'is-warn')}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function ConnectionLogCard({ workspace }: { workspace: GameDebuggerWorkspaceState }) {
  const copy = useGameDebuggerCopy()
  const { log, clearLog } = workspace
  return (
    <section className="game-debugger-card game-debugger-log-card">
      <div className="game-debugger-card-title game-debugger-card-title-row">
        <span>{copy.connectionLog.title}</span>
        <button type="button" className="control-button is-compact" disabled={log.length === 0} onClick={clearLog}>
          {copy.connectionLog.clearAction}
        </button>
      </div>
      {log.length === 0 ? (
        <p className="game-debugger-card-hint">{copy.connectionLog.empty}</p>
      ) : (
        <ul className="game-debugger-log-list">
          {log.map((entry) => (
            <li key={entry.id} className={cx('game-debugger-log-entry', `is-${entry.tone}`)}>
              [{entry.time}] {entry.text}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Right rail of the debugger module: bridge mod install state, live game state, and the connection log. */
export function DebuggerRail({ workspace }: { workspace: GameDebuggerWorkspaceState }) {
  return (
    <div className="game-debugger-rail">
      <BridgeModCard workspace={workspace} />
      <GameStateCard workspace={workspace} />
      <ConnectionLogCard workspace={workspace} />
    </div>
  )
}
