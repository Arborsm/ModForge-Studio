import { useSettingsMenuCopy } from '@locales/provider'

/** Collapsible chain-of-thought block inside the connection-test dialog. */
export function ReasoningChainView({ expanded, onToggle, content }: { expanded: boolean; onToggle: () => void; content: string }) {
  const copy = useSettingsMenuCopy().ai
  return (
    <section className="settings-ai-reasoning-result">
      <button type="button" className="settings-ai-advanced-toggle" aria-expanded={expanded} onClick={onToggle}>
        <span>{copy.reasoningChain}</span>
        <small>{expanded ? copy.reasoningChainHide : copy.reasoningChainShow}</small>
      </button>
      {expanded ? (
        <pre className="settings-ai-reasoning-text" role="region" aria-label={copy.reasoningChain}>
          {content}
        </pre>
      ) : null}
    </section>
  )
}
