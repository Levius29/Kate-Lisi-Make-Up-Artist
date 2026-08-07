import { lazy } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './components/AppShell'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { IosInstallGate } from './components/IosInstallGate'
import { Today } from './pages/Today'

const Backup = lazy(() => import('./pages/Backup').then(({ Backup }) => ({ default: Backup })))
const Calendar = lazy(() =>
  import('./pages/Calendar').then(({ Calendar }) => ({ default: Calendar })),
)
const Clients = lazy(() =>
  import('./pages/Clients').then(({ Clients }) => ({ default: Clients })),
)
const Contracts = lazy(() =>
  import('./pages/Contracts').then(({ Contracts }) => ({ default: Contracts })),
)
const Money = lazy(() => import('./pages/Money').then(({ Money }) => ({ default: Money })))
const Services = lazy(() =>
  import('./pages/Services').then(({ Services }) => ({ default: Services })),
)
const Settings = lazy(() =>
  import('./pages/Settings').then(({ Settings }) => ({ default: Settings })),
)
const Timeline = lazy(() =>
  import('./pages/Timeline').then(({ Timeline }) => ({ default: Timeline })),
)

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
