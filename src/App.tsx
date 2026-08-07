import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/AppShell'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { IosInstallGate } from './components/IosInstallGate'
import { Calendar } from './pages/Calendar'
import { Backup } from './pages/Backup'
import { Clients } from './pages/Clients'
import { Contracts } from './pages/Contracts'
import { Money } from './pages/Money'
import { Services } from './pages/Services'
import { Settings } from './pages/Settings'
import { Today } from './pages/Today'
import { Timeline } from './pages/Timeline'

interface AppProps {
  updateReady?: boolean
  onReloadUpdate?: () => void
  onDismissUpdate?: () => void
}

export default function App({
  updateReady = false,
  onReloadUpdate = () => undefined,
  onDismissUpdate = () => undefined,
}: AppProps) {
  return (
    <AppErrorBoundary>
      <IosInstallGate>
        <HashRouter>
          <Routes>
            <Route
              element={
                <AppShell
                  updateReady={updateReady}
                  onReloadUpdate={onReloadUpdate}
                  onDismissUpdate={onDismissUpdate}
                />
              }
            >
              <Route index element={<Today />} />
              <Route path="calendar/*" element={<Calendar />} />
              <Route path="clients/*" element={<Clients />} />
              <Route path="money/*" element={<Money />} />
              <Route path="settings" element={<Settings />} />
              <Route path="backup" element={<Backup />} />
              <Route path="timeline" element={<Timeline />} />
              <Route path="services/*" element={<Services />} />
              <Route path="settings/contracts" element={<Contracts />} />
              <Route path="*" element={<Navigate replace to="/" />} />
            </Route>
          </Routes>
        </HashRouter>
      </IosInstallGate>
    </AppErrorBoundary>
  )
}
