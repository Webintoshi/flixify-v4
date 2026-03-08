import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAdminStore } from '../stores/adminStore'
import { ShieldAlert, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

function AdminRoute({ children }) {
  const location = useLocation()
  const { adminToken, _hasHydrated } = useAdminStore()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    // Small delay to ensure hydration is complete
    const timer = setTimeout(() => {
      setIsChecking(false)
    }, 100)
    return () => clearTimeout(timer)
  }, [_hasHydrated])

  // Show loading while checking
  if (isChecking || !_hasHydrated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="w-10 h-10 text-[#E50914] animate-spin" />
        <span className="text-white/60 mt-4">Yükleniyor...</span>
      </div>
    )
  }

  // Debug logging
  console.log('[AdminRoute] Auth check', { 
    hasToken: !!adminToken, 
    tokenLength: adminToken?.length,
    path: location.pathname 
  })

  // Not logged in - redirect to admin login
  if (!adminToken) {
    console.log('[AdminRoute] No token, redirecting to login')
    return <Navigate to="/admin/giris" replace state={{ from: location }} />
  }

  return children || <Outlet />
}

export default AdminRoute
