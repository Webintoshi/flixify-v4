import { Link } from 'react-router-dom'

// FLIXIFY Logo - Netflix Style
// TV Ikonu ve PRO badge #E50914 (Netflix Red) renkte

function Logo({ to = '/', className = '', size = 'default' }) {
  const sizes = {
    small: {
      icon: 20,
      text: 'text-lg',
      badge: 'text-[8px] px-1 py-0.5',
      gap: 'gap-1.5'
    },
    default: {
      icon: 28,
      text: 'text-2xl',
      badge: 'text-[10px] px-1.5 py-0.5',
      gap: 'gap-2'
    },
    large: {
      icon: 40,
      text: 'text-3xl md:text-4xl',
      badge: 'text-xs px-2 py-1',
      gap: 'gap-3'
    }
  }

  const s = sizes[size]
  const PRIMARY = '#E50914'

  const content = (
    <>
      {/* TV Icon - Custom SVG ile #E50914 renkte */}
      <svg 
        width={s.icon} 
        height={s.icon} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke={PRIMARY}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="flex-shrink-0"
      >
        <rect x="2" y="7" width="20" height="15" rx="2" />
        <polyline points="17 2 12 7 7 2" />
      </svg>
      
      {/* FLIXIFY Text - Beyaz, kalın */}
      <span className={`${s.text} font-black text-white tracking-tight whitespace-nowrap`}>
        FLIXIFY
      </span>
      
      {/* PRO Badge - #E50914 arka plan, beyaz yazı */}
      <span 
        className={`${s.badge} font-bold text-white rounded-md flex-shrink-0`}
        style={{ backgroundColor: PRIMARY }}
      >
        PRO
      </span>
    </>
  )

  if (to) {
    return (
      <Link 
        to={to} 
        className={`flex items-center ${s.gap} hover:opacity-90 transition-opacity ${className}`}
        style={{ textDecoration: 'none' }}
      >
        {content}
      </Link>
    )
  }

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      {content}
    </div>
  )
}

export default Logo
