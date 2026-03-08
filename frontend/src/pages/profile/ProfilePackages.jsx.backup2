import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, Check, Zap, Clock, Calendar, Shield, X, 
  CreditCard, Landmark, Bitcoin, Copy, CheckCircle, 
  ArrowRight, ExternalLink, Sparkles, Crown, Tv, Film, Smartphone, Headphones,
  TrendingDown, ChevronRight, Lock, Star, AlertCircle
} from 'lucide-react';

// ============================================
// 🎨 FLIXIFY DESIGN SYSTEM - Kid-First Premium
// ============================================
const THEME = {
  // Primary Palette
  primary: '#E50914',
  primaryGlow: 'rgba(229, 9, 20, 0.4)',
  primarySoft: 'rgba(229, 9, 20, 0.15)',
  
  // Background Layers
  bgDeepest: '#0a0a0a',
  bgDark: '#0f0f0f',
  bgSurface: '#141414',
  bgCard: '#1a1a1a',
  bgElevated: '#222222',
  
  // Border & Dividers
  border: 'rgba(255,255,255,0.08)',
  borderHover: 'rgba(255,255,255,0.15)',
  borderActive: 'rgba(229, 9, 20, 0.5)',
  
  // Text Hierarchy
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.7)',
  textMuted: 'rgba(255,255,255,0.5)',
  textSubtle: 'rgba(255,255,255,0.35)',
  
  // Accent Colors (Discounts)
  discount: '#f59e0b',  // Amber/Gold - premium his
  discountGlow: 'rgba(245, 158, 11, 0.3)',
  discountSoft: 'rgba(245, 158, 11, 0.15)',
  
  // Success States
  success: '#46d369',
  successSoft: 'rgba(70, 211, 105, 0.15)',
  
  // Payment Methods
  paymentCard: '#3b82f6',
  paymentBank: '#10b981',
  paymentCrypto: '#f59e0b',
};

// Glassmorphism Utilities
const GLASS = {
  card: {
    background: 'rgba(26, 26, 26, 0.8)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  elevated: {
    background: 'rgba(34, 34, 34, 0.9)',
    backdropFilter: 'blur(24px)',
    border: '1px solid rgba(255,255,255,0.12)',
  },
  glow: {
    boxShadow: `0 0 60px ${THEME.primaryGlow}, 0 4px 20px rgba(0,0,0,0.5)`,
  },
};

// Animation Presets
const ANIMATIONS = {
  fadeIn: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }
  },
  stagger: {
    animate: { transition: { staggerChildren: 0.1 } }
  },
  scale: {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
    transition: { type: 'spring', stiffness: 400, damping: 25 }
  },
  glow: {
    whileHover: { 
      boxShadow: `0 0 40px ${THEME.primaryGlow}`,
      borderColor: THEME.primary,
    }
  }
};

const PAYMENT_METHODS = [
  { 
    id: 'credit_card', 
    name: 'Kredi Kartı', 
    subtitle: 'Anında aktifasyon',
    icon: CreditCard, 
    color: THEME.paymentCard,
    bgGlow: 'rgba(59, 130, 246, 0.2)'
  },
  { 
    id: 'bank_transfer', 
    name: 'Havale / EFT', 
    subtitle: 'Banka havalesi ile',
    icon: Landmark, 
    color: THEME.paymentBank,
    bgGlow: 'rgba(16, 185, 129, 0.2)'
  },
  { 
    id: 'crypto', 
    name: 'Kripto Para', 
    subtitle: 'Bitcoin & Altcoin',
    icon: Bitcoin, 
    color: THEME.paymentCrypto,
    bgGlow: 'rgba(245, 158, 11, 0.2)'
  }
];

// Feature Icons Mapping
const FEATURE_ICONS = {
  'tv': Tv,
  'film': Film,
  '4k': Sparkles,
  'device': Smartphone,
  'support': Headphones,
  'crown': Crown,
};

// Admin panelinden paketleri yükle
const loadPackagesFromAdmin = () => {
  try {
    const stored = localStorage.getItem('flixify-packages')
    if (stored) {
      const packages = JSON.parse(stored)
      // Aktif paketleri filtrele ve formata dönüştür
      const activePackages = packages
        .filter(p => p.isActive)
        .map(p => ({
          months: p.duration,
          label: p.duration.toString(),
          unit: p.durationLabel,
          discount: p.duration > 1 ? Math.round((1 - (p.monthlyPrice * p.duration) / (p.monthlyPrice * p.duration * 1.2)) * 100) : 0,
          badge: p.badge || (p.duration > 1 ? `%${Math.round((1 - (p.monthlyPrice * p.duration) / (p.monthlyPrice * p.duration * 1.2)) * 100)}` : null),
          savingsText: p.duration > 1 ? `${Math.round(p.monthlyPrice * p.duration * 0.2)} TL` : null,
          popular: p.popular,
          best: p.duration === 12,
          price: p.monthlyPrice * p.duration,
          monthlyPrice: p.monthlyPrice
        }))
      
      if (activePackages.length > 0) {
        return {
          name: 'Flixify Pro',
          tagline: 'Sınırsız Eğlence',
          description: 'Tüm içeriklere sınırsız erişim',
          monthlyPrice: activePackages[0].monthlyPrice,
          features: packages[0]?.features?.map((f, i) => ({
            text: f,
            icon: ['tv', 'film', '4k', 'device', 'support', 'crown'][i] || 'crown'
          })) || [
            { text: '1000+ Canlı TV Kanalı', icon: 'tv' },
            { text: 'Tüm Film & Dizi Arşivi', icon: 'film' },
            { text: '4K UHD Kalite', icon: '4k' },
            { text: '7/24 VIP Destek', icon: 'support' }
          ],
          durations: activePackages
        }
      }
    }
  } catch (e) {
    console.error('Package load error:', e)
  }
  
  // Varsayılan paket (admin tanımlamazsa)
  return {
    name: 'Flixify Pro',
    tagline: 'Sınırsız Eğlence',
    description: 'Tüm içeriklere sınırsız erişim',
    monthlyPrice: 100,
    features: [
      { text: '1000+ Canlı TV Kanalı', icon: 'tv' },
      { text: 'Tüm Film & Dizi Arşivi', icon: 'film' },
      { text: '4K UHD Kalite', icon: '4k' },
      { text: '7/24 VIP Destek', icon: 'support' }
    ],
    durations: [
      { months: 1, label: '1', unit: 'Ay', discount: 0, price: 100, monthlyPrice: 100 },
      { months: 3, label: '3', unit: 'Ay', discount: 5, badge: '%5', price: 285, monthlyPrice: 95, popular: true },
      { months: 6, label: '6', unit: 'Ay', discount: 10, badge: '%10', price: 540, monthlyPrice: 90 },
      { months: 12, label: '12', unit: 'Ay', discount: 20, badge: '%20', price: 960, monthlyPrice: 80, best: true }
    ]
  }
}

const DEFAULT_PAYMENT_SETTINGS = {
  creditCardLink: '#',
  bankTransfer: {
    accountName: 'FLIXIFY PRO',
    iban: 'TR00 0000 0000 0000 0000 0000 00'
  },
  cryptoWallet: '0x0000000000000000000000000000000000000000'
};

// ============================================
// 🧩 SUB-COMPONENTS
// ============================================

const DurationCard = ({ duration, selected, onClick, monthlyPrice }) => {
  const isSelected = selected?.months === duration.months;
  const basePrice = monthlyPrice * duration.months;
  const discountAmount = basePrice * (duration.discount / 100);
  const finalPrice = basePrice - discountAmount;
  
  return (
    <motion.button
      onClick={onClick}
      className="relative group"
      style={{
        flex: 1,
        minWidth: '0',
      }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Badge */}
      {(duration.badge || duration.popular || duration.best) && (
        <motion.div
          className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap"
          style={{
            background: duration.best ? THEME.primary : duration.popular ? THEME.discount : THEME.discountSoft,
            color: duration.best || duration.popular ? '#fff' : THEME.discount,
            border: `1px solid ${duration.best || duration.popular ? 'transparent' : THEME.discount}`,
          }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {duration.best ? '🔥 En İyi' : duration.popular ? '⭐ Popüler' : duration.badge}
        </motion.div>
      )}
      
      {/* Card */}
      <div
        style={{
          background: isSelected ? `linear-gradient(145deg, ${THEME.primary} 0%, #b20710 100%)` : THEME.bgElevated,
          border: `2px solid ${isSelected ? THEME.primary : THEME.border}`,
          borderRadius: '20px',
          padding: '20px 12px',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isSelected ? `0 8px 32px ${THEME.primaryGlow}` : 'none',
        }}
        className="h-full flex flex-col items-center justify-center"
      >
        {/* Month Number */}
        <span 
          className="text-3xl font-black mb-1"
          style={{ color: isSelected ? '#fff' : THEME.textPrimary }}
        >
          {duration.label}
        </span>
        <span 
          className="text-sm font-medium mb-2"
          style={{ color: isSelected ? 'rgba(255,255,255,0.8)' : THEME.textMuted }}
        >
          {duration.unit}
        </span>
        
        {/* Price Info */}
        <div className="text-center mt-2">
          {duration.discount > 0 && (
            <span 
              className="block text-xs line-through mb-1"
              style={{ color: isSelected ? 'rgba(255,255,255,0.6)' : THEME.textSubtle }}
            >
              {basePrice.toFixed(0)} TL
            </span>
          )}
          <span 
            className="text-lg font-bold"
            style={{ color: isSelected ? '#fff' : THEME.textPrimary }}
          >
            {finalPrice.toFixed(0)} TL
          </span>
        </div>
        
        {/* Savings */}
        {duration.savingsText && (
          <div
            className="mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{
              background: isSelected ? 'rgba(255,255,255,0.2)' : THEME.discountSoft,
              color: isSelected ? '#fff' : THEME.discount,
            }}
          >
            {duration.savingsText} tasarruf
          </div>
        )}
        
        {/* Selection Indicator */}
        {isSelected && (
          <motion.div
            className="absolute bottom-2 w-1.5 h-1.5 rounded-full bg-white"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          />
        )}
      </div>
    </motion.button>
  );
};

const FeatureItem = ({ feature, index }) => {
  const Icon = FEATURE_ICONS[feature.icon] || Check;
  
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 + 0.3 }}
      className="flex items-center gap-3"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: THEME.primarySoft }}
      >
        <Icon className="w-5 h-5" style={{ color: THEME.primary }} />
      </div>
      <span style={{ color: THEME.textSecondary }} className="text-sm font-medium">
        {feature.text}
      </span>
    </motion.div>
  );
};

const PriceBreakdown = ({ pkg, selectedDuration }) => {
  const basePrice = pkg.monthlyPrice * selectedDuration.months;
  const discountAmount = basePrice * (selectedDuration.discount / 100);
  const finalPrice = basePrice - discountAmount;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-2xl p-5 mb-6"
      style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${THEME.border}` }}
    >
      <div className="space-y-3">
        {/* Monthly Price */}
        <div className="flex justify-between items-center text-sm">
          <span style={{ color: THEME.textMuted }}>Aylık Ücret</span>
          <span style={{ color: THEME.textSecondary }}>{pkg.monthlyPrice.toFixed(2)} TL</span>
        </div>
        
        {/* Duration */}
        <div className="flex justify-between items-center text-sm">
          <span style={{ color: THEME.textMuted }}>Süre</span>
          <span style={{ color: THEME.textSecondary }}>{selectedDuration.months} Ay</span>
        </div>
        
        {/* Discount */}
        {selectedDuration.discount > 0 && (
          <motion.div 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex justify-between items-center text-sm py-2 -mx-2 px-2 rounded-lg"
            style={{ background: THEME.discountSoft }}
          >
            <span style={{ color: THEME.discount }} className="font-semibold flex items-center gap-1">
              <TrendingDown className="w-4 h-4" />
              İndirim (%{selectedDuration.discount})
            </span>
            <span style={{ color: THEME.discount }} className="font-bold">
              -{discountAmount.toFixed(2)} TL
            </span>
          </motion.div>
        )}
        
        {/* Divider */}
        <div style={{ borderTop: `1px solid ${THEME.border}` }} className="pt-3 mt-3" />
        
        {/* Total */}
        <div className="flex justify-between items-center">
          <span style={{ color: THEME.textSecondary }} className="font-medium">Toplam Tutar</span>
          <motion.span 
            key={finalPrice}
            initial={{ scale: 1.2, color: THEME.primary }}
            animate={{ scale: 1, color: THEME.textPrimary }}
            className="text-3xl font-black"
          >
            {finalPrice.toFixed(2)} TL
          </motion.span>
        </div>
      </div>
    </motion.div>
  );
};

// ============================================
// 🎯 MAIN COMPONENT
// ============================================

function ProfilePackages() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, fetchUser } = useAuthStore();
  
  // Show message from redirect
  const [alertMessage, setAlertMessage] = useState(location.state?.message || null);
  
  // Track previous user state for detecting updates
  const [prevExpiry, setPrevExpiry] = useState(null);
  const [prevM3U, setPrevM3U] = useState(null);
  const [updateMessage, setUpdateMessage] = useState(null);
  
  useEffect(() => {
    if (alertMessage) {
      // Clear message after 5 seconds
      const timer = setTimeout(() => setAlertMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [alertMessage])
  
  // Check for package/M3U updates
  useEffect(() => {
    if (user) {
      // Check if package was just activated
      if (prevExpiry === null && user.expiresAt) {
        setUpdateMessage('🎉 Paketiniz aktifleştirildi!');
        setTimeout(() => setUpdateMessage(null), 5000);
      }
      // Check if M3U was just assigned
      if (prevM3U === null && user.m3uUrl) {
        setUpdateMessage('📺 M3U linkiniz tanımlandı!');
        setTimeout(() => setUpdateMessage(null), 5000);
      }
      
      setPrevExpiry(user.expiresAt);
      setPrevM3U(user.m3uUrl);
    }
  }, [user?.expiresAt, user?.m3uUrl])
  
  const [loading, setLoading] = useState(true);
  const [pkg, setPkg] = useState(() => loadPackagesFromAdmin());
  const [paymentSettings, setPaymentSettings] = useState(DEFAULT_PAYMENT_SETTINGS);
  const [selectedDuration, setSelectedDuration] = useState(() => {
    const initialPkg = loadPackagesFromAdmin();
    return initialPkg.durations?.[0];
  });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStep, setPaymentStep] = useState(1);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [copiedField, setCopiedField] = useState(null);
  const [currentPackage, setCurrentPackage] = useState(null);

  useEffect(() => {
    loadData();
    
    // Listen for admin panel changes (localStorage update)
    const handleStorageChange = (e) => {
      if (e.key === 'flixify-packages') {
        console.log('[ProfilePackages] Packages updated from admin panel');
        const updatedPackages = loadPackagesFromAdmin();
        setPkg(updatedPackages);
        setSelectedDuration(updatedPackages.durations?.[0]);
      }
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Also check for package updates every 10 seconds (faster for packages)
    const packageInterval = setInterval(() => {
      if (!document.hidden) {
        const updatedPackages = loadPackagesFromAdmin();
        // Only update if package count or prices changed
        if (JSON.stringify(updatedPackages) !== JSON.stringify(pkg)) {
          console.log('[ProfilePackages] Package prices updated');
          setPkg(updatedPackages);
        }
      }
    }, 10000); // 10 seconds
    
    // Auto-refresh user data every 60 seconds (slower to avoid rate limit)
    const userInterval = setInterval(() => {
      if (!document.hidden) {
        fetchUser();
      }
    }, 60000); // 60 seconds
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(packageInterval);
      clearInterval(userInterval);
    };
  }, [fetchUser, pkg]);

  const loadData = async () => {
    try {
      // Admin panelinden paketleri yükle
      const adminPackages = loadPackagesFromAdmin();
      setPkg(adminPackages);
      setSelectedDuration(adminPackages.durations?.[0]);

      // Ödeme ayarlarını API'den veya localStorage'dan al
      const authStorage = JSON.parse(localStorage.getItem('iptv-auth-storage') || '{}');
      const token = authStorage.state?.token;
      
      if (token) {
        const settingsResponse = await fetch(`${import.meta.env.VITE_API_URL || ''}/settings/payment`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          if (settingsData.data) {
            setPaymentSettings({
              creditCardLink: settingsData.data.creditCardLink || DEFAULT_PAYMENT_SETTINGS.creditCardLink,
              bankTransfer: settingsData.data.bankTransfer || DEFAULT_PAYMENT_SETTINGS.bankTransfer,
              cryptoWallet: settingsData.data.cryptoWallet || DEFAULT_PAYMENT_SETTINGS.cryptoWallet
            });
          }
        }
      }

      if (user?.expiresAt) {
        setCurrentPackage({ expiryDate: user.expiresAt });
      }
    } catch (error) {
      console.error('Data load error:', error);
      // Hata durumunda admin paketlerini kullan
      const adminPackages = loadPackagesFromAdmin();
      setPkg(adminPackages);
      setSelectedDuration(adminPackages.durations?.[0]);
    } finally {
      setLoading(false);
    }
  };

  const calculatePrice = (duration) => {
    const basePrice = pkg.monthlyPrice * duration.months;
    const discountAmount = basePrice * (duration.discount / 100);
    return basePrice - discountAmount;
  };

  const handleStartPurchase = () => {
    setShowPaymentModal(true);
    setPaymentStep(1);
    setSelectedMethod(null);
  };

  const handleMethodSelect = (methodId) => {
    setSelectedMethod(methodId);
    if (methodId === 'credit_card') {
      window.open(paymentSettings.creditCardLink, '_blank');
    } else {
      setPaymentStep(2);
    }
  };

  const handleCopy = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleGoToPaymentNotification = () => {
    setShowPaymentModal(false);
    navigate('/profil/odemeler');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: THEME.bgDeepest }}>
        <motion.div 
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <div className="relative w-16 h-16 mx-auto mb-4">
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: `3px solid ${THEME.primary}20` }}
            />
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: `3px solid transparent`, borderTopColor: THEME.primary }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          </div>
          <p style={{ color: THEME.textMuted }}>Yükleniyor...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: THEME.bgDeepest }}>
      {/* Header */}
      <motion.div 
        className="px-6 py-4"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: THEME.primarySoft }}
            >
              <Crown className="w-5 h-5" style={{ color: THEME.primary }} />
            </div>
            <h1 className="text-2xl font-bold" style={{ color: THEME.textPrimary }}>
              Paketim
            </h1>
          </div>
          <p style={{ color: THEME.textMuted }}>Flixify Pro erişimi satın alın</p>
        </div>
      </motion.div>

      <div className="max-w-4xl mx-auto px-6">
        {/* Alert Message from Redirect */}
        <AnimatePresence>
          {alertMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 rounded-xl flex items-center gap-3"
              style={{ 
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid rgba(239, 68, 68, 0.3)'
              }}
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#ef4444' }} />
              <p style={{ color: '#fca5a5' }}>{alertMessage}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Update Notification (Package/M3U) */}
        <AnimatePresence>
          {updateMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 rounded-xl flex items-center gap-3"
              style={{ 
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}
            >
              <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#10b981' }} />
              <p style={{ color: '#6ee7b7' }}>{updateMessage}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Aktif Paket Banner */}
        <AnimatePresence>
          {currentPackage && (
            <motion.div 
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20 }}
              className="p-5 rounded-2xl flex items-center gap-4 mb-6"
              style={{ 
                background: THEME.successSoft,
                border: `1px solid rgba(70, 211, 105, 0.3)`
              }}
            >
              <div 
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(70, 211, 105, 0.2)' }}
              >
                <Check className="w-7 h-7" style={{ color: THEME.success }} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-bold text-white">Paketiniz Aktif ✅</h2>
                <p style={{ color: THEME.textMuted }}>
                  Bitiş tarihi: {new Date(currentPackage.expiryDate).toLocaleDateString('tr-TR')}
                </p>
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/profil/odemeler')}
                className="px-4 py-2 rounded-xl text-sm font-semibold"
                style={{ background: THEME.success, color: '#fff' }}
              >
                Yenile
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 🎯 MAIN PACKAGE CARD - Mega Premium Design */}
        <motion.div 
          className="rounded-3xl p-1 mb-6"
          style={{
            background: `linear-gradient(145deg, ${THEME.primary}20 0%, ${THEME.bgSurface} 50%, ${THEME.primary}10 100%)`,
          }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div 
            className="rounded-[22px] p-8"
            style={{
              background: `linear-gradient(180deg, ${THEME.bgSurface} 0%, ${THEME.bgCard} 100%)`,
              border: `1px solid ${THEME.border}`,
            }}
          >
            {/* Package Header */}
            <motion.div 
              className="text-center mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {/* Icon */}
              <motion.div
                className="w-24 h-24 rounded-3xl mx-auto mb-5 flex items-center justify-center relative"
                style={{
                  background: `linear-gradient(145deg, ${THEME.primary}30 0%, ${THEME.primary}10 100%)`,
                  boxShadow: `0 8px 32px ${THEME.primaryGlow}`,
                }}
                whileHover={{ scale: 1.05, rotate: 5 }}
                transition={{ type: 'spring', stiffness: 300 }}
              >
                <Zap className="w-12 h-12" style={{ color: THEME.primary }} />
                {/* Sparkle decorations */}
                <motion.div
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full"
                  style={{ background: THEME.discount }}
                  animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </motion.div>
              
              {/* Title */}
              <h2 className="text-4xl font-black mb-2" style={{ color: THEME.textPrimary }}>
                {pkg.name}
              </h2>
              <p className="text-lg font-medium mb-1" style={{ color: THEME.discount }}>
                {pkg.tagline}
              </p>
              <p style={{ color: THEME.textMuted }}>{pkg.description}</p>
            </motion.div>

            {/* Duration Selection */}
            <motion.div 
              className="mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center justify-center gap-2 mb-5">
                <Clock className="w-4 h-4" style={{ color: THEME.textMuted }} />
                <span style={{ color: THEME.textMuted }} className="text-sm font-medium">
                  Ne kadar süreyle erişmek istiyorsunuz?
                </span>
              </div>
              
              {/* Duration Cards Grid */}
              <div className="flex gap-3 flex-wrap justify-center">
                {pkg.durations.map((dur, idx) => (
                  <DurationCard
                    key={dur.months}
                    duration={dur}
                    selected={selectedDuration}
                    onClick={() => setSelectedDuration(dur)}
                    monthlyPrice={pkg.monthlyPrice}
                  />
                ))}
              </div>
            </motion.div>

            {/* Price Breakdown */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <PriceBreakdown pkg={pkg} selectedDuration={selectedDuration} />
            </motion.div>

            {/* Features Grid */}
            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {pkg.features.map((feature, idx) => (
                <FeatureItem key={idx} feature={feature} index={idx} />
              ))}
            </motion.div>

            {/* CTA Button - Kid-Friendly Giant Button */}
            <motion.button
              onClick={handleStartPurchase}
              className="w-full py-6 rounded-2xl font-black text-xl flex items-center justify-center gap-3 relative overflow-hidden group"
              style={{ 
                background: `linear-gradient(145deg, ${THEME.primary} 0%, #b20710 100%)`,
                color: '#fff',
                boxShadow: `0 8px 32px ${THEME.primaryGlow}`,
              }}
              whileHover={{ 
                scale: 1.02,
                boxShadow: `0 12px 40px ${THEME.primaryGlow}`,
              }}
              whileTap={{ scale: 0.98 }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              {/* Shine Effect */}
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                initial={{ x: '-100%' }}
                whileHover={{ x: '100%' }}
                transition={{ duration: 0.6 }}
              />
              
              <Sparkles className="w-6 h-6" />
              <span>Hemen Başla</span>
              <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </motion.button>
            
            {/* Trust Badges */}
            <motion.div 
              className="flex items-center justify-center gap-6 mt-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <div className="flex items-center gap-1.5" style={{ color: THEME.textSubtle }}>
                <Lock className="w-3.5 h-3.5" />
                <span className="text-xs">256-bit SSL</span>
              </div>
              <div className="flex items-center gap-1.5" style={{ color: THEME.textSubtle }}>
                <CheckCircle className="w-3.5 h-3.5" />
                <span className="text-xs">Anında Aktivasyon</span>
              </div>
              <div className="flex items-center gap-1.5" style={{ color: THEME.textSubtle }}>
                <Star className="w-3.5 h-3.5" />
                <span className="text-xs">7/24 Destek</span>
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Güvenlik Bilgisi */}
        <motion.div 
          className="p-5 rounded-2xl flex items-start gap-4"
          style={{ 
            background: 'rgba(59, 130, 246, 0.08)',
            border: `1px solid rgba(59, 130, 246, 0.2)`
          }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(59, 130, 246, 0.15)' }}
          >
            <Shield className="w-6 h-6" style={{ color: THEME.paymentCard }} />
          </div>
          <div>
            <p className="text-white font-semibold mb-1">Güvenli Ödeme 🔒</p>
            <p style={{ color: THEME.textMuted }} className="text-sm leading-relaxed">
              Tüm ödemeleriniz 256-bit SSL sertifikası ile korunur. 
              Kredi kartı bilgileriniz <span className="text-white font-medium">asla kaydedilmez</span>.
            </p>
          </div>
        </motion.div>
      </div>

      {/* ============================================
          💳 PAYMENT MODAL - Premium Experience
      ============================================ */}
      <AnimatePresence>
        {showPaymentModal && (
          <motion.div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPaymentModal(false)}
          >
            <motion.div 
              className="w-full max-w-lg rounded-3xl p-6 max-h-[90vh] overflow-y-auto"
              style={{ 
                background: `linear-gradient(180deg, ${THEME.bgSurface} 0%, ${THEME.bgCard} 100%)`,
                border: `1px solid ${THEME.border}`,
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.8)',
              }}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {paymentStep === 1 ? 'Ödeme Yöntemi' : 'Ödeme Bilgileri'}
                  </h3>
                  <p className="text-sm mt-1" style={{ color: THEME.textMuted }}>
                    {selectedDuration?.months} Aylık • {calculatePrice(selectedDuration).toFixed(2)} TL
                  </p>
                </div>
                <motion.button 
                  onClick={() => setShowPaymentModal(false)} 
                  className="p-2 rounded-xl hover:bg-white/10 transition-colors"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <X className="w-5 h-5" style={{ color: THEME.textMuted }} />
                </motion.button>
              </div>

              {/* Adım 1: Ödeme Yöntemi */}
              <AnimatePresence mode="wait">
                {paymentStep === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <p className="text-sm mb-4" style={{ color: THEME.textMuted }}>
                      Ödeme yönteminizi seçin:
                    </p>
                    
                    <div className="space-y-3 mb-6">
                      {PAYMENT_METHODS.map((method, idx) => {
                        const Icon = method.icon;
                        return (
                          <motion.button
                            key={method.id}
                            onClick={() => handleMethodSelect(method.id)}
                            className="w-full p-4 rounded-2xl flex items-center gap-4 text-left group relative overflow-hidden"
                            style={{ 
                              background: THEME.bgElevated,
                              border: `2px solid ${selectedMethod === method.id ? method.color : THEME.border}`,
                            }}
                            whileHover={{ 
                              scale: 1.02,
                              borderColor: method.color,
                            }}
                            whileTap={{ scale: 0.98 }}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                          >
                            {/* Hover Glow */}
                            <motion.div
                              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ background: method.bgGlow }}
                            />
                            
                            <div 
                              className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-10"
                              style={{ background: `${method.color}20` }}
                            >
                              <Icon className="w-7 h-7" style={{ color: method.color }} />
                            </div>
                            <div className="flex-1 relative z-10">
                              <p className="text-white font-bold text-lg">{method.name}</p>
                              <p className="text-sm" style={{ color: THEME.textMuted }}>
                                {method.subtitle}
                              </p>
                            </div>
                            <ChevronRight 
                              className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" 
                              style={{ color: THEME.textSubtle }}
                            />
                          </motion.button>
                        );
                      })}
                    </div>

                    {/* Süre Değiştir */}
                    <motion.button
                      onClick={() => setShowPaymentModal(false)}
                      className="w-full py-4 rounded-2xl font-medium flex items-center justify-center gap-2"
                      style={{ background: THEME.bgElevated, color: THEME.textSecondary }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Calendar className="w-4 h-4" />
                      Süreyi Değiştir
                    </motion.button>
                  </motion.div>
                )}

                {/* Adım 2: Havale/Kripto Bilgileri */}
                {paymentStep === 2 && selectedMethod && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                  >
                    {/* Toplam Tutar Card */}
                    <motion.div 
                      className="p-5 rounded-2xl mb-6 text-center"
                      style={{ 
                        background: `linear-gradient(145deg, ${THEME.primary}20 0%, ${THEME.bgElevated} 100%)`,
                        border: `1px solid ${THEME.border}`,
                      }}
                    >
                      <p className="text-sm mb-1" style={{ color: THEME.textMuted }}>
                        Ödemeniz Gereken Tutar
                      </p>
                      <p className="text-4xl font-black text-white">
                        {calculatePrice(selectedDuration).toFixed(2)} TL
                      </p>
                    </motion.div>

                    {/* Havale/EFT */}
                    {selectedMethod === 'bank_transfer' && (
                      <div className="space-y-4 mb-6">
                        <motion.div 
                          className="p-5 rounded-2xl"
                          style={{ 
                            background: THEME.bgElevated,
                            border: `1px solid ${THEME.paymentBank}40`,
                          }}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <div className="flex items-center gap-3 mb-4">
                            <div 
                              className="w-10 h-10 rounded-xl flex items-center justify-center"
                              style={{ background: `${THEME.paymentBank}20` }}
                            >
                              <Landmark className="w-5 h-5" style={{ color: THEME.paymentBank }} />
                            </div>
                            <span className="text-white font-bold">Havale / EFT Bilgileri</span>
                          </div>
                          
                          <div className="space-y-4">
                            <div>
                              <label className="text-xs block mb-2" style={{ color: THEME.textMuted }}>
                                Hesap Adı
                              </label>
                              <div className="flex items-center gap-2">
                                <code 
                                  className="flex-1 text-sm px-4 py-3 rounded-xl font-mono"
                                  style={{ background: 'rgba(0,0,0,0.3)', color: THEME.textPrimary }}
                                >
                                  {paymentSettings.bankTransfer.accountName}
                                </code>
                                <CopyButton 
                                  text={paymentSettings.bankTransfer.accountName}
                                  field="accountName"
                                  copiedField={copiedField}
                                  onCopy={handleCopy}
                                />
                              </div>
                            </div>
                            
                            <div>
                              <label className="text-xs block mb-2" style={{ color: THEME.textMuted }}>
                                IBAN
                              </label>
                              <div className="flex items-center gap-2">
                                <code 
                                  className="flex-1 text-sm px-4 py-3 rounded-xl font-mono"
                                  style={{ background: 'rgba(0,0,0,0.3)', color: THEME.textPrimary }}
                                >
                                  {paymentSettings.bankTransfer.iban}
                                </code>
                                <CopyButton 
                                  text={paymentSettings.bankTransfer.iban}
                                  field="iban"
                                  copiedField={copiedField}
                                  onCopy={handleCopy}
                                />
                              </div>
                            </div>
                          </div>
                        </motion.div>

                        {/* Info Alert */}
                        <motion.div 
                          className="p-4 rounded-xl text-sm flex items-start gap-3"
                          style={{ 
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: `1px solid rgba(245, 158, 11, 0.3)`
                          }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2 }}
                        >
                          <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: THEME.discount }} />
                          <span style={{ color: THEME.textSecondary }}>
                            <span className="font-semibold" style={{ color: THEME.discount }}>Bilgi:</span>{' '}
                            Havale yaptıktan sonra bildirim yaparak hesabınızı anında aktif edebilirsiniz.
                          </span>
                        </motion.div>
                      </div>
                    )}

                    {/* Kripto */}
                    {selectedMethod === 'crypto' && (
                      <div className="space-y-4 mb-6">
                        <motion.div 
                          className="p-5 rounded-2xl"
                          style={{ 
                            background: THEME.bgElevated,
                            border: `1px solid ${THEME.paymentCrypto}40`,
                          }}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                        >
                          <div className="flex items-center gap-3 mb-4">
                            <div 
                              className="w-10 h-10 rounded-xl flex items-center justify-center"
                              style={{ background: `${THEME.paymentCrypto}20` }}
                            >
                              <Bitcoin className="w-5 h-5" style={{ color: THEME.paymentCrypto }} />
                            </div>
                            <span className="text-white font-bold">Kripto Cüzdan Adresi</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <code 
                              className="flex-1 text-xs px-4 py-4 rounded-xl font-mono break-all"
                              style={{ background: 'rgba(0,0,0,0.3)', color: THEME.textPrimary }}
                            >
                              {paymentSettings.cryptoWallet}
                            </code>
                            <CopyButton 
                              text={paymentSettings.cryptoWallet}
                              field="crypto"
                              copiedField={copiedField}
                              onCopy={handleCopy}
                            />
                          </div>
                        </motion.div>

                        <motion.div 
                          className="p-4 rounded-xl text-sm flex items-start gap-3"
                          style={{ 
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: `1px solid rgba(245, 158, 11, 0.3)`
                          }}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.2 }}
                        >
                          <Sparkles className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: THEME.discount }} />
                          <span style={{ color: THEME.textSecondary }}>
                            <span className="font-semibold" style={{ color: THEME.discount }}>Bilgi:</span>{' '}
                            Transfer yaptıktan sonra TXID ile bildirim yapın.
                          </span>
                        </motion.div>
                      </div>
                    )}

                    {/* Ödeme Bildirimi Butonu */}
                    <motion.button
                      onClick={handleGoToPaymentNotification}
                      className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 mb-3"
                      style={{ background: THEME.primary }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <ExternalLink className="w-5 h-5" />
                      Ödeme Bildirimi Yap
                    </motion.button>

                    <motion.button
                      onClick={() => setPaymentStep(1)}
                      className="w-full py-4 rounded-2xl font-medium"
                      style={{ background: THEME.bgElevated, color: THEME.textSecondary }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Başka Yöntem Seç
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Copy Button Component
const CopyButton = ({ text, field, copiedField, onCopy }) => (
  <motion.button
    onClick={() => onCopy(text, field)}
    className="p-3 rounded-xl transition-colors flex-shrink-0"
    style={{ 
      background: copiedField === field ? THEME.successSoft : 'rgba(255,255,255,0.1)',
    }}
    whileHover={{ scale: 1.1 }}
    whileTap={{ scale: 0.9 }}
  >
    {copiedField === field ? (
      <CheckCircle className="w-5 h-5" style={{ color: THEME.success }} />
    ) : (
      <Copy className="w-5 h-5" style={{ color: THEME.textMuted }} />
    )}
  </motion.button>
);

export default ProfilePackages;
