import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Logo from './components/Logo'
import { Loader2 } from 'lucide-react'

// Pages
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import HomePage from './pages/HomePage'
import PlayerPage from './pages/PlayerPage'
import SeriesPage from './pages/SeriesPage'
import MoviesPage from './pages/MoviesPage'
import ProfilePage from './pages/ProfilePage'
import ProfilePackages from './pages/profile/ProfilePackages.jsx'
import ProfilePayments from './pages/profile/ProfilePayments.jsx'
import ProfileDevices from './pages/profile/ProfileDevices.jsx'
import ProfileSettings from './pages/profile/ProfileSettings.jsx'

// Admin Pages
import AdminLogin from './pages/admin/AdminLogin.jsx'
import AdminLayout from './pages/admin/AdminLayout.jsx'
import AdminDashboard from './pages/admin/AdminDashboard.jsx'
import AdminUsers from './pages/admin/AdminUsers.jsx'
import AdminPackages from './pages/admin/AdminPackages.jsx'
import AdminAnalytics from './pages/admin/AdminAnalytics.jsx'
import AdminPayments from './pages/admin/AdminPayments.jsx'
import AdminAdmins from './pages/admin/AdminAdmins.jsx'

// Components
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AdminRoute from './components/AdminRoute'

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const { token, _hasHydrated, fetchUser } = useAuthStore()
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false)
      if (token) {
        fetchUser()
      }
    }, 100)
    return () => clearTimeout(timer)
  }, [_hasHydrated, token, fetchUser])
  
  if (isLoading) {
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
            <span className="text-lg font-bold text-white">Yükleniyor...</span>
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
  
  const isAuthenticated = !!token

  return (
    <Routes>
      {/* Public routes */}
      <Route 
        path="/" 
        element={
          isAuthenticated ? <Navigate to="/home" replace /> : <LandingPage />
        } 
      />
      <Route 
        path="/login" 
        element={
          isAuthenticated ? <Navigate to="/home" replace /> : <LoginPage />
        } 
      />
      <Route 
        path="/register" 
        element={
          isAuthenticated ? <Navigate to="/home" replace /> : <RegisterPage />
        } 
      />
      <Route 
        path="/kayit-ol" 
        element={
          isAuthenticated ? <Navigate to="/home" replace /> : <RegisterPage />
        } 
      />
      
      {/* Protected routes */}
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

      {/* Admin routes - Separate layout */}
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

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
