import type { ItemsPanelCopy } from '../../../lib/editor-shell'
import type { ItemWorkspaceEntry } from '../../../lib/app/itemWorkspace'
import { PanelFrame } from '../../ui/PanelFrame'

type ItemSourcesPanelProps = {
  copy: ItemsPanelCopy
  item: ItemWorkspaceEntry | null
}

function SourceSection({
  title,
  entries,
  noneLabel,
}: {
  title: string
  entries: string[]
  noneLabel: string
}) {
  return (
    <section className="rounded-3xl border border-[var(--border-color)] bg-[var(--bg-panel)] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)]">{title}</p>
      <div className="mt-3 space-y-2">
        {entries.length ? (
          entries.map((entry) => (
            <div key={entry} className="rounded-2xl border border-[var(--border-color)] bg-[color-mix(in_srgb,var(--bg-panel-muted)_92%,white_8%)] px-3 py-3 text-sm text-[var(--text-primary)]">
              {entry}
            </div>
          ))
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">{noneLabel}</p>
        )}
      </div>
    </section>
  )
}

export function ItemSourcesPanel({ copy, item }: ItemSourcesPanelProps) {
  return (
    <PanelFrame title={copy.sourcesPanelTitle} subtitle={copy.sourcesPanelSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 p-3">
        {!item ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-color)] px-4 py-6 text-sm text-[var(--text-secondary)]">
            {copy.sourcesPanelEmpty}
          </div>
        ) : (
          <>
            <SourceSection
              title={copy.shopSectionTitle}
              entries={item.shopEntries.map((entry) => `${entry.shopId} / ${entry.ownerLabels.join(' / ') || copy.noneLabel}`)}
              noneLabel={copy.noneLabel}
            />
            <SourceSection
              title={copy.sourceSectionTitle}
              entries={[
                ...item.artifactSpotSources.map((entry) => `${copy.artifactSourceLabel}: ${entry.locationDisplayName}`),
                ...item.forageSources.map((entry) => `${copy.forageSourceLabel}: ${entry.locationDisplayName}`),
                ...item.fishPondSources.map((entry) => `${copy.pondSourceLabel}: ${entry.pondItemDisplayName}`),
              ]}
              noneLabel={copy.noneLabel}
            />
            <SourceSection
              title={copy.machineSectionTitle}
              entries={[
                ...item.machineOutputs.map((entry) => `${entry.machineDisplayName} / ${entry.triggerLabel}`),
                ...item.machineInputs.map((entry) => `${entry.machineDisplayName} / ${entry.triggerLabel}`),
              ]}
              noneLabel={copy.noneLabel}
            />
          </>
        )}
      </div>
    </PanelFrame>
  )
}
