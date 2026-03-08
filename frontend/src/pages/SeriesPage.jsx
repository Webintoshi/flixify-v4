import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { 
  Play, Plus, Info, Search, ChevronDown, X, Star, 
  TrendingUp, Clock, Calendar, ChevronLeft, ChevronRight
} from 'lucide-react';
import { fetchUserPlaylist, hasValidSubscription } from '../services/playlist';
import { groupSeriesEpisodes, parseSeriesFromPlaylist } from '../utils/playlistParser';

const PRIMARY = '#E50914';
const BG_DARK = '#0a0a0a';
const BG_SURFACE = '#141414';
const BG_CARD = '#1a1a1a';
const BORDER = '#2a2a2a';

// Platformlar - Renk kodlari ile
const PLATFORMS = [
  { id: 'all', name: 'Tumu', color: '#E50914', icon: '✨' },
  { id: 'Netflix Dizileri', name: 'Netflix', color: '#E50914', icon: '🎬' },
  { id: 'Disney+ Dizileri', name: 'Disney+', color: '#113CCF', icon: '🏰' },
  { id: 'Amazon Prime Dizileri', name: 'Prime', color: '#00A8E1', icon: '📦' },
  { id: 'TV+ Dizileri', name: 'TV+', color: '#FF6B00', icon: '📺' },
  { id: 'TOD (beIN) Dizileri', name: 'TOD', color: '#00C851', icon: '⚽' },
  { id: 'BluTV Dizileri (HBO)', name: 'BluTV', color: '#9B59B6', icon: '🐉' },
  { id: 'Apple TV+ Dizileri', name: 'Apple TV+', color: '#555555', icon: '🍎' },
  { id: 'GAİN Dizileri', name: 'GAIN', color: '#FF1493', icon: '🎯' },
  { id: 'Exxen Dizileri', name: 'Exxen', color: '#FFD700', icon: '⭐' },
  { id: 'Günlük Diziler', name: 'Gunluk', color: '#20B2AA', icon: '📅' },
  { id: 'Anime', name: 'Anime', color: '#FF69B4', icon: '🌸' },
];

const PLATFORM_ALIASES = {
  'Netflix Dizileri': ['netflix'],
  'Disney+ Dizileri': ['disney+', 'disney plus', 'disney'],
  'Amazon Prime Dizileri': ['amazon prime', 'prime video', 'prime'],
  'TV+ Dizileri': ['tv+'],
  'TOD (beIN) Dizileri': ['tod', 'bein', 'bein connect'],
  'BluTV Dizileri (HBO)': ['blutv', 'blue tv', 'bluetv', 'hbo'],
  'Apple TV+ Dizileri': ['apple tv+', 'apple tv'],
  'GAÄ°N Dizileri': ['gain'],
  'Exxen Dizileri': ['exxen'],
  'GÃ¼nlÃ¼k Diziler': ['gunluk', 'daily'],
  'Anime': ['anime']
};

const EPISODE_PATTERN = /\bS(\d{1,2})E(\d{1,3})\b/i;
const LEADING_REGION_PATTERN = /^[A-Z0-9]{2,4}\s*[•|:-]\s*/;
const TRAILING_STREAM_LABEL_PATTERN = /\s+(24\/7|FHD|HD|4K|UHD)$/i;

const unwrapProxyTargetUrl = (value) => {
  if (!value || typeof value !== 'string') {
    return '';
  }

  try {
    const parsed = new URL(value);
    const proxiedTarget = parsed.searchParams.get('url');
    return proxiedTarget ? decodeURIComponent(proxiedTarget) : value;
  } catch (error) {
    return value;
  }
};

const normalizeGenre = (rawGenre, fullTitle) => {
  let genre = (rawGenre || 'Diger').replace('TR:', '').replace('TR | ', '').trim();
  const haystack = `${genre} ${fullTitle}`.toLowerCase();

  const matchedPlatform = Object.entries(PLATFORM_ALIASES).find(([, aliases]) =>
    aliases.some((alias) => haystack.includes(alias))
  );

  if (matchedPlatform) {
    return matchedPlatform[0];
  }

  return genre;
};

const stripPlatformAlias = (value, genre) => {
  const aliases = PLATFORM_ALIASES[genre] || [];
  const lowered = value.toLowerCase();

  for (const alias of aliases) {
    if (lowered.startsWith(alias)) {
      return value.slice(alias.length).trim();
    }
  }

  return value;
};

const extractSeriesMetadata = (fullTitle, genre) => {
  const normalizedTitle = fullTitle.replace(/\s+/g, ' ').trim();
  const episodeMatch = normalizedTitle.match(EPISODE_PATTERN);

  let seriesName = episodeMatch
    ? normalizedTitle.slice(0, episodeMatch.index).trim()
    : normalizedTitle;
  const season = episodeMatch ? parseInt(episodeMatch[1], 10) : 1;
  const episode = episodeMatch ? parseInt(episodeMatch[2], 10) : 1;

  seriesName = seriesName.replace(LEADING_REGION_PATTERN, '').trim();
  seriesName = stripPlatformAlias(seriesName, genre);
  seriesName = seriesName.replace(TRAILING_STREAM_LABEL_PATTERN, '').trim();

  if (!seriesName) {
    seriesName = normalizedTitle.replace(TRAILING_STREAM_LABEL_PATTERN, '').trim() || normalizedTitle;
  }

  return {
    seriesName,
    season,
    episode
  };
};

const isSeriesTargetUrl = (value) => {
  const originalTarget = unwrapProxyTargetUrl(value).toLowerCase();
  return originalTarget.includes('/series/');
};

// Parse series from M3U
const parseSeriesFromM3U = (content) => {
  return parseSeriesFromPlaylist(content);
};

// Platform bazlı varsayılan dizi görselleri
const PLATFORM_POSTERS = {
  'Netflix Dizileri': 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=500&h=750&fit=crop',
  'Disney+ Dizileri': 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=500&h=750&fit=crop',
  'Amazon Prime Dizileri': 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=500&h=750&fit=crop',
  'TV+ Dizileri': 'https://images.unsplash.com/photo-1522869635100-9f4c5e86aa37?w=500&h=750&fit=crop',
  'TOD (beIN) Dizileri': 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?w=500&h=750&fit=crop',
  'BluTV Dizileri (HBO)': 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=500&h=750&fit=crop',
  'Apple TV+ Dizileri': 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&h=750&fit=crop',
  'GAİN Dizileri': 'https://images.unsplash.com/photo-1509347528160-9a9e33742cdb?w=500&h=750&fit=crop',
  'Exxen Dizileri': 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&h=750&fit=crop',
  'Günlük Diziler': 'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=500&h=750&fit=crop',
  'Anime': 'https://images.unsplash.com/photo-1541562232579-512a21360020?w=500&h=750&fit=crop',
  'default': 'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=500&h=750&fit=crop'
};

// Group episodes by series
const groupBySeries = (episodes) => {
  return groupSeriesEpisodes(episodes, PLATFORM_POSTERS);
};

// Series Card - Modern
const SeriesCard = ({ series, onClick }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [imageError, setImageError] = useState(false);
  
  const seasonCount = Object.keys(series.seasons).length;
  const totalEpisodes = Object.values(series.seasons).flat().length;
  const platform = PLATFORMS.find(p => p.id === series.genre) || PLATFORMS[0];
  
  // Platform bazlı varsayılan görsel veya M3U'dan gelen logo
  const getPosterUrl = () => {
    if (imageError) {
      return PLATFORM_POSTERS[series.genre] || PLATFORM_POSTERS['default'];
    }
    if (!series.logo || series.logo === '') {
      return PLATFORM_POSTERS[series.genre] || PLATFORM_POSTERS['default'];
    }
    return series.logo;
  };
  
  const posterUrl = getPosterUrl();
  
  return (
    <div 
      className="relative cursor-pointer transition-all duration-300"
      style={{ transform: isHovered ? 'scale(1.05)' : 'scale(1)', zIndex: isHovered ? 10 : 1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onClick(series)}
    >
      <div 
        className="rounded-2xl overflow-hidden"
        style={{ 
          backgroundColor: BG_CARD,
          border: `2px solid ${isHovered ? platform.color : BORDER}`,
          boxShadow: isHovered ? `0 20px 40px rgba(0,0,0,0.5), 0 0 30px ${platform.color}30` : 'none'
        }}
      >
        <div className="relative aspect-[2/3]">
          <img 
            src={posterUrl}
            alt={series.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={() => setImageError(true)}
          />
          
          {/* Platform Badge */}
          <div 
            className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold"
            style={{ backgroundColor: platform.color, color: 'white' }}
          >
            {platform.name}
          </div>
          
          {/* Hover Overlay */}
          {isHovered && (
            <div 
              className="absolute inset-0 flex flex-col justify-end p-4"
              style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)' }}
            >
              <h4 className="text-white font-bold text-lg mb-2">{series.name}</h4>
              
              <div className="flex items-center gap-3 text-sm text-white/70 mb-3">
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4 text-yellow-500" fill="currentColor" />
                  9.2
                </span>
                <span>{seasonCount} Sezon</span>
                <span>{totalEpisodes} Bolum</span>
              </div>
              
              <div className="flex items-center gap-2">
                <button 
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
                  style={{ backgroundColor: PRIMARY, color: 'white' }}
                  onClick={(e) => { e.stopPropagation(); onClick(series); }}
                >
                  <Play className="w-4 h-4" fill="currentColor" />
                  Izle
                </button>
                <button 
                  className="p-2.5 rounded-xl"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
                >
                  <Plus className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Series Row - Yatay kaydirma
const SeriesRow = ({ title, seriesList, onSeriesClick }) => {
  const sliderRef = useRef(null);
  const [showLeft, setShowLeft] = useState(false);
  const [showRight, setShowRight] = useState(true);

  if (!seriesList || seriesList.length === 0) return null;

  const scroll = (dir) => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: dir === 'left' ? -1000 : 1000, behavior: 'smooth' });
    }
  };

  const handleScroll = (e) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.target;
    setShowLeft(scrollLeft > 10);
    setShowRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  return (
    <div className="mb-10">
      <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2">
        {title}
        <span className="text-sm font-normal text-white/50">({seriesList.length})</span>
      </h2>
      
      <div className="relative group">
        {showLeft && (
          <button 
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)' }}
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>
        )}
        
        <div 
          ref={sliderRef}
          className="flex gap-4 overflow-x-auto hide-scrollbar pb-4"
          onScroll={handleScroll}
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {seriesList.map((series, index) => (
            <div key={`${series.name}-${index}`} style={{ scrollSnapAlign: 'start', minWidth: '200px' }}>
              <SeriesCard series={series} onClick={onSeriesClick} />
            </div>
          ))}
        </div>
        
        {showRight && (
          <button 
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(10px)' }}
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        )}
      </div>
    </div>
  );
};

// Hero Section - Sinematik
const HeroSection = ({ series, onPlay }) => {
  if (!series) return null;
  
  const seasonCount = Object.keys(series.seasons).length;
  const platform = PLATFORMS.find(p => p.id === series.genre) || PLATFORMS[0];
  
  // Platform bazlı hero görseli
  const heroBgUrl = series.logo || PLATFORM_POSTERS[series.genre] || PLATFORM_POSTERS['default'];
  
  return (
    <div 
      className="relative rounded-3xl overflow-hidden mb-10"
      style={{ 
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 50%, transparent 100%), url(${heroBgUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        minHeight: '500px'
      }}
    >
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, #0a0a0a 0%, transparent 50%)' }} />
      
      <div className="relative p-8 md:p-12 flex flex-col justify-end h-full min-h-[500px]">
        <div 
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full w-fit mb-4"
          style={{ backgroundColor: platform.color }}
        >
          <span className="text-lg">{platform.icon}</span>
          <span className="font-bold text-white">{platform.name} Orijinal</span>
        </div>
        
        <h1 className="text-5xl md:text-6xl font-black text-white mb-4 max-w-2xl">
          {series.name}
        </h1>
        
        <div className="flex items-center gap-4 text-white/80 mb-6">
          <span className="flex items-center gap-1 text-green-400 font-bold">
            <TrendingUp className="w-5 h-5" />
            Top 10
          </span>
          <span>{seasonCount} Sezon</span>
          <span className="px-2 py-0.5 rounded bg-white/20 text-sm">HD</span>
          <span className="px-2 py-0.5 rounded bg-white/20 text-sm">5.1</span>
        </div>
        
        <p className="text-white/70 text-lg mb-8 max-w-xl">
          {series.name} dizisini izlemeye baslayin. Tum sezonlar ve bolumler mevcut.
        </p>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => onPlay(series)}
            className="px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 transition-transform hover:scale-105"
            style={{ backgroundColor: PRIMARY, color: 'white' }}
          >
            <Play className="w-6 h-6" fill="currentColor" />
            Izlemeye Basla
          </button>
          <button 
            className="px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 text-white transition-transform hover:scale-105"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(10px)' }}
          >
            <Info className="w-6 h-6" />
            Daha Fazla Bilgi
          </button>
        </div>
      </div>
    </div>
  );
};

// Series Detail Modal
const SeriesDetailModal = ({ series, onClose, onPlayEpisode }) => {
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);
  
  if (!series) return null;
  
  const seasons = Object.keys(series.seasons).sort((a, b) => a - b);
  const episodes = series.seasons[selectedSeason] || [];
  const platform = PLATFORMS.find(p => p.id === series.genre) || PLATFORMS[0];
  
  // Platform bazlı modal hero görseli
  const modalBgUrl = series.logo || PLATFORM_POSTERS[series.genre] || PLATFORM_POSTERS['default'];
  
  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div 
        className="w-full max-w-4xl rounded-3xl overflow-hidden max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: BG_SURFACE, border: `2px solid ${BORDER}` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal Hero */}
        <div 
          className="relative h-80"
          style={{
            backgroundImage: `linear-gradient(to bottom, rgba(20,20,20,0.3) 0%, rgba(20,20,20,0.9) 100%), url(${modalBgUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        >
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          >
            <X className="w-6 h-6" />
          </button>
          
          <div className="absolute bottom-0 left-0 right-0 p-8">
            <div 
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-3"
              style={{ backgroundColor: platform.color }}
            >
              <span>{platform.icon}</span>
              <span className="font-bold text-white text-sm">{platform.name}</span>
            </div>
            <h1 className="text-4xl font-black text-white">{series.name}</h1>
          </div>
        </div>
        
        {/* Modal Content */}
        <div className="p-8">
          {/* Season Selector */}
          <div className="mb-6 relative">
            <button 
              onClick={() => setShowSeasonDropdown(!showSeasonDropdown)}
              className="flex items-center gap-3 px-6 py-3 rounded-xl text-white font-bold"
              style={{ backgroundColor: BG_CARD, border: `2px solid ${BORDER}` }}
            >
              {selectedSeason}. Sezon
              <ChevronDown className={`w-5 h-5 transition-transform ${showSeasonDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            {showSeasonDropdown && (
              <div 
                className="absolute top-full mt-2 rounded-xl overflow-hidden z-10"
                style={{ backgroundColor: BG_CARD, border: `2px solid ${BORDER}` }}
              >
                {seasons.map(season => (
                  <button 
                    key={season}
                    className={`w-full px-6 py-3 text-left font-bold transition-colors ${
                      selectedSeason == season ? 'text-white' : 'text-white/60 hover:text-white'
                    }`}
                    style={{ backgroundColor: selectedSeason == season ? 'rgba(229,9,20,0.2)' : 'transparent' }}
                    onClick={() => { setSelectedSeason(season); setShowSeasonDropdown(false); }}
                  >
                    {season}. Sezon
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Episodes List */}
          <div className="space-y-3">
            {episodes.map((ep, index) => (
              <div 
                key={ep.id}
                className="flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all hover:scale-[1.02]"
                style={{ backgroundColor: BG_DARK, border: `1px solid ${BORDER}` }}
                onClick={() => onPlayEpisode(ep)}
              >
                <div 
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-2xl font-black text-white"
                  style={{ backgroundColor: BG_SURFACE }}
                >
                  {ep.episode}
                </div>
                <div className="flex-1">
                  <h4 className="text-white font-bold mb-1">Bolum {ep.episode}</h4>
                  <p className="text-sm text-white/50">{ep.fullTitle}</p>
                </div>
                <button 
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform hover:scale-110"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <Play className="w-6 h-6 text-white" fill="currentColor" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// Custom hook for debounce
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    
    return () => clearTimeout(timer);
  }, [value, delay]);
  
  return debouncedValue;
}

function SeriesPage() {
  const navigate = useNavigate();
  const { user, token } = useAuthStore();
  
  // Redirect to package purchase if no subscription
  useEffect(() => {
    if (user && !hasValidSubscription(user)) {
      navigate('/profil/paketler', { 
        state: { 
          message: 'Dizileri izlemek için aktif bir paket satın almalısınız.' 
        } 
      })
    }
  }, [user, navigate])
  
  const [series, setSeries] = useState([]);
  const [heroSeries, setHeroSeries] = useState(null);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Debounce search query - 300ms gecikme
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const fetchSeries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // User yükleniyor, bekle
      if (!user) {
        return; // Yükleniyor durumunda kal
      }

      // Kullanıcının kendi M3U URL'sini kullan
      if (!(user?.hasM3U ?? user?.m3uUrl)) {
        setLoading(false);
        setError('M3U URL bulunamadi. Lutfen yonetici ile iletisime gecin.');
        return;
      }
      
      const text = await fetchUserPlaylist(user, token);

      if (!text || text.trim().length === 0) {
        throw new Error('M3U playlist bos veya gecersiz icerik');
      }

      const parsedEpisodes = parseSeriesFromM3U(text);
      const groupedSeries = groupBySeries(parsedEpisodes);

      if (groupedSeries.length === 0) {
        throw new Error('Playlistte gosterilecek dizi kaydi bulunamadi.');
      }

      setSeries(groupedSeries);
      
      const netflixSeries = groupedSeries.find(s => s.genre === 'Netflix Dizileri');
      setHeroSeries(netflixSeries || groupedSeries[0]);

      setLoading(false);
      return;

      /* Legacy direct-provider fallback removed in V4.
      // Dogrudan provider'dan cek - Backend artik Turkiye'de
      console.log('[Series] Fetching M3U from provider:', user.m3uUrl.substring(0, 60));
      
      const response = await fetch(user.m3uUrl, {
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18'
        }
      });
      
      if (!response.ok) {
        // Detayli hata mesaji
        if (response.status === 404) {
          throw new Error('M3U playlist bulunamadi (404). URL gecersiz veya sunucu erisilemiyor.');
        } else if (response.status === 403) {
          throw new Error('M3U erisim izni reddedildi (403). Abonelik suresi dolmus olabilir.');
        } else if (response.status === 401) {
          throw new Error('Oturum süresi dolmuş. Lütfen tekrar giriş yapın.');
        } else {
          throw new Error(`M3U yuklenemedi (HTTP ${response.status})`);
        }
      }
      
      const text = await response.text();
      
      // M3U icerigi bos mu kontrol et
      if (!text || text.trim().length === 0) {
        throw new Error('M3U playlist bos veya gecersiz icerik');
      }
      
      const parsedEpisodes = parseSeriesFromM3U(text);
      const groupedSeries = groupBySeries(parsedEpisodes);
      setSeries(groupedSeries);
      
      const netflixSeries = groupedSeries.find(s => s.genre === 'Netflix Dizileri');
      setHeroSeries(netflixSeries || groupedSeries[0]);
      setLoading(false);
      */
    } catch (err) {
      console.error('M3U fetch error:', err);
      setError('Diziler yuklenirken hata olustu: ' + err.message);
      setLoading(false);
    }
  }, [user, token]);

  useEffect(() => {
    fetchSeries();
  }, [fetchSeries]);

  // Memoized filtered series - sadece debounced query veya kategori degistiginde calisir
  const filteredSeries = useMemo(() => {
    let result = series;
    
    // Once kategori filtresi uygula
    if (activeCategory !== 'all') {
      result = result.filter(s => s.genre === activeCategory);
    }
    
    // Sonra arama filtresi uygula (debounced)
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter(s => s.name.toLowerCase().includes(query));
    }
    
    return result;
  }, [series, activeCategory, debouncedSearchQuery]);
  
  // Kategori bazli filtrelenmis diziler
  const seriesByCategory = useMemo(() => {
    const map = {};
    PLATFORMS.forEach(p => {
      if (p.id !== 'all') {
        map[p.id] = series.filter(s => s.genre === p.id);
      }
    });
    return map;
  }, [series]);

  const handlePlayEpisode = (episode) => {
    let nextEpisode = null;
    const seriesItem = series.find(s => s.name.toLowerCase() === episode.seriesName.toLowerCase());
    
    if (seriesItem) {
      const currentSeason = seriesItem.seasons[episode.season];
      if (currentSeason) {
        const currentIndex = currentSeason.findIndex(ep => ep.episode === episode.episode);
        if (currentIndex !== -1 && currentIndex < currentSeason.length - 1) {
          nextEpisode = currentSeason[currentIndex + 1];
        } else {
          const nextSeasonNum = episode.season + 1;
          const nextSeason = seriesItem.seasons[nextSeasonNum];
          if (nextSeason && nextSeason.length > 0) nextEpisode = nextSeason[0];
        }
      }
    }
    
    const nextUrl = nextEpisode ? encodeURIComponent(nextEpisode.url) : '';
    const nextTitle = nextEpisode ? encodeURIComponent(nextEpisode.fullTitle) : '';
    
    navigate(`/player?type=series&url=${encodeURIComponent(episode.url)}&title=${encodeURIComponent(episode.fullTitle)}&series=${encodeURIComponent(episode.seriesName)}&season=${episode.season}&episode=${episode.episode}&nextUrl=${nextUrl}&nextTitle=${nextTitle}`);
  };

  const handlePlaySeries = (seriesItem) => {
    const firstSeason = seriesItem.seasons[1];
    if (firstSeason && firstSeason.length > 0) handlePlayEpisode(firstSeason[0]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BG_DARK }}>
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: PRIMARY }} />
          <p className="text-white text-lg">Diziler Yukleniyor...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BG_DARK }}>
        <div className="text-center">
          <p className="text-white mb-4">{error}</p>
          <button 
            onClick={fetchSeries}
            className="px-6 py-3 rounded-xl font-bold text-white"
            style={{ backgroundColor: PRIMARY }}
          >
            Tekrar Dene
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: BG_DARK }}>
      {/* Header - Gradient Background */}
      <header className="relative overflow-hidden">
        <div 
          className="absolute inset-0"
          style={{ 
            background: 'linear-gradient(135deg, rgba(229,9,20,0.2) 0%, rgba(10,10,10,0) 50%, rgba(229,9,20,0.1) 100%)'
          }}
        />
        
        <div className="relative max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div 
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: PRIMARY }}
              >
                <Play className="w-6 h-6 text-white" fill="currentColor" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white">Diziler</h1>
                <p className="text-sm text-white/50">Populer platformlardan tum diziler</p>
              </div>
            </div>
            
            {/* Search */}
            <div className="flex-1 max-w-md ml-8">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 group-focus-within:text-white transition-colors" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Dizi ara..."
                  className="w-full pl-12 pr-4 py-3.5 rounded-2xl text-white placeholder-white/40 focus:outline-none transition-all"
                  style={{ 
                    backgroundColor: BG_SURFACE, 
                    border: `2px solid ${searchQuery ? PRIMARY : BORDER}`,
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-white/10"
                  >
                    <X className="w-4 h-4 text-white/60" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Platform Filters */}
          <div className="flex items-center gap-3 overflow-x-auto pb-2 hide-scrollbar">
            {PLATFORMS.map(platform => (
              <button
                key={platform.id}
                onClick={() => setActiveCategory(platform.id)}
                className="flex items-center gap-2.5 px-5 py-3 rounded-2xl whitespace-nowrap transition-all hover:scale-105"
                style={{
                  backgroundColor: activeCategory === platform.id ? platform.color : BG_SURFACE,
                  color: 'white',
                  border: `2px solid ${activeCategory === platform.id ? platform.color : BORDER}`,
                  boxShadow: activeCategory === platform.id ? `0 4px 20px ${platform.color}40` : 'none'
                }}
              >
                <span className="text-xl">{platform.icon}</span>
                <span className="font-bold">{platform.name}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Hero */}
        {!searchQuery && activeCategory === 'all' && (
          <HeroSection series={heroSeries} onPlay={handlePlaySeries} />
        )}

        {/* Series Rows */}
        {activeCategory === 'all' && !searchQuery && (
          <>
            <SeriesRow title="Netflix Dizileri" seriesList={seriesByCategory['Netflix Dizileri'] || []} onSeriesClick={setSelectedSeries} />
            <SeriesRow title="Disney+ Dizileri" seriesList={seriesByCategory['Disney+ Dizileri'] || []} onSeriesClick={setSelectedSeries} />
            <SeriesRow title="Amazon Prime" seriesList={seriesByCategory['Amazon Prime Dizileri'] || []} onSeriesClick={setSelectedSeries} />
            <SeriesRow title="BluTV (HBO)" seriesList={seriesByCategory['BluTV Dizileri (HBO)'] || []} onSeriesClick={setSelectedSeries} />
            <SeriesRow title="Anime" seriesList={seriesByCategory['Anime'] || []} onSeriesClick={setSelectedSeries} />
            <SeriesRow title="Gunluk Diziler" seriesList={seriesByCategory['Gunluk Diziler'] || []} onSeriesClick={setSelectedSeries} />
          </>
        )}
        
        {/* Grid View for Category */}
        {(activeCategory !== 'all' || debouncedSearchQuery) && (
          <div>
            <h2 className="text-2xl font-black text-white mb-6">
              {debouncedSearchQuery ? `Arama: "${debouncedSearchQuery}"` : PLATFORMS.find(p => p.id === activeCategory)?.name}
              <span className="text-lg font-normal text-white/50 ml-2">({filteredSeries.length})</span>
            </h2>
            {filteredSeries.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-white/50 text-lg">Sonuc bulunamadi</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredSeries.map((s, index) => (
                  <SeriesCard key={`${s.name}-${index}`} series={s} onClick={setSelectedSeries} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedSeries && (
        <SeriesDetailModal
          series={selectedSeries}
          onClose={() => setSelectedSeries(null)}
          onPlayEpisode={handlePlayEpisode}
        />
      )}
    </div>
  );
}

export default SeriesPage;
