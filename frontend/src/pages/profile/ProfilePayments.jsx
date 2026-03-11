import { useState, useEffect } from 'react';
import { 
  CreditCard, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Receipt, 
  Calendar, 
  ArrowUpRight,
  Upload,
  Send,
  Wallet,
  History,
  ChevronDown,
  ChevronUp,
  FileText,
  Image as ImageIcon,
  Landmark,
  Smartphone,
  Bitcoin,
  CalendarDays,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { apiFetch } from '../../config/api';

// Renkler
const PRIMARY = '#E50914';
const BG_DARK = '#0a0a0a';
const BG_SURFACE = '#141414';
const BG_CARD = '#1a1a1a';
const BORDER = '#2a2a2a';

// Odeme verileri API'den cekilir

// Ödeme yöntemleri - Iconlarla
const PAYMENT_METHODS = [
  { id: 'credit_card', name: 'Kredi Kartı', icon: CreditCard },
  { id: 'bank_transfer', name: 'Havale/EFT', icon: Landmark },
  { id: 'papara', name: 'Papara', icon: Smartphone },
  { id: 'crypto', name: 'Kripto Para', icon: Bitcoin }
];

// Tarih formatı
const formatDate = (date) => {
  return date.toISOString().split('T')[0];
};

// Bugün ve dünün tarihleri
const getToday = () => formatDate(new Date());
const getYesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
};

function ProfilePayments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Form state
  const [formData, setFormData] = useState({
    amount: '',
    date: '',
    method: '',
    description: '',
    file: null
  });
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    fetchPayments();
  }, []);

  const fetchPayments = async () => {
    try {
      const token = localStorage.getItem('iptv_auth_token');
      const response = await apiFetch('/user/payments', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Transform API data to match component format
        const formattedPayments = (data.data?.payments || []).map(p => ({
          id: p.id,
          date: p.created_at ? p.created_at.split('T')[0] : '',
          amount: parseFloat(p.amount),
          description: p.package_name || 'Paket',
          status: p.status === 'approved' ? 'completed' : p.status,
          method: p.method,
          receipt: !!p.receipt_url
        }));
        setPayments(formattedPayments);
      } else {
        setPayments([]);
      }
    } catch (error) {
      console.error('Failed to fetch payments:', error);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData({ ...formData, file });
      setFileName(file.name);
    }
  };

  const handleDateSelect = (dateStr) => {
    setFormData({ ...formData, date: dateStr });
    setShowCalendar(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    
    setTimeout(() => {
      setSubmitting(false);
      setSuccess(true);
      setFormData({ amount: '', date: '', method: '', description: '', file: null });
      setFileName('');
      
      setTimeout(() => {
        setSuccess(false);
        setShowForm(false);
      }, 3000);
    }, 1500);
  };

  // Takvim oluştur
  const generateCalendar = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    const days = [];
    for (let i = 0; i < startingDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 
                      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  const totalSpent = payments.reduce((acc, p) => acc + p.amount, 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BG_DARK }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: PRIMARY, borderTopColor: 'transparent' }} />
          <p className="text-white">Yukleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: BG_DARK }}>
      {/* Header */}
      <div className="px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Wallet className="w-8 h-8" style={{ color: PRIMARY }} />
            Odemelerim
          </h1>
          <p className="text-white/60">
            Odeme gecmisinizi gorun ve yeni odeme bildirimi yapin
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 space-y-6">
        {/* Ozet Kartlari */}
        <div className="grid grid-cols-2 gap-4">
          <div 
            className="p-5 rounded-2xl flex items-center gap-4"
            style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
          >
            <div 
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)' }}
            >
              <Receipt className="w-7 h-7" style={{ color: '#10b981' }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{payments.length}</p>
              <p className="text-sm text-white/50">Toplam Odeme</p>
            </div>
          </div>
          
          <div 
            className="p-5 rounded-2xl flex items-center gap-4"
            style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
          >
            <div 
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(59, 130, 246, 0.2)' }}
            >
              <CreditCard className="w-7 h-7" style={{ color: '#3b82f6' }} />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{totalSpent.toFixed(2)} TL</p>
              <p className="text-sm text-white/50">Toplam Harcama</p>
            </div>
          </div>
        </div>

        {/* Yeni Odeme Bildirimi Butonu */}
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all hover:scale-[1.02]"
          style={{ 
            backgroundColor: showForm ? BG_SURFACE : PRIMARY,
            color: 'white',
            border: `1px solid ${showForm ? BORDER : PRIMARY}`
          }}
        >
          {showForm ? <ChevronUp className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
          {showForm ? 'Formu Gizle' : 'Yeni Odeme Bildirimi Yap'}
        </button>

        {/* Basari Mesaji */}
        {success && (
          <div 
            className="p-4 rounded-xl flex items-center gap-3 animate-pulse"
            style={{ backgroundColor: 'rgba(70, 211, 105, 0.2)', border: '1px solid #46d369' }}
          >
            <CheckCircle className="w-6 h-6" style={{ color: '#46d369' }} />
            <div>
              <p className="font-bold text-white">Bildirim Gonderildi!</p>
              <p className="text-sm text-white/70">Admin onayladiktan sonra hesabiniz aktiflescek.</p>
            </div>
          </div>
        )}

        {/* Odeme Bildirim Formu */}
        {showForm && (
          <div 
            className="p-6 rounded-2xl"
            style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
          >
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <Send className="w-6 h-6" style={{ color: PRIMARY }} />
              Odeme Bildirimi
            </h2>
            <p className="text-white/60 mb-6 text-sm">
              Yaptiginiz odemeyi admine bildirin. Dekont veya makbuz yukleyin.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Adim 1: Tutar */}
              <div>
                <label className="block text-sm font-medium text-white mb-2 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" style={{ color: PRIMARY }} />
                  Odeme Tutari (Kac TL yatirdiniz?)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="ornek: 99.90"
                    required
                    className="w-full px-4 py-4 rounded-xl text-white text-lg placeholder-white/30 focus:outline-none"
                    style={{ 
                      backgroundColor: BG_CARD, 
                      border: `2px solid ${formData.amount ? PRIMARY : BORDER}` 
                    }}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/50 font-bold">TL</span>
                </div>
              </div>

              {/* Adim 2: Tarih - Hizli Secim */}
              <div>
                <label className="block text-sm font-medium text-white mb-2 flex items-center gap-2">
                  <Calendar className="w-4 h-4" style={{ color: PRIMARY }} />
                  Odeme Tarihi
                </label>
                
                {/* Hizli Secim Butonlari */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <button
                    type="button"
                    onClick={() => handleDateSelect(getToday())}
                    className="py-3 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: formData.date === getToday() ? PRIMARY : BG_CARD,
                      border: `2px solid ${formData.date === getToday() ? PRIMARY : BORDER}`,
                      color: 'white'
                    }}
                  >
                    <CalendarDays className="w-4 h-4" />
                    Bugun
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDateSelect(getYesterday())}
                    className="py-3 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: formData.date === getYesterday() ? PRIMARY : BG_CARD,
                      border: `2px solid ${formData.date === getYesterday() ? PRIMARY : BORDER}`,
                      color: 'white'
                    }}
                  >
                    <CalendarClock className="w-4 h-4" />
                    Dun
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCalendar(!showCalendar)}
                    className="py-3 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: showCalendar ? 'rgba(229, 9, 20, 0.2)' : BG_CARD,
                      border: `2px solid ${showCalendar ? PRIMARY : BORDER}`,
                      color: 'white'
                    }}
                  >
                    <Calendar className="w-4 h-4" />
                    Diger
                  </button>
                </div>

                {/* Secili Tarih Gostergesi */}
                {formData.date && (
                  <div 
                    className="p-3 rounded-xl flex items-center justify-between"
                    style={{ backgroundColor: 'rgba(229, 9, 20, 0.1)', border: `1px solid ${PRIMARY}` }}
                  >
                    <span className="text-white font-medium flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" style={{ color: PRIMARY }} />
                      {new Date(formData.date).toLocaleDateString('tr-TR', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, date: '' })}
                      className="text-white/50 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {/* Takvim Popup */}
                {showCalendar && (
                  <div 
                    className="mt-3 p-4 rounded-xl"
                    style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}` }}
                  >
                    {/* Takvim Header */}
                    <div className="flex items-center justify-between mb-4">
                      <button
                        type="button"
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                        className="p-2 rounded-lg hover:bg-white/10"
                      >
                        <ChevronLeft className="w-5 h-5 text-white" />
                      </button>
                      <span className="text-white font-bold">
                        {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                        className="p-2 rounded-lg hover:bg-white/10"
                      >
                        <ChevronRight className="w-5 h-5 text-white" />
                      </button>
                    </div>
                    
                    {/* Gunler */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                      {['Pzt', 'Sal', 'Car', 'Per', 'Cum', 'Cmt', 'Paz'].map(day => (
                        <div key={day} className="text-center text-xs text-white/50 py-2">{day}</div>
                      ))}
                    </div>
                    
                    {/* Tarihler */}
                    <div className="grid grid-cols-7 gap-1">
                      {generateCalendar().map((day, idx) => {
                        if (!day) return <div key={idx} />;
                        const dateStr = formatDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
                        const isSelected = formData.date === dateStr;
                        const isToday = dateStr === getToday();
                        
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleDateSelect(dateStr)}
                            className="aspect-square rounded-lg text-sm font-medium transition-all flex items-center justify-center"
                            style={{
                              backgroundColor: isSelected ? PRIMARY : isToday ? 'rgba(229, 9, 20, 0.2)' : 'transparent',
                              border: isToday && !isSelected ? `1px solid ${PRIMARY}` : 'none',
                              color: isSelected ? 'white' : 'rgba(255,255,255,0.8)'
                            }}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Adim 3: Odeme Yontemi */}
              <div>
                <label className="block text-sm font-medium text-white mb-2 flex items-center gap-2">
                  <Landmark className="w-4 h-4" style={{ color: PRIMARY }} />
                  Hangi Yontemle Odediniz?
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {PAYMENT_METHODS.map((method) => {
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, method: method.id })}
                        className="p-4 rounded-xl text-left transition-all hover:scale-[1.02] flex items-center gap-3"
                        style={{
                          backgroundColor: formData.method === method.id ? 'rgba(229, 9, 20, 0.2)' : BG_CARD,
                          border: `2px solid ${formData.method === method.id ? PRIMARY : BORDER}`,
                        }}
                      >
                        <Icon 
                          className="w-6 h-6" 
                          style={{ color: formData.method === method.id ? PRIMARY : 'rgba(255,255,255,0.5)' }} 
                        />
                        <span className="text-sm text-white font-medium">{method.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Adim 4: Aciklama */}
              <div>
                <label className="block text-sm font-medium text-white mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" style={{ color: PRIMARY }} />
                  Ek Bilgi (Isterseniz yazin)
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="ornek: Islem no: 123456"
                  className="w-full px-4 py-4 rounded-xl text-white placeholder-white/30 focus:outline-none"
                  style={{ 
                    backgroundColor: BG_CARD, 
                    border: `2px solid ${formData.description ? PRIMARY : BORDER}` 
                  }}
                />
              </div>

              {/* Adim 5: Dosya Yukleme */}
              <div>
                <label className="block text-sm font-medium text-white mb-2 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" style={{ color: PRIMARY }} />
                  Dekont / Makbuz (Fotograf veya PDF)
                </label>
                <label 
                  className="block w-full p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all hover:border-solid text-center"
                  style={{ 
                    borderColor: fileName ? PRIMARY : 'rgba(255,255,255,0.3)',
                    backgroundColor: fileName ? 'rgba(229, 9, 20, 0.1)' : BG_CARD
                  }}
                >
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {fileName ? (
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="w-6 h-6" style={{ color: PRIMARY }} />
                      <span className="text-white font-medium">{fileName}</span>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-10 h-10 mx-auto mb-2 text-white/40" />
                      <p className="text-white/60">Dosyayi buraya surukleyin veya tiklayin</p>
                      <p className="text-xs text-white/40 mt-1">PDF, JPG veya PNG</p>
                    </div>
                  )}
                </label>
              </div>

              {/* Gonder Butonu */}
              <button
                type="submit"
                disabled={submitting || !formData.amount || !formData.date || !formData.method}
                className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all"
                style={{ 
                  backgroundColor: (!formData.amount || !formData.date || !formData.method) ? 'rgba(255,255,255,0.1)' : PRIMARY,
                  color: 'white',
                  cursor: (!formData.amount || !formData.date || !formData.method) ? 'not-allowed' : 'pointer',
                  opacity: (!formData.amount || !formData.date || !formData.method) ? 0.5 : 1
                }}
              >
                {submitting ? (
                  <>
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Gonderiliyor...
                  </>
                ) : (
                  <>
                    <Send className="w-6 h-6" />
                    Bildirimi Admine Gonder
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {/* Odeme Gecmisi */}
        <div 
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
        >
          <div className="p-5 border-b flex items-center gap-3" style={{ borderColor: BORDER }}>
            <History className="w-6 h-6" style={{ color: PRIMARY }} />
            <h2 className="text-lg font-bold text-white">Odeme Gecmisim</h2>
          </div>
          
          <div className="divide-y" style={{ borderColor: BORDER }}>
            {payments.length === 0 ? (
              <div className="p-8 text-center">
                <Receipt className="w-16 h-16 mx-auto mb-4 text-white/20" />
                <p className="text-white/60">Henuz odeme kaydiniz yok.</p>
              </div>
            ) : (
              payments.map((payment) => (
                <div key={payment.id} className="p-5 flex items-center gap-4">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: 'rgba(70, 211, 105, 0.2)' }}
                  >
                    <CheckCircle className="w-6 h-6" style={{ color: '#46d369' }} />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-bold">{payment.description}</span>
                      <span 
                        className="px-2 py-0.5 rounded text-xs"
                        style={{ backgroundColor: 'rgba(70, 211, 105, 0.2)', color: '#46d369' }}
                      >
                        Tamamlandi
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-white/50">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {new Date(payment.date).toLocaleDateString('tr-TR')}
                      </span>
                      <span>{payment.method}</span>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="text-xl font-bold text-white">{payment.amount.toFixed(2)} TL</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bilgi Kutusu */}
        <div 
          className="p-5 rounded-xl flex items-start gap-3"
          style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)' }}
        >
          <AlertCircle className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: '#f59e0b' }} />
          <div>
            <p className="text-white font-medium mb-1">Bilgi</p>
            <p className="text-white/70 text-sm">
              Odeme bildirimleriniz 24 saat icinde incelenir. Herhangi bir sorun olursa 
              destek ekibimiz size e-posta gonderir.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfilePayments;
