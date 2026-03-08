import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Check, Zap, Crown, Tv, Film, Smartphone, Headphones,
  CreditCard, Landmark, Bitcoin, Copy, CheckCircle, 
  Sparkles, AlertCircle, Loader2, X, Wallet, Building2,
  MessageCircle, Clock, Shield
} from 'lucide-react';
import { buildApiUrl } from '../../config/api';

// ============================================
// 🎨 THEME
// ============================================
const THEME = {
  primary: '#E50914',
  primaryGlow: 'rgba(229, 9, 20, 0.4)',
  bgDeepest: '#0a0a0a',
  bgSurface: '#141414',
  bgCard: '#1a1a1a',
  border: 'rgba(255,255,255,0.08)',
  textPrimary: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.7)',
  textMuted: 'rgba(255,255,255,0.5)',
  success: '#46d369',
  discount: '#f59e0b',
};

// ============================================
// 💳 ÖDEME BİLGİLERİ (Senin bilgilerin)
// ============================================
const PAYMENT_DETAILS = {
  bank: {
    title: 'Banka Havalesi / EFT',
    icon: Building2,
    color: '#10b981',
    details: [
      { label: 'Alıcı Adı', value: 'FLIXIFY PRO', copyable: true },
      { label: 'IBAN', value: 'TR00 1234 5678 9012 3456 7890 12', copyable: true },
      { label: 'Banka', value: 'Ziraat Bankası', copyable: false },
      { label: 'Açıklama', value: 'Paket Satın Alımı', copyable: true }
    ],
    note: 'Havale/EFT yaptıktan sonra 15-30 dk içinde aktifleşir.'
  },
  papara: {
    title: 'Papara',
    icon: Wallet,
    color: '#7c3aed',
    details: [
      { label: 'Papara No', value: '1234567890', copyable: true },
      { label: 'Alıcı', value: 'flixify@email.com', copyable: true },
      { label: 'Açıklama', value: 'Papara Ödemesi', copyable: false }
    ],
    note: 'Papara ile anında ödeme yapabilirsiniz.'
  },
  crypto: {
    title: 'Kripto Para',
    icon: Bitcoin,
    color: '#f59e0b',
    details: [
      { label: 'BTC Cüzdan', value: 'bc1q...xyz', copyable: true },
      { label: 'ETH Cüzdan', value: '0x123...abc', copyable: true },
      { label: 'USDT (TRC20)', value: 'T123...xyz', copyable: true }
    ],
    note: 'Kripto ödemelerinde ağ onayı sonrası aktifleşir.'
  },
  stripe: {
    title: 'Kredi Kartı',
    icon: CreditCard,
    color: '#3b82f6',
    details: [],
    note: 'Stripe entegrasyonu yakında aktif olacak.'
  }
};

// ============================================
// 🎯 MAIN COMPONENT
// ============================================
function ProfilePackages() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, token, fetchUser } = useAuthStore();
  
  const [packages, setPackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alertMessage, setAlertMessage] = useState(location.state?.message || null);
  
  // Ödeme popup state'leri
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  // Load packages from API
  useEffect(() => {
    loadPackages();
  }, []);

  const loadPackages = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(buildApiUrl('/packages/public'));
      
      if (!response.ok) {
        throw new Error('Paketler yüklenemedi');
      }
      
      const data = await response.json();
      const pkgs = data.data?.packages || [];
      
      // Sort by duration
      pkgs.sort((a, b) => a.duration - b.duration);
      
      setPackages(pkgs);
      
      // Select popular package or second one
      const popular = pkgs.find(p => p.isPopular);
      setSelectedPackage(popular || pkgs[1] || pkgs[0]);
    } catch (err) {
      console.error('Load packages error:', err);
      setError(err.message);
      setPackages([]);
    } finally {
      setLoading(false);
    }
  };

  // Clear alert
  useEffect(() => {
    if (alertMessage) {
      const timer = setTimeout(() => setAlertMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [alertMessage]);

  // Auto-refresh user data
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) fetchUser();
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchUser]);

  // Kopyalama fonksiyonu
  const handleCopy = async (text, fieldId) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Kopyalama hatası:', err);
    }
  };

  // Ödeme popup'ını aç
  const openPaymentModal = () => {
    if (!selectedPackage) return;
    setShowPaymentModal(true);
    setSelectedPaymentMethod(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: THEME.bgDeepest }}>
        <Loader2 className="w-12 h-12 animate-spin" style={{ color: THEME.primary }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: THEME.bgDeepest }}>
        <AlertCircle className="w-16 h-16 mb-4" style={{ color: '#ef4444' }} />
        <p className="text-white mb-4">{error}</p>
        <button 
          onClick={loadPackages}
          className="px-6 py-3 rounded-xl font-medium text-white"
          style={{ backgroundColor: THEME.primary }}
        >
          Tekrar Dene
        </button>
      </div>
    );
  }

  const hasActivePackage = user?.expiresAt && new Date(user.expiresAt) > new Date();

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: THEME.bgDeepest }}>
      {/* Header */}
      <div className="px-6 py-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
          style={{ background: `linear-gradient(135deg, ${THEME.primary}40 0%, ${THEME.primary}20 100%)` }}
        >
          <Crown className="w-8 h-8" style={{ color: THEME.primary }} />
        </motion.div>
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl md:text-4xl font-black text-white mb-2"
        >
          Flixify Pro
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-lg"
          style={{ color: THEME.discount }}
        >
          Sınırsız Eğlence
        </motion.p>
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-2"
          style={{ color: THEME.textMuted }}
        >
          Tüm içeriklere sınırsız erişim
        </motion.p>
      </div>

      {/* Alert */}
      <AnimatePresence>
        {alertMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mx-6 mb-6 p-4 rounded-xl flex items-center gap-3"
            style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)' }}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#ef4444' }} />
            <p style={{ color: '#fca5a5' }}>{alertMessage}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Active Package Status */}
      {hasActivePackage && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-6 mb-8 p-4 rounded-xl flex items-center gap-4"
          style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)' }}
        >
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(16, 185, 129, 0.3)' }}>
            <CheckCircle className="w-5 h-5" style={{ color: THEME.success }} />
          </div>
          <div>
            <p className="font-bold" style={{ color: THEME.success }}>Aktif Paketiniz Var</p>
            <p className="text-sm" style={{ color: THEME.textSecondary }}>
              Bitiş: {new Date(user.expiresAt).toLocaleDateString('tr-TR')}
            </p>
          </div>
        </motion.div>
      )}

      {/* Package Selection */}
      <div className="px-6 max-w-6xl mx-auto">
        <p className="text-center mb-8" style={{ color: THEME.textMuted }}>
          Ne kadar süreyle erişmek istiyorsunuz?
        </p>

        {/* Package Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {packages.map((pkg, index) => (
            <motion.div
              key={pkg.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => setSelectedPackage(pkg)}
              className={`relative rounded-2xl p-5 cursor-pointer transition-all duration-300 ${
                selectedPackage?.id === pkg.id ? 'scale-105' : 'hover:scale-102'
              }`}
              style={{
                backgroundColor: selectedPackage?.id === pkg.id ? THEME.bgCard : THEME.bgSurface,
                border: `2px solid ${selectedPackage?.id === pkg.id ? THEME.primary : THEME.border}`,
                boxShadow: selectedPackage?.id === pkg.id ? `0 0 30px ${THEME.primaryGlow}` : 'none'
              }}
            >
              {/* Badge */}
              {pkg.badge && (
                <div 
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap"
                  style={{ 
                    backgroundColor: pkg.isPopular ? THEME.primary : THEME.discount,
                    color: 'white'
                  }}
                >
                  {pkg.badge}
                </div>
              )}

              {/* Duration */}
              <div className="text-center mb-4 pt-2">
                <span className="text-4xl font-black text-white">{pkg.duration}</span>
                <span className="text-lg text-white/70 ml-1">Ay</span>
              </div>

              {/* Price */}
              <div className="text-center mb-4">
                <span className="text-2xl font-bold text-white">₺{pkg.price}</span>
                <p className="text-sm mt-1" style={{ color: THEME.textMuted }}>
                  Toplam ödeme
                </p>
              </div>

              {/* Features */}
              <ul className="space-y-2 mb-4">
                {pkg.features?.slice(0, 4).map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm" style={{ color: THEME.textSecondary }}>
                    <Check className="w-4 h-4 flex-shrink-0" style={{ color: THEME.success }} />
                    <span className="truncate">{feature}</span>
                  </li>
                ))}
              </ul>

              {/* Selection Indicator */}
              <div 
                className={`w-full py-2 rounded-xl text-center font-medium transition-colors ${
                  selectedPackage?.id === pkg.id 
                    ? 'text-white' 
                    : 'text-white/50'
                }`}
                style={{ 
                  backgroundColor: selectedPackage?.id === pkg.id ? THEME.primary : 'rgba(255,255,255,0.1)'
                }}
              >
                {selectedPackage?.id === pkg.id ? 'Seçildi ✓' : 'Seç'}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Selected Package Summary */}
        {selectedPackage && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-6 mb-6"
            style={{ backgroundColor: THEME.bgCard, border: `1px solid ${THEME.border}` }}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div 
                  className="w-14 h-14 rounded-xl flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${THEME.primary}30, ${THEME.primary}10)` }}
                >
                  <Crown className="w-7 h-7" style={{ color: THEME.primary }} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedPackage.name}</h2>
                  <p style={{ color: THEME.textSecondary }}>{selectedPackage.description}</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-baseline gap-1 justify-end">
                  <span className="text-gray-400">₺</span>
                  <span className="text-4xl font-black text-white">{selectedPackage.price}</span>
                </div>
                <p className="text-sm" style={{ color: THEME.textMuted }}>Toplam ödeme</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* CTA Button */}
        <motion.button 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={openPaymentModal}
          className="w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 shadow-lg shadow-red-900/30"
          style={{ backgroundColor: THEME.primary, color: 'white' }}
        >
          <Zap className="w-5 h-5" />
          {selectedPackage ? `₺${selectedPackage.price} - Satın Al` : 'Paket Seçin'}
        </motion.button>

        <p className="text-center mt-4 text-xs" style={{ color: THEME.textMuted }}>
          Ödeme yapmadan önce paket detaylarını kontrol edin.
        </p>
      </div>

      {/* ============================================
          💳 ÖDEME MODAL
      ============================================ */}
      <AnimatePresence>
        {showPaymentModal && selectedPackage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPaymentModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl"
              style={{ backgroundColor: THEME.bgSurface, border: `1px solid ${THEME.border}` }}
            >
              {/* Modal Header */}
              <div className="p-6 border-b" style={{ borderColor: THEME.border }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div 
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${THEME.primary}30, ${THEME.primary}10)` }}
                    >
                      <Wallet className="w-6 h-6" style={{ color: THEME.primary }} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Ödeme Yap</h2>
                      <p style={{ color: THEME.textMuted }}>
                        {selectedPackage.name} - ₺{selectedPackage.price}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowPaymentModal(false)}
                    className="p-2 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="p-6">
                {!selectedPaymentMethod ? (
                  /* Ödeme Yöntemi Seçimi */
                  <div className="space-y-4">
                    <p className="text-sm font-medium mb-4" style={{ color: THEME.textMuted }}>
                      Ödeme yönteminizi seçin:
                    </p>
                    
                    {/* Stripe - Kredi Kartı */}
                    <PaymentMethodCard
                      method="stripe"
                      isActive={false}
                      onClick={() => setSelectedPaymentMethod('stripe')}
                    />
                    
                    {/* Banka Havalesi */}
                    <PaymentMethodCard
                      method="bank"
                      isActive={false}
                      onClick={() => setSelectedPaymentMethod('bank')}
                    />
                    
                    {/* Papara */}
                    <PaymentMethodCard
                      method="papara"
                      isActive={false}
                      onClick={() => setSelectedPaymentMethod('papara')}
                    />
                    
                    {/* Kripto */}
                    <PaymentMethodCard
                      method="crypto"
                      isActive={false}
                      onClick={() => setSelectedPaymentMethod('crypto')}
                    />
                  </div>
                ) : (
                  /* Seçilen Ödeme Yöntemi Detayı */
                  <div>
                    <button 
                      onClick={() => setSelectedPaymentMethod(null)}
                      className="flex items-center gap-2 text-sm mb-6 hover:text-white transition-colors"
                      style={{ color: THEME.textMuted }}
                    >
                      ← Geri dön
                    </button>

                    <PaymentDetailView
                      method={selectedPaymentMethod}
                      onCopy={handleCopy}
                      copiedField={copiedField}
                    />
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-6 border-t" style={{ borderColor: THEME.border, backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <div className="flex items-center gap-3 text-sm" style={{ color: THEME.textMuted }}>
                  <Shield className="w-5 h-5 text-green-500" />
                  <span>256-bit SSL güvenlik sertifikası ile korunmaktadır.</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// 💳 ÖDEME YÖNTEMİ KARTI
// ============================================
function PaymentMethodCard({ method, isActive, onClick }) {
  const config = PAYMENT_DETAILS[method];
  const Icon = config.icon;
  
  const labels = {
    stripe: 'Kredi Kartı ile Öde',
    bank: 'Banka Havalesi / EFT',
    papara: 'Papara ile Öde',
    crypto: 'Kripto Para ile Öde'
  };
  
  const subLabels = {
    stripe: 'Anında aktif olur',
    bank: '15-30 dk içinde aktif olur',
    papara: 'Anında aktif olur',
    crypto: 'Ağ onayı sonrası aktif olur'
  };

  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className="w-full p-4 rounded-2xl flex items-center gap-4 transition-all text-left group"
      style={{ 
        backgroundColor: isActive ? `${config.color}20` : THEME.bgCard,
        border: `2px solid ${isActive ? config.color : THEME.border}`
      }}
    >
      <div 
        className="w-12 h-12 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
        style={{ backgroundColor: `${config.color}20` }}
      >
        <Icon className="w-6 h-6" style={{ color: config.color }} />
      </div>
      <div className="flex-1">
        <p className="font-bold text-white">{labels[method]}</p>
        <p className="text-sm" style={{ color: THEME.textMuted }}>{subLabels[method]}</p>
      </div>
      <div 
        className="w-8 h-8 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${config.color}20` }}
      >
        <span style={{ color: config.color }}>→</span>
      </div>
    </motion.button>
  );
}

// ============================================
// 💳 ÖDEME DETAY GÖRÜNÜMÜ
// ============================================
function PaymentDetailView({ method, onCopy, copiedField }) {
  const config = PAYMENT_DETAILS[method];
  const Icon = config.icon;
  
  if (method === 'stripe') {
    return (
      <div className="text-center py-8">
        <div 
          className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center"
          style={{ backgroundColor: `${config.color}20` }}
        >
          <Clock className="w-10 h-10" style={{ color: config.color }} />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Yakında!</h3>
        <p style={{ color: THEME.textMuted }}>
          Kredi kartı ödemeleri Stripe entegrasyonu ile çok yakında aktif olacak.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <div 
          className="w-14 h-14 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${config.color}20` }}
        >
          <Icon className="w-7 h-7" style={{ color: config.color }} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">{config.title}</h3>
          <p className="text-sm" style={{ color: THEME.textMuted }}>{config.note}</p>
        </div>
      </div>

      {/* Ödeme Bilgileri */}
      <div className="space-y-3">
        {config.details.map((detail, index) => (
          <div 
            key={index}
            className="p-4 rounded-xl flex items-center justify-between gap-4"
            style={{ backgroundColor: THEME.bgCard, border: `1px solid ${THEME.border}` }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-xs mb-1" style={{ color: THEME.textMuted }}>{detail.label}</p>
              <p className="font-mono text-white truncate">{detail.value}</p>
            </div>
            {detail.copyable && (
              <button
                onClick={() => onCopy(detail.value, `${method}-${index}`)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all hover:scale-105 active:scale-95 flex-shrink-0"
                style={{ 
                  backgroundColor: copiedField === `${method}-${index}` ? '#10b981' : config.color,
                  color: 'white'
                }}
              >
                {copiedField === `${method}-${index}` ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Kopyalandı
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Kopyala
                  </>
                )}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Bildirim */}
      <div 
        className="mt-6 p-4 rounded-xl flex items-start gap-3"
        style={{ backgroundColor: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)' }}
      >
        <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
        <div>
          <p className="text-sm font-medium text-amber-400">Önemli!</p>
          <p className="text-sm mt-1" style={{ color: THEME.textSecondary }}>
            Ödeme yaptıktan sonra Telegram üzerinden bildirim gönderin veya 
            canlı destek hattımızdan iletişime geçin. Ödemeniz onaylandıktan sonra 
            paketiniz otomatik aktifleşecektir.
          </p>
        </div>
      </div>
    </div>
  );
}

export default ProfilePackages;
