import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import Logo from './Logo'
import { 
  Home, 
  Radio, 
  Film, 
  Clapperboard, 
  Settings, 
  LogOut,
  User,
  Menu,
  X
} from 'lucide-react'

const PRIMARY = '#E50914'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#1a1a1a'
const BORDER = '#222222'

function Layout() {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems = [
    { path: '/home', label: 'Ana Sayfa', icon: Home },
    { path: '/live-tv', label: 'Canlı TV', icon: Radio },
    { path: '/series', label: 'Diziler', icon: Clapperboard },
    { path: '/movies', label: 'Filmler', icon: Film },
  ]

  const handleLogout = () => {
    if (confirm('Cikis yapmak istediginize emin misiniz?')) {
      logout()
      navigate('/')
    }
  }

  const isActive = (path) => location.pathname === path

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG_DARK, color: 'white' }}>
      {/* Header - Responsive Heights */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          isScrolled 
            ? 'backdrop-blur-xl border-b' 
            : 'bg-gradient-to-b from-black/80 via-black/40 to-transparent'
        }`}
        style={isScrolled ? { 
          backgroundColor: 'rgba(10,10,10,0.95)', 
          borderColor: BORDER 
        } : {}}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-16 xl:px-24">
          <div className="flex items-center justify-between h-16 lg:h-20 xl:h-24">
            <Logo to="/home" />
            
            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-6 lg:gap-8 xl:gap-10">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative font-medium transition-colors text-sm lg:text-base xl:text-lg ${
                    isActive(item.path) ? 'text-white' : 'text-white/70 hover:text-white'
                  }`}
                >
                  {item.label}
                  {isActive(item.path) && (
                    <span className="absolute -bottom-1 left-0 right-0 h-0.5 xl:h-1 rounded-full" style={{ backgroundColor: PRIMARY }} />
                  )}
                </Link>
              ))}
            </nav>

            {/* User Menu */}
            <div className="flex items-center gap-3 lg:gap-4 xl:gap-6">
              <div className="hidden sm:flex items-center gap-2 lg:gap-3">
                <Link 
                  to="/profil"
                  className={`flex items-center gap-2 font-medium transition-colors text-sm lg:text-base xl:text-lg ${
                    isActive('/profil') ? 'text-white' : 'text-white/70 hover:text-white'
                  }`}
                >
                  <div className="w-8 h-8 lg:w-9 lg:h-9 xl:w-11 xl:h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}>
                    <User className="w-4 h-4 xl:w-5 xl:h-5" />
                  </div>
                  <span className="hidden lg:inline">{user?.code}</span>
                </Link>
              </div>

              <button
                onClick={handleLogout}
                className="hidden md:flex items-center gap-2 font-medium text-white/70 hover:text-white transition-colors rounded-lg hover:bg-white/5 text-sm lg:text-base xl:text-lg px-3 py-2"
              >
                <LogOut className="w-4 h-4 xl:w-5 xl:h-5" />
                <span className="hidden lg:inline">Cikis</span>
              </button>

              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-lg transition-colors hover:bg-white/5"
              >
                {isMobileMenuOpen ? (
                  <X className="w-6 h-6" />
                ) : (
                  <Menu className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div 
          className={`md:hidden absolute top-full left-0 right-0 border-b transition-all duration-300 ${
            isMobileMenuOpen ? 'opacity-100 visible' : 'opacity-0 invisible'
          }`}
          style={{ 
            backgroundColor: 'rgba(10,10,10,0.98)', 
            backdropFilter: 'blur(20px)',
            borderColor: BORDER
          }}
        >
          <nav className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                style={{
                  color: isActive(item.path) ? PRIMARY : 'rgba(255,255,255,0.7)',
                  backgroundColor: isActive(item.path) ? 'rgba(229,9,20,0.1)' : 'transparent'
                }}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            ))}
            
            <Link
              to="/profil"
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
              style={{
                color: isActive('/profil') ? PRIMARY : 'rgba(255,255,255,0.7)',
                backgroundColor: isActive('/profil') ? 'rgba(229,9,20,0.1)' : 'transparent'
              }}
            >
              <User className="w-5 h-5" />
              Profil
            </Link>
            
            {user?.isAdmin && (
              <Link
                to="/admin"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
                style={{
                  color: isActive('/admin') ? PRIMARY : 'rgba(255,255,255,0.7)',
                  backgroundColor: isActive('/admin') ? 'rgba(229,9,20,0.1)' : 'transparent'
                }}
              >
                <Settings className="w-5 h-5" />
                Yonetim
              </Link>
            )}
            
            <hr className="my-2" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />
            
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors"
              style={{ color: PRIMARY }}
            >
              <LogOut className="w-5 h-5" />
              Cikis Yap
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content - Responsive padding-top */}
      <main className="pt-16 lg:pt-20 xl:pt-24">
        <Outlet />
      </main>
    </div>
  )
}

export default Layout
