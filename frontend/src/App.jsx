import { Suspense, lazy, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Logo from './components/Logo'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const RegisterPage = lazy(() => import('./pages/RegisterPage'))
const HomePage = lazy(() => import('./pages/HomePage'))
const PlayerPage = lazy(() => import('./pages/PlayerPage'))
const SeriesPage = lazy(() => import('./pages/SeriesPage'))
const MoviesPage = lazy(() => import('./pages/MoviesPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))
const ProfilePackages = lazy(() => import('./pages/profile/ProfilePackages.jsx'))
const ProfilePayments = lazy(() => import('./pages/profile/ProfilePayments.jsx'))
const ProfileDevices = lazy(() => import('./pages/profile/ProfileDevices.jsx'))
const ProfileSettings = lazy(() => import('./pages/profile/ProfileSettings.jsx'))
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin.jsx'))
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout.jsx'))
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard.jsx'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers.jsx'))
const AdminPackages = lazy(() => import('./pages/admin/AdminPackages.jsx'))
const AdminAnalytics = lazy(() => import('./pages/admin/AdminAnalytics.jsx'))
const AdminPayments = lazy(() => import('./pages/admin/AdminPayments.jsx'))
const AdminAdmins = lazy(() => import('./pages/admin/AdminAdmins.jsx'))

import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

function AppLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="absolute inset-0 bg-[#E50914]/30 blur-3xl rounded-full animate-pulse" />
          <div className="relative">
            <Logo size="large" to={null} />
          </div>
        </div>
        <div className="flex flex-col items-center gap-2 mt-4">
          <span className="text-lg font-bold text-white">Yukleniyor...</span>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 bg-[#E50914] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 bg-[#E50914] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 bg-[#E50914] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function App() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const hasHydrated = useAuthStore((state) => state.hasHydrated)
  const fetchUser = useAuthStore((state) => state.fetchUser)
  const [hydrationReady, setHydrationReady] = useState(() => {
    try {
      return typeof useAuthStore.persist?.hasHydrated === 'function'
        ? useAuthStore.persist.hasHydrated()
        : false
    } catch {
      return false
    }
  })

  useEffect(() => {
    const persistApi = useAuthStore.persist
    if (!persistApi) {
      setHydrationReady(true)
      return undefined
    }

    const markReady = () => {
      useAuthStore.setState({ hasHydrated: true })
      setHydrationReady(true)
    }

    const unsubscribeHydrate = persistApi.onHydrate?.(() => {
      setHydrationReady(false)
    })

    const unsubscribeFinish = persistApi.onFinishHydration?.(() => {
      markReady()
    })

    if (persistApi.hasHydrated?.()) {
      markReady()
    } else {
      persistApi.rehydrate?.()
    }

    const fallbackTimer = setTimeout(() => {
      markReady()
    }, 1500)

    return () => {
      clearTimeout(fallbackTimer)
      unsubscribeHydrate?.()
      unsubscribeFinish?.()
    }
  }, [])

  useEffect(() => {
    if ((hasHydrated || hydrationReady) && token && !user) {
      fetchUser()
    }
  }, [hasHydrated, hydrationReady, token, user, fetchUser])

  if (!hasHydrated && !hydrationReady) {
    return <AppLoader />
  }

  const isAuthenticated = Boolean(token)

  return (
    <Suspense fallback={<AppLoader />}>
      <Routes>
        <Route
          path="/"
          element={isAuthenticated ? <Navigate to="/home" replace /> : <LandingPage />}
        />
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/home" replace /> : <LoginPage />}
        />
        <Route
          path="/register"
          element={isAuthenticated ? <Navigate to="/home" replace /> : <RegisterPage />}
        />
        <Route
          path="/kayit-ol"
          element={isAuthenticated ? <Navigate to="/home" replace /> : <RegisterPage />}
        />

        <Route element={<Layout />}>
          <Route element={<ProtectedRoute />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/live-tv" element={<PlayerPage />} />
            <Route path="/player" element={<PlayerPage />} />
            <Route path="/series" element={<SeriesPage />} />
            <Route path="/movies" element={<MoviesPage />} />
            <Route path="/profil" element={<ProfilePage />}>
              <Route index element={<ProfilePackages />} />
              <Route path="paketler" element={<ProfilePackages />} />
              <Route path="odemeler" element={<ProfilePayments />} />
              <Route path="cihazlar" element={<ProfileDevices />} />
              <Route path="ayarlar" element={<ProfileSettings />} />
            </Route>
          </Route>
        </Route>

        <Route path="/admin/giris" element={<AdminLogin />} />
        <Route element={<AdminRoute />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin/ana-sayfa" element={<AdminDashboard />} />
            <Route path="/admin/kullanicilar" element={<AdminUsers />} />
            <Route path="/admin/paketler" element={<AdminPackages />} />
            <Route path="/admin/analiz" element={<AdminAnalytics />} />
            <Route path="/admin/odemeler" element={<AdminPayments />} />
            <Route path="/admin/adminler" element={<AdminAdmins />} />
            <Route path="/admin" element={<Navigate to="/admin/ana-sayfa" replace />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
