import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

import App from './App'
import './index.css'

registerSW({ immediate: true })

const root = document.getElementById('root')
if (!root) throw new Error('Application root was not found.')

createRoot(root).render(<App />)
