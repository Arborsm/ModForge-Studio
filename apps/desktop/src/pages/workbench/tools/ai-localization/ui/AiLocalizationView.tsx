import { useAiLocalizationCopy } from '@locales/provider'
import { KnowledgeCenterView } from './KnowledgeCenterView'
import { OfficialCorpusView } from './OfficialCorpusView'
import { QualityHistoryView } from './QualityHistoryView'
import { ProjectUsageView } from './ProjectUsageView'
import { isString, useAiLocalizationPersistentState } from '../model/localizationPageState'
type Tab = 'official' | 'glossary' | 'style' | 'memory' | 'quality' | 'usage'
type MobileRegion = 'scope' | 'content' | 'details'
export function AiLocalizationView() {
  const copy = useAiLocalizationCopy()
  const [storedTab, setTab] = useAiLocalizationPersistentState('tab', 'official', isString)
  const tab: Tab = ['official', 'glossary', 'style', 'memory', 'quality', 'usage'].includes(storedTab) ? (storedTab as Tab) : 'official'
  const [storedRegion, setRegion] = useAiLocalizationPersistentState('region', 'content', isString)
  const region: MobileRegion = ['scope', 'content', 'details'].includes(storedRegion) ? (storedRegion as MobileRegion) : 'content'
  const [detailsOpen, setDetailsOpen] = useState(false)
  const detailsTrigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!detailsOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setDetailsOpen(false)
      detailsTrigger.current?.focus()
    }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [detailsOpen])
  const tabs = [
    ['official', copy.officialTab],
    ['glossary', copy.glossaryTab],
    ['style', copy.styleTab],
    ['memory', copy.memoryTab],
    ['quality', copy.qualityHistoryTab],
    ['usage', copy.projectUsageTab],
  ] as const
  return (
    <div className="ai-localization-center" data-mobile-region={region} data-details-open={detailsOpen || undefined}>
      <nav className="ai-localization-tabs" role="tablist">
        {tabs.map(([id, label], index) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'is-active' : ''}
            onClick={() => setTab(id)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              const direction = event.key === 'ArrowRight' ? 1 : -1
              const next = tabs[(index + direction + tabs.length) % tabs.length]
              setTab(next[0])
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [(index + direction + tabs.length) % tabs.length]?.focus()
            }}
          >
            {label}
          </button>
        ))}
        <button
          ref={detailsTrigger}
          type="button"
          className="icon-button ai-localization-details-toggle"
          aria-label={detailsOpen ? copy.closeDetails : copy.openDetails}
          title={detailsOpen ? copy.closeDetails : copy.openDetails}
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((value) => !value)}
        >
          {detailsOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
        </button>
      </nav>
      <div className="ai-localization-region-tabs" role="tablist" aria-label={copy.title}>
        {(
          [
            ['scope', copy.scopeRegion],
            ['content', copy.contentRegion],
            ['details', copy.detailsRegion],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={region === id} onClick={() => setRegion(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="ai-localization-tab-content">
        {tab === 'official' ? (
          <OfficialCorpusView />
        ) : tab === 'quality' ? (
          <QualityHistoryView />
        ) : tab === 'usage' ? (
          <ProjectUsageView />
        ) : (
          <KnowledgeCenterView key={tab} tab={tab} />
        )}
      </div>
    </div>
  )
}
import { PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
