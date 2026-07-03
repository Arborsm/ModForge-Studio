import './styles/index.css'

async function bootstrap() {
  const [{ StrictMode }, { createRoot }] = await Promise.all([import('react'), import('react-dom/client')])

  if (import.meta.env.DEV) {
    if (new URLSearchParams(window.location.search).has('mfPagePerfScenario')) {
      const { installDevLauncherMock } = await import('@platform/tauri/devLauncherMock')
      installDevLauncherMock()
      const { DevPagePerformanceScenario } = await import('./dev/DevPagePerformanceScenario')
      createRoot(document.getElementById('root')!).render(
        <StrictMode>
          <DevPagePerformanceScenario />
        </StrictMode>,
      )
      return
    }

    if (new URLSearchParams(window.location.search).has('mfPerfScenario')) {
      const { DevPerformanceScenario } = await import('./dev/DevPerformanceScenario')
      createRoot(document.getElementById('root')!).render(
        <StrictMode>
          <DevPerformanceScenario />
        </StrictMode>,
      )
      return
    }

    if (new URLSearchParams(window.location.search).get('mfEventEditorMock') === '1') {
      const { DevEventPatchEditorMock } = await import('./dev/DevEventPatchEditorMock')
      createRoot(document.getElementById('root')!).render(
        <StrictMode>
          <DevEventPatchEditorMock />
        </StrictMode>,
      )
      return
    }

    const { installDevLauncherMock } = await import('@platform/tauri/devLauncherMock')
    installDevLauncherMock()
  }

  const { default: App } = await import('@app/App')

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
