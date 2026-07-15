import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import { AiProvider } from '@entities/ai'
import { LocalizationProvider } from '@entities/localization'
import { KnowledgeCenterView } from '@pages/workbench/tools/ai-localization/ui/KnowledgeCenterView'
import type { AiGlossaryEntry, AiLocalizationScope, AiPort, AiStyleGuide, LocalizationPort } from '@shared/contracts'
import { NotificationProvider } from '@shared/ui/notifications'
import { TaskCancelledError } from '@shared/lib/task-runtime'
import { renderWithLocale } from '@test/renderWithLocale'

const scope: AiLocalizationScope = {
  id: 'scope',
  kind: 'global',
  name: 'Global knowledge',
  revision: 0,
  createdAtMs: 0,
  updatedAtMs: 0,
  lastUsedAtMs: 0,
  bindingKind: null,
  bindingValue: null,
}
function createPort() {
  const upsertGlossary = vi.fn(async (_scopeId: string, entries: AiGlossaryEntry[]) => ({
    total: 1,
    records: [{ ...entries[0], id: 'term' }],
  }))
  const saveStyle = vi.fn(async (guide: AiStyleGuide) => guide)
  const value = {
    listScopes: vi.fn(async () => ({ total: 1, records: [scope] })),
    listGlossary: vi.fn(async () => ({ total: 0, records: [] })),
    upsertGlossary,
    deleteGlossary: vi.fn(),
    loadStyle: vi.fn(async () => null),
    saveStyle,
    searchMemory: vi.fn(async () => ({ total: 0, records: [] })),
    deleteMemory: vi.fn(),
    loadMachineTranslationSettings: vi.fn(async () => ({ version: 1, defaultProfileId: null, profiles: [], presets: [] })),
    loadScope: vi.fn(async () => ({
      scope,
      settings: {
        scopeId: scope.id,
        defaultEngineKind: null,
        defaultEngineProfileId: null,
        reviewProfileId: null,
        knowledgePolicy: { enabled: true, useOfficialCorpus: true, useGlobalKnowledge: true, useProjectKnowledge: true },
        autoReview: false,
      },
    })),
    chooseKnowledgeImport: vi.fn(async () => null),
    chooseKnowledgeExport: vi.fn(async () => null),
  } as unknown as LocalizationPort
  return { value, upsertGlossary, saveStyle }
}
function renderView(tab: 'glossary' | 'style' | 'memory', port: LocalizationPort) {
  const ai = {
    loadSettings: vi.fn(async () => ({ version: 1, defaultProfileId: null, profiles: [], presets: [] })),
  } as unknown as AiPort
  return renderWithLocale(
    <NotificationProvider>
      <LocalizationProvider port={port}>
        <AiProvider port={ai}>
          <KnowledgeCenterView tab={tab} scopes={[scope]} scopeId={scope.id} sourceLocale="en-US" targetLocale="zh-CN" />
        </AiProvider>
      </LocalizationProvider>
    </NotificationProvider>,
  )
}
describe('KnowledgeCenterView', () => {
  it('does not report superseded knowledge reads as backend failures', async () => {
    const { value } = createPort()
    const listGlossary = vi.fn(async () => {
      throw new TaskCancelledError('Superseded by the current glossary query.')
    })
    value.listGlossary = listGlossary

    renderView('glossary', value)

    await waitFor(() => expect(listGlossary).toHaveBeenCalled())
    expect(screen.queryByText('Localization knowledge operation failed.')).not.toBeInTheDocument()
  })

  it('creates and saves a scoped glossary entry', async () => {
    const { value, upsertGlossary } = createPort()
    renderView('glossary', value)
    expect(await screen.findByText('No glossary entries match these filters.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Add/i }))
    fireEvent.change(screen.getByLabelText('Source term'), { target: { value: 'Junimo' } })
    fireEvent.change(screen.getByLabelText('Target term'), { target: { value: '祝尼魔' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(upsertGlossary).toHaveBeenCalledWith('scope', [expect.objectContaining({ sourceTerm: 'Junimo', targetTerm: '祝尼魔' })]),
    )
  })
  it('saves the structured style summary for the selected scope', async () => {
    const { value, saveStyle } = createPort()
    renderView('style', value)
    await screen.findByText('Effective model summary')
    fireEvent.change(screen.getByLabelText('Tone'), { target: { value: 'warm' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saveStyle).toHaveBeenCalledWith(expect.objectContaining({ scopeId: 'scope', tone: 'warm' })))
  })
  it('deletes multiple selected glossary entries in one scoped mutation', async () => {
    const { value } = createPort()
    const entries = ['a', 'b'].map((id) => ({
      id,
      scopeId: scope.id,
      sourceLocale: 'en-US',
      targetLocale: 'zh-CN',
      sourceTerm: `Source ${id}`,
      targetTerm: `Target ${id}`,
      matchMode: 'exact' as const,
      doNotTranslate: false,
      notes: '',
      updatedAtMs: 0,
    }))
    value.listGlossary = vi.fn(async () => ({ total: entries.length, records: entries }))
    const deleteGlossary = vi.fn(async () => entries.length)
    value.deleteGlossary = deleteGlossary
    renderView('glossary', value)
    await screen.findByText('Source a')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all visible entries' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete (2)' }))
    const firstDialog = screen.getByRole('dialog', { name: 'Delete localization knowledge?' })
    fireEvent.click(within(firstDialog).getByText('Cancel'))
    expect(deleteGlossary).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Delete (2)' }))
    const confirmDialog = screen.getByRole('dialog', { name: 'Delete localization knowledge?' })
    fireEvent.click(within(confirmDialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(deleteGlossary).toHaveBeenCalledWith(scope.id, ['a', 'b']))
  })
})
