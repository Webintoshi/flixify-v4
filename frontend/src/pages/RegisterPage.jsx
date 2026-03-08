import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Copy, Download, Check, ArrowRight } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { buildApiUrl } from '../config/api';

// Renk tanımları
const PRIMARY = '#E50914';
const BG_DARK = '#0a0a0a';
const BG_SURFACE = '#141414';
const BG_CARD = '#1a1a1a';

function RegisterPage() {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [accountCode, setAccountCode] = useState('');
  const [displayCode, setDisplayCode] = useState(['****', '****', '****', '****']);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState(null);

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/home');
    }
  }, [isAuthenticated, navigate]);

  // Matrix/Decrypt animasyonu - YAVAŞ ve GERÇEKÇİ
  const animateCode = useCallback((finalCode) => {
    const chars = '0123456789ABCDEF';
    const groups = finalCode.match(/.{1,4}/g) || [];
    const duration = 4000; // 4 saniye - daha yavaş
    const interval = 80; // Her 80ms'de bir
    const steps = duration / interval;
    let currentStep = 0;

    setGenerating(true);

    const timer = setInterval(() => {
      currentStep++;
      
      const progress = currentStep / steps;
      
      const newDisplay = groups.map((group, groupIndex) => {
        // Her grup farklı hızda çözülsün (gerçekçi efekt)
        const groupDelay = groupIndex * 0.15;
        const groupProgress = Math.max(0, progress - groupDelay);
        
        return group.split('').map((char, charIndex) => {
          // İlerledikçe karakterler sabitlenir
          const charThreshold = (charIndex + 1) / 5;
          if (groupProgress > charThreshold) {
            return char;
          }
          // Rastgele karakter
          return chars[Math.floor(Math.random() * chars.length)];
        }).join('');
      });

      setDisplayCode(newDisplay);

      if (currentStep >= steps) {
        clearInterval(timer);
        setDisplayCode(groups);
        setGenerating(false);
      }
    }, interval);

    return () => clearInterval(timer);
  }, []);

  const generateAccountNumber = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl('/auth/register-public'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.status === 'success') {
        setAccountCode(data.data.code);
        setStep(2);
        // Animasyonu başlat
        setTimeout(() => {
          animateCode(data.data.code);
        }, 400);
      } else {
        setError(data.message || 'Hesap oluşturulurken bir hata oluştu');
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('Bağlantı hatası. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    // Try modern clipboard API first (HTTPS only)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(accountCode).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => {
        // Fallback for HTTP
        fallbackCopy();
      });
    } else {
      // Fallback for HTTP or unsupported browsers
      fallbackCopy();
    }
  };

  const fallbackCopy = () => {
    // Create temporary textarea
    const textarea = document.createElement('textarea');
    textarea.value = accountCode;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
      alert('Kod: ' + accountCode + ' - Lütfen manuel kopyalayın');
    }
    
    document.body.removeChild(textarea);
  };

  const downloadCode = () => {
    const content = `FLIXIFY PRO - HESAP NUMARANIZ
============================

Hesap Numarası: ${accountCode.match(/.{1,4}/g).join(' ')}

Bu numarayı giriş yaparken kullanacaksınız.
Lütfen güvenli bir yerde saklayın.

Oluşturulma Tarihi: ${new Date().toLocaleDateString('tr-TR')}
`;
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flixify-hesap-${accountCode.substring(0, 4)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLogin = () => {
    if (!confirmed) return;
    navigate('/login', { state: { autoFillCode: accountCode } });
  };

  // Step 1: Initial Screen
  const InitialScreen = () => (
    <div 
      className="w-full max-w-md p-8 rounded-2xl"
      style={{ backgroundColor: BG_CARD, border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">HESAP OLUŞTUR</h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Tek kullanımlık hesap numaranızı oluşturun
        </p>
      </div>

      <button 
        className="w-full py-4 rounded-xl font-bold text-white transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
        style={{ 
          backgroundColor: PRIMARY,
          opacity: loading ? 0.7 : 1,
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
        onClick={generateAccountNumber}
        disabled={loading}
      >
        {loading ? (
          <>
            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            OLUŞTURULUYOR...
          </>
        ) : (
          'HESAP NUMARASI OLUŞTUR'
        )}
      </button>

      {error && (
        <div 
          className="mt-4 p-4 rounded-xl flex items-center gap-2 text-sm"
          style={{ backgroundColor: 'rgba(229,9,20,0.1)', color: PRIMARY }}
        >
          {error}
        </div>
      )}

      <div className="mt-6 text-center text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
        Zaten hesabınız var mı?{' '}
        <Link 
          to="/login" 
          className="font-semibold hover:underline"
          style={{ color: PRIMARY }}
        >
          Giriş Yapın
        </Link>
      </div>
    </div>
  );

  // Step 2: Code Display Screen
  const CodeDisplayScreen = () => (
    <div 
      className="w-full max-w-lg p-8 rounded-2xl"
      style={{ backgroundColor: BG_CARD, border: '1px solid rgba(255,255,255,0.1)' }}
    >
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl md:text-3xl font-black text-white mb-3 tracking-tight">
          BU, HESAP<br />NUMARANIZDIR.
        </h1>
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Giriş yaparken ihtiyacınız olacağı için bu bilgiyi kaydedin.
        </p>
      </div>

      {/* Code Display - TEK SATIR, KÜÇÜK, YAVAŞ */}
      <div 
        className="mb-8 p-6 rounded-xl text-center"
        style={{ 
          backgroundColor: BG_DARK,
          border: `2px dashed ${generating ? PRIMARY : 'rgba(255,255,255,0.2)'}`,
          transition: 'border-color 0.3s ease'
        }}
      >
        {/* Tek satırda 4'lü gruplar */}
        <div 
          className="text-xl md:text-2xl font-mono font-bold tracking-[0.15em] flex justify-center items-center gap-3 md:gap-4"
          style={{ 
            color: PRIMARY,
            textShadow: generating 
              ? '0 0 10px rgba(229,9,20,0.8), 0 0 20px rgba(229,9,20,0.5)'
              : '0 0 8px rgba(229,9,20,0.6), 0 0 16px rgba(229,9,20,0.3)',
            fontFamily: 'Courier New, monospace'
          }}
        >
          {displayCode.map((group, index) => (
            <span key={index} className="inline-block">
              {group}
            </span>
          ))}
        </div>

        {/* Generating indicator */}
        {generating && (
          <div className="mt-3 flex items-center justify-center gap-2">
            <div 
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: PRIMARY }}
            />
            <span className="text-xs uppercase tracking-wider" style={{ color: PRIMARY }}>
              Şifre Çözülüyor...
            </span>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mb-8">
        <button 
          className="flex-1 py-3 px-4 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2"
          style={{ 
            backgroundColor: copied ? 'rgba(70,211,105,0.2)' : BG_SURFACE,
            border: '1px solid rgba(255,255,255,0.1)'
          }}
          onClick={copyToClipboard}
        >
          {copied ? (
            <>
              <Check className="w-5 h-5" style={{ color: '#46d369' }} />
              <span style={{ color: '#46d369' }}>KOPYALANDI</span>
            </>
          ) : (
            <>
              <Copy className="w-5 h-5" />
              KOPYALA
            </>
          )}
        </button>
        
        <button 
          className="flex-1 py-3 px-4 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-2"
          style={{ 
            backgroundColor: BG_SURFACE,
            border: '1px solid rgba(255,255,255,0.1)'
          }}
          onClick={downloadCode}
        >
          <Download className="w-5 h-5" />
          İNDİR
        </button>
      </div>

      {/* Confirmation Section */}
      <div className="mb-6">
        <p className="text-white font-medium mb-4">Hesap numaranızı kaydettiniz mi?</p>
        
        <label 
          className="flex items-center gap-3 cursor-pointer p-3 rounded-lg transition-colors"
          style={{ 
            backgroundColor: confirmed ? 'rgba(229,9,20,0.1)' : 'transparent',
            border: `1px solid ${confirmed ? PRIMARY : 'rgba(255,255,255,0.2)'}`,
          }}
        >
          <div 
            className="w-6 h-6 rounded flex items-center justify-center transition-all"
            style={{ 
              backgroundColor: confirmed ? PRIMARY : 'transparent',
              border: `2px solid ${confirmed ? PRIMARY : 'rgba(255,255,255,0.4)'}`,
            }}
          >
            {confirmed && <Check className="w-4 h-4 text-white" />}
          </div>
          <input 
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="hidden"
          />
          <span className="text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>
            Hesap numaramı kaydettiğimi onaylıyorum.
          </span>
        </label>
      </div>

      {/* Login Button */}
      <button 
        className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all"
        style={{ 
          backgroundColor: confirmed ? PRIMARY : 'rgba(229,9,20,0.3)',
          color: confirmed ? 'white' : 'rgba(255,255,255,0.5)',
          cursor: confirmed ? 'pointer' : 'not-allowed',
          letterSpacing: '0.1em'
        }}
        onClick={handleLogin}
        disabled={!confirmed}
      >
        OTURUM AÇ
        <ArrowRight className="w-5 h-5" />
      </button>

      {/* Privacy Note */}
      <p 
        className="mt-6 text-center text-xs uppercase tracking-wider"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        LÜTFEN GİZLİLİK ŞARTLARIMIZI OKUYUN. YALNIZCA BİR SAYFADIR.
      </p>
    </div>
  );

  return (
    <div 
      className="min-h-screen flex items-center justify-center p-4"
      style={{ 
        backgroundColor: BG_DARK,
        backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(229,9,20,0.05) 0%, transparent 50%)'
      }}
    >
      <div 
        className="w-full flex justify-center"
        style={{
          animation: step === 2 ? 'fadeIn 0.5s ease' : 'none'
        }}
      >
        {step === 1 ? <InitialScreen /> : <CodeDisplayScreen />}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default RegisterPage;
