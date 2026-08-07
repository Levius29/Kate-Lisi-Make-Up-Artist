import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import App from './App'
import './index.css'

function StudioRoot() {
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => {
    function showUpdateReady() {
      setUpdateReady(true)
    }

    registerSW({
      immediate: true,
      onNeedRefresh: showUpdateReady,
      // vite-plugin-pwa 1.3 reports an activated auto-update through this callback.
      // Wiring both keeps SPEC.md's autoUpdate mode without silently reloading the page.
      onNeedReload: showUpdateReady,
    })
  }, [])

  return (
    <App
      updateReady={updateReady}
      onReloadUpdate={() => window.location.reload()}
      onDismissUpdate={() => setUpdateReady(false)}
    />
  )
}

const root = document.getElementById('root')
if (!root) throw new Error('Application root was not found.')

createRoot(root).render(<StudioRoot />)
