import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'

async function bootstrap() {
  if (import.meta.env.DEV) {
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
