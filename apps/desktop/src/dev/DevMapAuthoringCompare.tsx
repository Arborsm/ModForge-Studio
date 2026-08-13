import { useState } from 'react'
import mapEditorMock from '../../../../prototype/map-editor-workbench.html?raw'
import patchEditorMock from '../../../../prototype/patch-editor-workbench.html?raw'
import '../styles/workbench.css'

type ComparePage = 'map-asset-editor' | 'map-patch-editor'

const comparePages: Array<{ id: ComparePage; label: string; mock: string }> = [
  { id: 'map-asset-editor', label: '地图编辑器', mock: mapEditorMock },
  { id: 'map-patch-editor', label: 'EditMap Patch', mock: patchEditorMock },
]

/** Development-only side-by-side view for matching the checked-in map authoring mocks. */
export function DevMapAuthoringCompare() {
  const [activePage, setActivePage] = useState<ComparePage>('map-asset-editor')
  const current = comparePages.find((page) => page.id === activePage) ?? comparePages[0]!
  const implementationUrl = `/?mfPagePerfScenario=${current.id}&mfLocale=zh-CN`

  return (
    <main className="map-authoring-compare">
      <header className="map-authoring-compare-header">
        <strong>地图制作 UI 对照</strong>
        <nav aria-label="对照页面">
          {comparePages.map((page) => (
            <button
              key={page.id}
              type="button"
              className={activePage === page.id ? 'is-active' : undefined}
              onClick={() => setActivePage(page.id)}
            >
              {page.label}
            </button>
          ))}
        </nav>
      </header>
      <div className="map-authoring-compare-grid">
        <section>
          <header>
            <strong>Mock</strong>
            <span>prototype/{activePage === 'map-asset-editor' ? 'map-editor-workbench' : 'patch-editor-workbench'}.html</span>
          </header>
          <iframe key={`mock:${activePage}`} title={`${current.label} mock`} srcDoc={current.mock} />
        </section>
        <section>
          <header>
            <strong>当前实现</strong>
            <span>{current.id}</span>
          </header>
          <iframe key={`implementation:${activePage}`} title={`${current.label} implementation`} src={implementationUrl} />
        </section>
      </div>
    </main>
  )
}
