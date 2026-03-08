import { useEffect, useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAdminStore } from '../../stores/adminStore'
import { 
  LayoutDashboard, 
  Users, 
  Package, 
  BarChart3, 
  CreditCard, 
  Shield, 
  LogOut,
  Menu,
  X,
  Settings
} from 'lucide-react'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#141414'
const BORDER = '#2a2a2a'

function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { adminUser, logout, fetchAdminProfile } = useAdminStore()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024)
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      }
    }
    
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    fetchAdminProfile()
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/admin/giris')
  }

  const menuItems = [
    { path: '/admin/ana-sayfa', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/kullanicilar', label: 'Kullanıcılar', icon: Users },
    { path: '/admin/paketler', label: 'Paketler', icon: Package },
    { path: '/admin/analiz', label: 'Analiz', icon: BarChart3 },
    { path: '/admin/odemeler', label: 'Ödemeler', icon: CreditCard },
    { path: '/admin/adminler', label: 'Adminler', icon: Shield },
  ]

  const isActive = (path) => location.pathname === path

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: BG_DARK }}>
      {/* Sidebar */}
      <aside 
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-20 xl:w-64'
        }`}
        style={{ 
          backgroundColor: BG_SURFACE,
          borderRight: `1px solid ${BORDER}`
        }}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b" style={{ borderColor: BORDER }}>
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: PRIMARY }}
          >
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className={`ml-3 font-bold text-white text-lg whitespace-nowrap transition-opacity duration-300 ${
            isSidebarOpen ? 'opacity-100' : 'opacity-0 lg:opacity-0 xl:opacity-100'
          }`}>
            Admin Panel
          </span>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-2">
          {menuItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => isMobile && setIsSidebarOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  active 
                    ? 'text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                style={{ backgroundColor: active ? PRIMARY : 'transparent' }}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className={`whitespace-nowrap transition-opacity duration-300 ${
                  isSidebarOpen ? 'opacity-100' : 'opacity-0 lg:opacity-0 xl:opacity-100'
                }`}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Bottom Section */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t" style={{ borderColor: BORDER }}>
          {/* Admin Info */}
          <div className={`mb-4 px-4 transition-opacity duration-300 ${
            isSidebarOpen ? 'opacity-100' : 'opacity-0 lg:opacity-0 xl:opacity-100'
          }`}>
            <p className="text-white font-medium text-sm">{adminUser?.name || 'Admin'}</p>
            <p className="text-gray-500 text-xs">{adminUser?.email || ''}</p>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className={`whitespace-nowrap transition-opacity duration-300 ${
              isSidebarOpen ? 'opacity-100' : 'opacity-0 lg:opacity-0 xl:opacity-100'
            }`}>
              Çıkış Yap
            </span>
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {isMobile && isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header 
          className="h-16 flex items-center justify-between px-6 border-b sticky top-0 z-30"
          style={{ backgroundColor: BG_DARK, borderColor: BORDER }}
        >
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-4">
            <Link 
              to="/" 
              target="_blank"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Siteyi Görüntüle
            </Link>
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ backgroundColor: PRIMARY }}
            >
              <span className="text-white text-sm font-bold">
                {(adminUser?.name || 'A')[0].toUpperCase()}
              </span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default AdminLayout
