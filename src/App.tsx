import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/AppShell'
import { IosInstallGate } from './components/IosInstallGate'
import { Calendar } from './pages/Calendar'
import { Clients } from './pages/Clients'
import { Services } from './pages/Services'
import { Settings } from './pages/Settings'
import { Today } from './pages/Today'

export default function App() {
  return (
    <IosInstallGate>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<Today />} />
            <Route path="calendar/*" element={<Calendar />} />
            <Route path="clients/*" element={<Clients />} />
            <Route path="money" element={<p>Not built yet — stage 8</p>} />
            <Route path="settings" element={<Settings />} />
            <Route path="services/*" element={<Services />} />
            <Route path="*" element={<Navigate replace to="/" />} />
          </Route>
        </Routes>
      </HashRouter>
    </IosInstallGate>
  )
}
