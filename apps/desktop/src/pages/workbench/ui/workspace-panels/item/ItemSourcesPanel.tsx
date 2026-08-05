import { useItemsCopy } from '@locales/provider'
import type { ItemWorkspaceEntry } from '@entities/item'
import { PanelFrame } from '@shared/ui/PanelFrame'
import { PanelEmptyState, PanelSection } from '@shared/ui/PanelSection'

type ItemSourcesPanelProps = {
  item: ItemWorkspaceEntry | null
}

function SourceSection({ title, entries, noneLabel }: { title: string; entries: string[]; noneLabel: string }) {
  return (
    <PanelSection title={title} bodyClassName="space-y-2">
      {entries.length ? (
        entries.map((entry) => (
          <div key={entry} className="panel-list-card text-text-primary text-sm">
            {entry}
          </div>
        ))
      ) : (
        <p className="text-text-secondary text-sm">{noneLabel}</p>
      )}
    </PanelSection>
  )
}

export function ItemSourcesPanel({ item }: ItemSourcesPanelProps) {
  const copy = useItemsCopy()
  return (
    <PanelFrame title={copy.sourcesPanelTitle} subtitle={copy.sourcesPanelSubtitle} className="h-full">
      <div className="flex h-full flex-col gap-3 p-3">
        {!item ? (
          <PanelEmptyState>{copy.sourcesPanelEmpty}</PanelEmptyState>
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
