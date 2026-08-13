import { parseStardewI18n } from '@shared/infra/game-formats/stardew-i18n/stardewI18n'

const PROTOCOL_LITERAL_PATTERN = /[#$%^@{}[\]|]/u

/** Renders a dialogue script with protocol tokens highlighted, preserving every character. */
export function DialogueScriptTokens({ script }: { script: string }) {
  const template = parseStardewI18n(script)
  return (
    <>
      {template.nodes.map((node, index) =>
        node.kind === 'literal' && PROTOCOL_LITERAL_PATTERN.test(node.value) ? (
          <span key={index} className="dialogue-editor-token">
            {node.value}
          </span>
        ) : (
          <span key={index}>{node.value}</span>
        ),
      )}
    </>
  )
}
