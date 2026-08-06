import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/AppShell'
import { IosInstallGate } from './components/IosInstallGate'
import { Settings } from './pages/Settings'
import { Today } from './pages/Today'

export default function App() {
  return (
    <IosInstallGate>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Today />} />
            <Route path="calendar" element={<p>Not built yet — stage 5</p>} />
            <Route path="clients" element={<p>Not built yet — stage 3</p>} />
            <Route path="money" element={<p>Not built yet — stage 8</p>} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Route>
        </Routes>
      </HashRouter>
    </IosInstallGate>
  )
}
