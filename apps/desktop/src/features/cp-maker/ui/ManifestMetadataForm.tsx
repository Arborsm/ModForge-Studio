import type { ReactNode } from 'react'
import { Plus, X } from 'lucide-react'
import { useEditorCopy } from '@locales/provider'
import { Disclosure } from '@shared/ui/Disclosure'
import type { ManifestMetadataFormValue } from '../model/manifestFormState'

const fieldInputClass =
  'w-full rounded-md border border-border-subtle bg-surface-app px-3 py-2 text-sm text-text-primary outline-none focus:border-accent'

type ManifestMetadataFormProps = {
  value: ManifestMetadataFormValue
  onChange: (value: ManifestMetadataFormValue) => void
  autoFocusName?: boolean
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-text-secondary mb-1 block text-xs">{label}</span>
      {children}
      {hint ? <span className="text-text-secondary mt-1 block text-xs">{hint}</span> : null}
    </label>
  )
}

/**
 * The manifest metadata form shared by the create dialog and the project
 * properties dialog. Basic identity fields stay visible; ContentPackFor,
 * update keys and dependencies live behind the advanced disclosure.
 */
export function ManifestMetadataForm({ value, onChange, autoFocusName = false }: ManifestMetadataFormProps) {
  const copy = useEditorCopy().studioDesk.manifestForm
  const patch = (partial: Partial<ManifestMetadataFormValue>) => onChange({ ...value, ...partial })
  const patchDependency = (index: number, partial: Partial<ManifestMetadataFormValue['dependencies'][number]>) =>
    patch({ dependencies: value.dependencies.map((dependency, i) => (i === index ? { ...dependency, ...partial } : dependency)) })

  return (
    <div className="space-y-3">
      <Field label={copy.projectName}>
        <input
          type="text"
          className={fieldInputClass}
          value={value.projectName}
          onChange={(event) => patch({ projectName: event.target.value })}
          autoFocus={autoFocusName}
        />
      </Field>

      <Field label={copy.uniqueId} hint={copy.uniqueIdHint}>
        <input
          type="text"
          className={fieldInputClass}
          value={value.projectUniqueId}
          onChange={(event) => patch({ projectUniqueId: event.target.value })}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={copy.author}>
          <input
            type="text"
            className={fieldInputClass}
            value={value.projectAuthor}
            onChange={(event) => patch({ projectAuthor: event.target.value })}
          />
        </Field>
        <Field label={copy.version}>
          <input
            type="text"
            className={fieldInputClass}
            value={value.projectVersion}
            onChange={(event) => patch({ projectVersion: event.target.value })}
          />
        </Field>
      </div>

      <Field label={copy.description}>
        <textarea
          className={`min-h-20 resize-none ${fieldInputClass}`}
          value={value.projectDescription}
          onChange={(event) => patch({ projectDescription: event.target.value })}
        />
      </Field>

      <Disclosure title={copy.advancedTitle} subtitle={copy.advancedSubtitle}>
        <div className="space-y-3">
          <Field label={copy.contentPackFor} hint={copy.contentPackForHint}>
            <input
              type="text"
              className={fieldInputClass}
              value={value.contentPackForUniqueId}
              onChange={(event) => patch({ contentPackForUniqueId: event.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={copy.contentPackForMinimumVersion}>
              <input
                type="text"
                className={fieldInputClass}
                value={value.contentPackForMinimumVersion}
                onChange={(event) => patch({ contentPackForMinimumVersion: event.target.value })}
              />
            </Field>
            <Field label={copy.minimumApiVersion}>
              <input
                type="text"
                className={fieldInputClass}
                value={value.minimumApiVersion}
                onChange={(event) => patch({ minimumApiVersion: event.target.value })}
              />
            </Field>
          </div>

          <Field label={copy.updateKeys} hint={copy.updateKeysHint}>
            <textarea
              className={`min-h-16 resize-none font-mono text-xs ${fieldInputClass}`}
              value={value.updateKeysText}
              onChange={(event) => patch({ updateKeysText: event.target.value })}
            />
          </Field>

          <div>
            <span className="text-text-secondary mb-1 block text-xs">{copy.dependencies}</span>
            <div className="space-y-2">
              {value.dependencies.map((dependency, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    className={`flex-1 ${fieldInputClass}`}
                    placeholder={copy.dependencyUniqueIdPlaceholder}
                    value={dependency.uniqueId}
                    onChange={(event) => patchDependency(index, { uniqueId: event.target.value })}
                  />
                  <input
                    type="text"
                    className={`w-32 ${fieldInputClass}`}
                    placeholder={copy.dependencyMinimumVersionPlaceholder}
                    value={dependency.minimumVersion}
                    onChange={(event) => patchDependency(index, { minimumVersion: event.target.value })}
                  />
                  <label className="text-text-secondary flex shrink-0 items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={dependency.isRequired}
                      onChange={(event) => patchDependency(index, { isRequired: event.target.checked })}
                    />
                    {copy.dependencyRequired}
                  </label>
                  <button
                    type="button"
                    aria-label={copy.removeDependency}
                    title={copy.removeDependency}
                    className="text-text-secondary hover:bg-surface-hover hover:text-text-primary shrink-0 rounded-md p-1.5"
                    onClick={() => patch({ dependencies: value.dependencies.filter((_, i) => i !== index) })}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="border-border-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary mt-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
              onClick={() => patch({ dependencies: [...value.dependencies, { uniqueId: '', minimumVersion: '', isRequired: true }] })}
            >
              <Plus size={12} />
              {copy.addDependency}
            </button>
            <p className="text-text-secondary mt-1 text-xs">{copy.dependenciesHint}</p>
          </div>
        </div>
      </Disclosure>
    </div>
  )
}
