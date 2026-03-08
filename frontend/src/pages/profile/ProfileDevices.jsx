import { useState, useEffect } from 'react';
import { 
  Monitor, Smartphone, Tablet, Tv, LogOut, AlertCircle, CheckCircle, 
  Clock, MapPin, Globe, Shield, X, Trash2, Users, Power
} from 'lucide-react';
import { buildApiUrl } from '../../config/api';

// Renkler
const PRIMARY = '#E50914';
const BG_DARK = '#0a0a0a';
const BG_SURFACE = '#141414';
const BG_CARD = '#1a1a1a';
const BORDER = '#2a2a2a';

// Cihaz verileri API'den cekilir

const deviceLimits = {
  browser: { limit: 3, label: 'Bilgisayar', icon: Monitor },
  mobile: { limit: 2, label: 'Telefon', icon: Smartphone },
  tablet: { limit: 2, label: 'Tablet', icon: Tablet },
  tv: { limit: 1, label: 'Televizyon', icon: Tv }
};

function ProfileDevices() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(null);
  const [showLogoutAllConfirm, setShowLogoutAllConfirm] = useState(false);

  useEffect(() => {
    fetchDevices();
  }, []);

  const fetchDevices = async () => {
    try {
      const token = localStorage.getItem('iptv_auth_token');
      const response = await fetch(buildApiUrl('/user/devices'), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        // Transform API data to match component format
        const formattedDevices = (data.data?.devices || []).map(d => ({
          id: d.id,
          name: d.name,
          type: d.type,
          location: d.location,
          ip: d.ip_address,
          lastActive: d.last_active ? formatLastActive(d.last_active) : 'Bilinmiyor',
          isCurrent: d.is_current,
          browser: d.browser,
          os: d.os
        }));
        setDevices(formattedDevices);
      } else {
        setDevices([]);
      }
    } catch (error) {
      console.error('Failed to fetch devices:', error);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogoutDevice = async (deviceId) => {
    try {
      const token = localStorage.getItem('iptv_auth_token');
      const response = await fetch(buildApiUrl(`/user/devices/${deviceId}`), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setDevices(devices.filter(d => d.id !== deviceId));
      }
    } catch (error) {
      console.error('Failed to logout device:', error);
    }
    setShowLogoutConfirm(null);
  };

  const handleLogoutAll = () => {
    setDevices(devices.filter(d => d.isCurrent));
    setShowLogoutAllConfirm(false);
  };

  const getDeviceTypeCount = (type) => {
    return devices.filter(d => d.type === type).length;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: BG_DARK }}>
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: PRIMARY, borderTopColor: 'transparent' }} />
          <p className="text-white">Cihazlar Yukleniyor...</p>
        </div>
      </div>
    );
  }

  const currentDevice = devices.find(d => d.isCurrent);
  const otherDevices = devices.filter(d => !d.isCurrent);

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: BG_DARK }}>
      {/* Header */}
      <div className="px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Monitor className="w-8 h-8" style={{ color: PRIMARY }} />
            Cihazlarim
          </h1>
          <p className="text-white/60">
            Hesabiniza bagli cihazlari gorun ve yonetin
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 space-y-6">
        {/* Cihaz Limitleri - Kartlar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(deviceLimits).map(([type, config]) => {
            const count = getDeviceTypeCount(type);
            const Icon = config.icon;
            const isFull = count >= config.limit;
            
            return (
              <div 
                key={type}
                className="p-4 rounded-xl flex items-center gap-3"
                style={{ 
                  backgroundColor: isFull ? 'rgba(229, 9, 20, 0.15)' : BG_SURFACE,
                  border: `2px solid ${isFull ? PRIMARY : BORDER}`
                }}
              >
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: isFull ? 'rgba(229, 9, 20, 0.3)' : 'rgba(255,255,255,0.05)' }}
                >
                  <Icon className="w-5 h-5" style={{ color: isFull ? PRIMARY : 'rgba(255,255,255,0.6)' }} />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{count}/{config.limit}</p>
                  <p className="text-xs text-white/50">{config.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Su Anki Cihaz */}
        {currentDevice && (
          <div 
            className="p-5 rounded-2xl"
            style={{ backgroundColor: 'rgba(70, 211, 105, 0.1)', border: '1px solid rgba(70, 211, 105, 0.3)' }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(70, 211, 105, 0.2)' }}>
                <CheckCircle className="w-5 h-5" style={{ color: '#46d369' }} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Su Anki Cihaz</h2>
                <p className="text-sm text-white/60">Siz su an bu cihazdan izliyorsunuz</p>
              </div>
            </div>
            
            <div 
              className="p-4 rounded-xl flex items-center gap-4"
              style={{ backgroundColor: BG_SURFACE }}
            >
              <div 
                className="w-14 h-14 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: 'rgba(70, 211, 105, 0.2)' }}
              >
                <currentDevice.icon className="w-7 h-7" style={{ color: '#46d369' }} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-white font-bold">{currentDevice.name}</span>
                  <span 
                    className="px-2 py-0.5 rounded text-xs font-bold"
                    style={{ backgroundColor: '#46d369', color: 'white' }}
                  >
                    Bu Cihaz
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-white/50">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {currentDevice.lastActive}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {currentDevice.location}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Diger Cihazlar Listesi */}
        <div 
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
        >
          <div className="p-5 border-b flex items-center gap-3" style={{ borderColor: BORDER }}>
            <Users className="w-6 h-6" style={{ color: PRIMARY }} />
            <h2 className="text-lg font-bold text-white">Diger Cihazlar</h2>
            <span 
              className="ml-auto px-3 py-1 rounded-full text-sm font-medium"
              style={{ backgroundColor: BG_CARD, color: 'rgba(255,255,255,0.6)' }}
            >
              {otherDevices.length} cihaz
            </span>
          </div>
          
          {otherDevices.length === 0 ? (
            <div className="p-8 text-center">
              <Monitor className="w-16 h-16 mx-auto mb-4 text-white/20" />
              <p className="text-white/60">Baska cihaz bagli degil.</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: BORDER }}>
              {otherDevices.map((device) => {
                const DeviceIcon = device.icon;
                const isConfirming = showLogoutConfirm === device.id;
                
                return (
                  <div key={device.id} className="p-5">
                    <div className="flex items-start gap-4">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: BG_CARD }}
                      >
                        <DeviceIcon className="w-6 h-6 text-white/60" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold mb-2">{device.name}</h3>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                          <div className="flex items-center gap-2 text-white/50">
                            <Clock className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{device.lastActive}</span>
                          </div>
                          <div className="flex items-center gap-2 text-white/50">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{device.location}</span>
                          </div>
                          <div className="flex items-center gap-2 text-white/50">
                            <Globe className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">{device.ip}</span>
                          </div>
                        </div>
                        
                        <p className="text-xs text-white/40 mt-2">
                          Ilk giris: {device.loginDate}
                        </p>
                      </div>
                      
                      <div className="flex-shrink-0">
                        {isConfirming ? (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => handleLogoutDevice(device.id)}
                              className="px-4 py-2 rounded-lg text-sm font-bold text-white flex items-center gap-2"
                              style={{ backgroundColor: PRIMARY }}
                            >
                              <Trash2 className="w-4 h-4" />
                              Evet, Cikar
                            </button>
                            <button
                              onClick={() => setShowLogoutConfirm(null)}
                              className="px-4 py-2 rounded-lg text-sm font-medium text-white/70"
                              style={{ backgroundColor: BG_CARD }}
                            >
                              <X className="w-4 h-4 inline mr-1" />
                              Iptal
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowLogoutConfirm(device.id)}
                            className="px-4 py-3 rounded-xl font-medium text-sm flex items-center gap-2 transition-all hover:scale-105"
                            style={{ 
                              backgroundColor: 'rgba(229, 9, 20, 0.1)', 
                              color: PRIMARY,
                              border: `1px solid rgba(229, 9, 20, 0.3)`
                            }}
                          >
                            <LogOut className="w-4 h-4" />
                            Cikis Yap
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Tum Cihazlardan Cikis */}
        <div 
          className="p-5 rounded-2xl"
          style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div 
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(229, 9, 20, 0.2)' }}
            >
              <Power className="w-5 h-5" style={{ color: PRIMARY }} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Tum Cihazlardan Cikis</h2>
              <p className="text-sm text-white/60">Tum cihazlardan hesabinizi kapatir</p>
            </div>
          </div>
          
          {showLogoutAllConfirm ? (
            <div 
              className="p-4 rounded-xl"
              style={{ backgroundColor: 'rgba(229, 9, 20, 0.1)', border: `1px solid ${PRIMARY}` }}
            >
              <p className="text-white mb-4">
                <AlertCircle className="w-5 h-5 inline mr-2" style={{ color: PRIMARY }} />
                Tum cihazlardan cikis yapilacak. Emin misiniz?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleLogoutAll}
                  className="flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2"
                  style={{ backgroundColor: PRIMARY }}
                >
                  <Trash2 className="w-5 h-5" />
                  Evet, Hepsini Cikar
                </button>
                <button
                  onClick={() => setShowLogoutAllConfirm(false)}
                  className="px-6 py-3 rounded-xl font-medium text-white/70"
                  style={{ backgroundColor: BG_CARD }}
                >
                  Iptal
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowLogoutAllConfirm(true)}
              className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all hover:scale-[1.02]"
              style={{ 
                backgroundColor: 'rgba(229, 9, 20, 0.1)', 
                color: PRIMARY,
                border: `2px solid ${PRIMARY}`
              }}
            >
              <Power className="w-6 h-6" />
              Tum Cihazlardan Cikis Yap
            </button>
          )}
        </div>

        {/* Supheli Aktivite */}
        <div 
          className="p-5 rounded-2xl"
          style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
        >
          <div className="flex items-start gap-4">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(245, 158, 11, 0.2)' }}
            >
              <Shield className="w-6 h-6" style={{ color: '#f59e0b' }} />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-white mb-1">Supheli Aktivite</h2>
              <p className="text-white/60 text-sm mb-4">
                Tanimadiginiz bir cihaz mi goruyorsunuz? Hemen sikayet edin.
              </p>
              <button
                className="px-5 py-3 rounded-xl font-medium text-sm flex items-center gap-2 transition-all hover:scale-105"
                style={{ 
                  backgroundColor: 'rgba(245, 158, 11, 0.1)', 
                  color: '#f59e0b',
                  border: `1px solid rgba(245, 158, 11, 0.3)`
                }}
              >
                <AlertCircle className="w-5 h-5" />
                Sikayet Et
              </button>
            </div>
          </div>
        </div>

        {/* Guvenlik Bilgisi */}
        <div 
          className="p-5 rounded-xl flex items-start gap-3"
          style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)' }}
        >
          <Shield className="w-6 h-6 flex-shrink-0 mt-0.5" style={{ color: '#3b82f6' }} />
          <div>
            <p className="text-white font-medium mb-1">Guvenlik Ipuclari</p>
            <ul className="text-white/70 text-sm space-y-1">
              <li>• Tanimadiginiz cihazlari hemen cikarin</li>
              <li>• Sifrenizi kimseyle paylasmayin</li>
              <li>• Her ay cihazlarinizi kontrol edin</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileDevices;
