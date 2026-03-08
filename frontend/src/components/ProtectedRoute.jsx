import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import Logo from './Logo'

function ProtectedRoute({ children }) {
  const location = useLocation()
  const token = useAuthStore((state) => state.token)
  const hasHydrated = useAuthStore((state) => state.hasHydrated)

  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a] gap-4">
        <Logo size="large" to={null} />
        <span className="text-white/60">Yukleniyor...</span>
      </div>
    )
  }

  if (!token) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return children || <Outlet />
}

export default ProtectedRoute
