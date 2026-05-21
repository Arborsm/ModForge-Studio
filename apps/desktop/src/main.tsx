import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
import './styles/index.css'

async function bootstrap() {
  if (import.meta.env.DEV) {
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
