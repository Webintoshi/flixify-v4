import { useState } from 'react';
import { 
  Settings, Bell, Eye, Check, Save, Play, Clock, Volume2
} from 'lucide-react';

// Renkler
const PRIMARY = '#E50914';
const BG_DARK = '#0a0a0a';
const BG_SURFACE = '#141414';
const BG_CARD = '#1a1a1a';
const BORDER = '#2a2a2a';

function ProfileSettings() {
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState({
    // Bildirimler
    pushNotifications: true,
    paymentAlerts: true,
    newContentAlerts: false,
    
    // Oynatma
    autoPlay: true,
    autoNextEpisode: true,
    videoQuality: 'auto',
    soundStart: false
  });

  const handleToggle = (key) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const Toggle = ({ checked, onChange }) => (
    <button 
      className="w-14 h-7 rounded-full relative transition-colors duration-200"
      style={{ backgroundColor: checked ? PRIMARY : 'rgba(255,255,255,0.2)' }}
      onClick={onChange}
    >
      <span 
        className="absolute top-1 w-5 h-5 rounded-full bg-white transition-transform duration-200"
        style={{ left: checked ? '32px' : '4px' }}
      />
    </button>
  );

  return (
    <div className="min-h-screen pb-20" style={{ backgroundColor: BG_DARK }}>
      {/* Header */}
      <div className="px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Settings className="w-8 h-8" style={{ color: PRIMARY }} />
            Ayarlar
          </h1>
          <p className="text-white/60">
            Uygulama tercihlerinizi buradan degistirin
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 space-y-6">
        {/* Kaydedildi Mesaji */}
        {saved && (
          <div 
            className="p-4 rounded-xl flex items-center gap-3 animate-pulse"
            style={{ backgroundColor: 'rgba(70, 211, 105, 0.2)', border: '1px solid #46d369' }}
          >
            <Check className="w-6 h-6" style={{ color: '#46d369' }} />
            <span className="text-white font-bold">Ayarlar Kaydedildi!</span>
          </div>
        )}

        {/* Bildirimler */}
        <div 
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
        >
          <div className="p-5 border-b flex items-center gap-3" style={{ borderColor: BORDER }}>
            <Bell className="w-6 h-6" style={{ color: PRIMARY }} />
            <h2 className="text-lg font-bold text-white">Bildirimler</h2>
          </div>
          
          <div className="p-5 space-y-5">
            {/* Anlik Bildirimler */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: BG_CARD }}
                >
                  <Bell className="w-5 h-5 text-white/60" />
                </div>
                <div>
                  <p className="text-white font-medium">Anlik Bildirimler</p>
                  <p className="text-sm text-white/50">Ekranda bildirimler gosterilsin</p>
                </div>
              </div>
              <Toggle 
                checked={settings.pushNotifications}
                onChange={() => handleToggle('pushNotifications')}
              />
            </div>

            {/* Odeme Hatirlatmalari */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: BG_CARD }}
                >
                  <Clock className="w-5 h-5 text-white/60" />
                </div>
                <div>
                  <p className="text-white font-medium">Odeme Hatirlatmalari</p>
                  <p className="text-sm text-white/50">Odeme zamanim geldiginde uyar</p>
                </div>
              </div>
              <Toggle 
                checked={settings.paymentAlerts}
                onChange={() => handleToggle('paymentAlerts')}
              />
            </div>

            {/* Yeni Icerikler */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: BG_CARD }}
                >
                  <Play className="w-5 h-5 text-white/60" />
                </div>
                <div>
                  <p className="text-white font-medium">Yeni Filmler</p>
                  <p className="text-sm text-white/50">Yeni film eklendiginde haber ver</p>
                </div>
              </div>
              <Toggle 
                checked={settings.newContentAlerts}
                onChange={() => handleToggle('newContentAlerts')}
              />
            </div>
          </div>
        </div>

        {/* Oynatma Ayarlari */}
        <div 
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: BG_SURFACE, border: `1px solid ${BORDER}` }}
        >
          <div className="p-5 border-b flex items-center gap-3" style={{ borderColor: BORDER }}>
            <Eye className="w-6 h-6" style={{ color: PRIMARY }} />
            <h2 className="text-lg font-bold text-white">Oynatma</h2>
          </div>
          
          <div className="p-5 space-y-5">
            {/* Otomatik Oynatma */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: BG_CARD }}
                >
                  <Play className="w-5 h-5 text-white/60" />
                </div>
                <div>
                  <p className="text-white font-medium">Otomatik Baslat</p>
                  <p className="text-sm text-white/50">Filmi secince hemen oynat</p>
                </div>
              </div>
              <Toggle 
                checked={settings.autoPlay}
                onChange={() => handleToggle('autoPlay')}
              />
            </div>

            {/* Sonraki Bolum */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: BG_CARD }}
                >
                  <Play className="w-5 h-5 text-white/60" />
                </div>
                <div>
                  <p className="text-white font-medium">Siradaki Bolum</p>
                  <p className="text-sm text-white/50">Bolum bitince otomatik sonrakine gec</p>
                </div>
              </div>
              <Toggle 
                checked={settings.autoNextEpisode}
                onChange={() => handleToggle('autoNextEpisode')}
              />
            </div>

            {/* Ses Ac */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: BG_CARD }}
                >
                  <Volume2 className="w-5 h-5 text-white/60" />
                </div>
                <div>
                  <p className="text-white font-medium">Ses Acik Baslat</p>
                  <p className="text-sm text-white/50">Filmi ses acik baslat</p>
                </div>
              </div>
              <Toggle 
                checked={settings.soundStart}
                onChange={() => handleToggle('soundStart')}
              />
            </div>

            {/* Video Kalitesi */}
            <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor: BORDER }}>
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: BG_CARD }}
                >
                  <Eye className="w-5 h-5 text-white/60" />
                </div>
                <div>
                  <p className="text-white font-medium">Video Kalitesi</p>
                  <p className="text-sm text-white/50">Internet hizina gore secin</p>
                </div>
              </div>
              <select 
                className="px-4 py-2 rounded-xl text-white text-sm focus:outline-none cursor-pointer"
                style={{ backgroundColor: BG_CARD, border: `1px solid ${BORDER}` }}
                value={settings.videoQuality}
                onChange={(e) => handleChange('videoQuality', e.target.value)}
              >
                <option value="auto" style={{ backgroundColor: BG_CARD }}>Otomatik</option>
                <option value="4k" style={{ backgroundColor: BG_CARD }}>4K (En Iyi)</option>
                <option value="1080" style={{ backgroundColor: BG_CARD }}>1080p HD</option>
                <option value="720" style={{ backgroundColor: BG_CARD }}>720p HD</option>
                <option value="480" style={{ backgroundColor: BG_CARD }}>480p (Hizli)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Kaydet Butonu */}
        <button 
          onClick={handleSave}
          className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all hover:scale-[1.02]"
          style={{ backgroundColor: PRIMARY, color: 'white' }}
        >
          <Save className="w-6 h-6" />
          Ayarlari Kaydet
        </button>
      </div>
    </div>
  );
}

export default ProfileSettings;
