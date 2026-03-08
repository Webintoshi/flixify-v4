import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import Logo from '../components/Logo'
import { Lock, Zap, Smartphone, Eye, EyeOff, AlertCircle, ArrowLeft, UserPlus } from 'lucide-react'

// Renk tanımları
const PRIMARY = '#E50914'
const PRIMARY_HOVER = '#F40612'
const BG_DARK = '#0a0a0a'
const BG_SURFACE = '#1a1a1a'
const BORDER = '#222222'

function LoginPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const { login, isLoading, error, clearError, token } = useAuthStore()

  // Auto-fill code from registration
  useEffect(() => {
    const autoFillCode = location.state?.autoFillCode
    if (autoFillCode) {
      setCode(autoFillCode)
      // Clear state after using
      window.history.replaceState({}, document.title)
    }
  }, [location.state])

  // Redirect when token is available (after successful login)
  useEffect(() => {
    if (token) {
      console.log('[Login] Token detected, navigating to /home')
      navigate('/home', { replace: true })
    }
  }, [token, navigate])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (code.length !== 16) {
      alert('16 haneli kodu giriniz')
      return
    }
    
    console.log('[Login] Attempting login with code:', code.toUpperCase())
    const result = await login(code.toUpperCase())
    console.log('[Login] Login result:', result)
    
    // Navigation is handled by useEffect when token changes
    if (!result.success) {
      console.log('[Login] Failed:', result.error)
    }
  }

  const handleCodeChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '')
    if (value.length <= 16) {
      setCode(value)
      if (error) clearError()
    }
  }

  const formattedCode = code.match(/.{1,4}/g)?.join(' ') || code

  // Button stilleri
  const btnPrimary = {
    backgroundColor: PRIMARY,
    color: 'white',
    fontWeight: 700,
    padding: '1rem',
    borderRadius: '0.75rem',
    transition: 'all 0.2s ease',
    width: '100%',
    border: 'none',
    cursor: 'pointer'
  }

  const btnPrimaryHover = (e) => {
    e.target.style.backgroundColor = PRIMARY_HOVER
  }

  const btnPrimaryLeave = (e) => {
    e.target.style.backgroundColor = PRIMARY
  }

  return (
    <div 
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: BG_DARK }}
    >
      {/* Back Button */}
      <Link 
        to="/"
        className="absolute top-6 left-6 flex items-center gap-2 text-white/70 hover:text-white transition-colors z-10"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="text-sm font-medium">Geri Dön</span>
      </Link>

      {/* Background Effects */}
      <div className="absolute inset-0">
        <div 
          className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full blur-3xl"
          style={{ backgroundColor: 'rgba(229,9,20,0.1)' }}
        />
        <div 
          className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full blur-3xl"
          style={{ backgroundColor: 'rgba(70,211,105,0.05)' }}
        />
      </div>

      {/* Login Container */}
      <div className="relative w-full max-w-md p-6">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-6">
            <div className="relative">
              <div 
                className="absolute inset-0 blur-2xl rounded-full"
                style={{ backgroundColor: 'rgba(229,9,20,0.3)' }}
              />
              <div className="relative">
                <Logo size="large" to={null} />
              </div>
            </div>
          </div>
          <p className="text-white/60 text-sm">
            16 haneli erişim kodunuzu girin
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Code Input */}
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Erişim Kodu
            </label>
            <div className="relative">
              <input
                type={showCode ? 'text' : 'password'}
                value={formattedCode}
                onChange={handleCodeChange}
                placeholder="X7F2 A9B1 C4D8 E6F0"
                disabled={isLoading}
                className="w-full px-5 py-4 text-center text-2xl font-mono tracking-wider text-white placeholder:text-white/20 focus:outline-none transition-all disabled:opacity-50"
                style={{ 
                  backgroundColor: BG_SURFACE, 
                  border: `1px solid ${BORDER}`,
                  borderRadius: '0.75rem'
                }}
                onFocus={(e) => e.target.style.borderColor = PRIMARY}
                onBlur={(e) => e.target.style.borderColor = BORDER}
              />
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors"
              >
                {showCode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {/* Progress indicator */}
            <div className="flex items-center justify-between mt-2">
              <div className="flex gap-1">
                {[...Array(4)].map((_, i) => (
                  <div 
                    key={i}
                    className="h-1 w-8 rounded-full transition-colors"
                    style={{ 
                      backgroundColor: code.length > i * 4 ? PRIMARY : BORDER 
                    }}
                  />
                ))}
              </div>
              <span 
                className="text-xs font-medium"
                style={{ color: code.length === 16 ? '#46d369' : 'rgba(255,255,255,0.4)' }}
              >
                {code.length}/16
              </span>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div 
              className="flex items-start gap-3 rounded-xl p-4"
              style={{ 
                backgroundColor: 'rgba(229,9,20,0.1)', 
                border: '1px solid rgba(229,9,20,0.2)' 
              }}
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: PRIMARY }} />
              <p className="text-sm" style={{ color: PRIMARY }}>{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading || code.length !== 16}
            style={btnPrimary}
            onMouseEnter={btnPrimaryHover}
            onMouseLeave={btnPrimaryLeave}
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <span 
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"
                />
                <span>Giriş yapılıyor...</span>
              </span>
            ) : (
              'Giriş Yap'
            )}
          </button>

          {/* Register Link */}
          <div className="text-center">
            <p className="text-white/60 text-sm mb-2">
              Hesabınız yok mu?{' '}
              <Link 
                to="/register" 
                className="font-semibold transition-colors hover:underline"
                style={{ color: PRIMARY }}
              >
                Hesap Oluştur
              </Link>
            </p>
            <Link 
              to="/" 
              className="text-white/40 text-xs hover:text-white/60 transition-colors inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3 h-3" />
              Ana Sayfaya Dön
            </Link>
          </div>
        </form>

        {/* Features */}
        <div className="grid grid-cols-3 gap-3 mt-10">
          {[
            { icon: Lock, label: 'Güvenli', desc: 'Şifreli erişim' },
            { icon: Zap, label: 'Hızlı', desc: 'Anında yayın' },
            { icon: Smartphone, label: 'Her Yerde', desc: 'Tüm cihazlar' },
          ].map((item, i) => (
            <div 
              key={i} 
              className="p-4 rounded-xl text-center transition-colors group"
              style={{ 
                backgroundColor: BG_SURFACE, 
                border: `1px solid ${BORDER}` 
              }}
            >
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-2"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}
              >
                <item.icon 
                  className="w-5 h-5 text-white/60 group-hover:text-white transition-colors" 
                />
              </div>
              <p className="text-xs font-semibold text-white">{item.label}</p>
              <p className="text-[10px] text-white/40 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <p className="text-center text-white/30 text-xs mt-8">
          © 2026 Flixify Pro. Tüm hakları saklıdır.
        </p>
      </div>
    </div>
  )
}

export default LoginPage
