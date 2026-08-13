import { useState } from 'react'
import { useGameDebuggerCopy } from '@locales/provider'
import { cx } from '@shared/lib/helper'
import { useGameDebuggerWorkspace } from '../state/useGameDebuggerWorkspace'
import { DebuggerRail } from './DebuggerRail'
import { AdvancedSection } from './sections/AdvancedSection'
import { EventsSection } from './sections/EventsSection'
import { DialogueSection, PlayerSection, RelationshipSection, TimeSection, WarpSection, WeatherSection } from './sections/SimpleSections'

type DebuggerSectionId = 'events' | 'dialogue' | 'player' | 'warp' | 'time' | 'weather' | 'relationship' | 'advanced'

const SECTION_ORDER: DebuggerSectionId[] = ['events', 'dialogue', 'player', 'warp', 'time', 'weather', 'relationship', 'advanced']

/** Root view for the game debugger module: section nav, active tool panel, and the bridge status rail. */
export function GameDebuggerWorkspace() {
  const copy = useGameDebuggerCopy()
  const workspace = useGameDebuggerWorkspace()
  const [activeSection, setActiveSection] = useState<DebuggerSectionId>('events')
  const connected = workspace.status?.reachable === true

  return (
    <div className="game-debugger">
      <header className="game-debugger-header">
        <div>
          <div className="game-debugger-title">{copy.title}</div>
          <div className="game-debugger-subtitle">{copy.subtitle}</div>
        </div>
        {!connected ? (
          <div className="game-debugger-disconnected-pill" role="status">
            <span className="game-debugger-disconnected-pill-title">{copy.disconnectedOverlayTitle}</span>
            <span className="game-debugger-disconnected-pill-hint">{copy.disconnectedOverlayHint}</span>
          </div>
        ) : null}
      </header>
      <div className="game-debugger-body">
        <nav className="game-debugger-nav" aria-label={copy.title}>
          {SECTION_ORDER.map((sectionId) => (
            <button
              key={sectionId}
              type="button"
              className={cx('game-debugger-nav-item', activeSection === sectionId && 'is-current')}
              aria-current={activeSection === sectionId ? 'true' : undefined}
              onClick={() => setActiveSection(sectionId)}
            >
              {copy.sections[sectionId]}
            </button>
          ))}
        </nav>
        <main className="game-debugger-main">
          {activeSection === 'events' ? <EventsSection workspace={workspace} connected={connected} /> : null}
          {activeSection === 'dialogue' ? <DialogueSection workspace={workspace} connected={connected} /> : null}
          {activeSection === 'player' ? <PlayerSection workspace={workspace} connected={connected} /> : null}
          {activeSection === 'warp' ? <WarpSection workspace={workspace} connected={connected} /> : null}
          {activeSection === 'time' ? <TimeSection workspace={workspace} connected={connected} /> : null}
          {activeSection === 'weather' ? <WeatherSection workspace={workspace} connected={connected} /> : null}
          {activeSection === 'relationship' ? <RelationshipSection workspace={workspace} connected={connected} /> : null}
          {activeSection === 'advanced' ? <AdvancedSection workspace={workspace} connected={connected} /> : null}
        </main>
        <DebuggerRail workspace={workspace} />
      </div>
    </div>
  )
}
