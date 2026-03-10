const axios = require('axios');
const logger = require('../../config/logger');
const Code = require('../../domain/value-objects/Code');
const M3uUrl = require('../../domain/value-objects/M3uUrl');

function toChatIdSet(value) {
  return new Set(
    String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

function formatUptime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${days}g ${hours}s ${minutes}d`;
}

function normalizeProviderPlaylistUrl(value) {
  if (!value || typeof value !== 'string') {
    return value;
  }

  return value
    .trim()
    .replace('/playlisth/', '/playlist/')
    .replace('/playlists/', '/playlist/');
}

function parsePositiveInt(value, fieldName) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} pozitif tam sayi olmalidir.`);
  }
  return parsed;
}

class TelegramBotService {
  constructor({
    token,
    webhookSecret,
    webhookUrl,
    webhookHeaderSecret,
    allowedChatIds,
    notificationChatIds,
    actorAdminId,
    userRepository,
    adminRepository,
    cacheService = null
  }) {
    this._token = token;
    this._webhookSecret = webhookSecret;
    this._webhookUrl = webhookUrl;
    this._webhookHeaderSecret = webhookHeaderSecret || '';
    this._allowedChatIds = toChatIdSet(allowedChatIds);
    this._notificationChatIds = toChatIdSet(notificationChatIds);
    this._actorAdminId = actorAdminId || null;
    this._userRepository = userRepository;
    this._adminRepository = adminRepository;
    this._cacheService = cacheService;
  }

  isEnabled() {
    return Boolean(this._token && this._webhookSecret && this._allowedChatIds.size > 0);
  }

  isAuthorizedRequest(pathSecret, headerSecret) {
    if (!this.isEnabled()) {
      return false;
    }

    const pathOk = pathSecret === this._webhookSecret;
    if (!pathOk) {
      return false;
    }

    if (!this._webhookHeaderSecret) {
      return true;
    }

    return String(headerSecret || '') === this._webhookHeaderSecret;
  }

  async start() {
    if (!this.isEnabled()) {
      logger.info('Telegram bot is disabled (missing token/secret/allowed chat ids)');
      return;
    }

    if (!this._webhookUrl) {
      logger.warn('Telegram bot enabled but TELEGRAM_WEBHOOK_URL is empty. Webhook was not configured.');
      return;
    }

    const payload = {
      url: this._webhookUrl,
      allowed_updates: ['message'],
      drop_pending_updates: false
    };

    if (this._webhookHeaderSecret) {
      payload.secret_token = this._webhookHeaderSecret;
    }

    try {
      await this._telegramRequest('setWebhook', payload);
      logger.info('Telegram webhook configured successfully', {
        webhookUrl: this._webhookUrl,
        allowedChats: this._allowedChatIds.size
      });
    } catch (error) {
      logger.error('Failed to configure Telegram webhook', {
        error: error.message
      });
    }
  }

  async notifyNewRegistration({
    code,
    status = 'pending',
    createdAt = new Date().toISOString(),
    source = 'unknown',
    userId = null
  }) {
    if (!this._token) {
      return;
    }

    const targetChats = this._getNotificationChatIds();
    if (targetChats.length === 0) {
      return;
    }

    const lines = [
      'Yeni Kayit',
      `Kod: ${code}`,
      `Durum: ${status}`,
      `Kaynak: ${source}`,
      `Tarih: ${new Date(createdAt).toISOString()}`,
      `Kullanim: /setm3u ${code} http://panel.example.com/playlist/${code}.m3u 30`
    ];

    if (userId) {
      lines.push(`User ID: ${userId}`);
    }

    await this._broadcastMessage(targetChats, lines.join('\n'));
  }

  async handleUpdate(update) {
    if (!this.isEnabled() || !update || typeof update !== 'object') {
      return;
    }

    const message = update.message || update.edited_message;
    if (!message || !message.chat || !message.text) {
      return;
    }

    const chatId = String(message.chat.id);
    if (!this._allowedChatIds.has(chatId)) {
      logger.warn('Unauthorized Telegram chat tried to use bot', { chatId });
      return;
    }

    const text = String(message.text || '').trim();
    if (!text.startsWith('/')) {
      return;
    }

    const parsed = this._parseCommand(text);
    try {
      await this._dispatchCommand(chatId, parsed.command, parsed.args);
    } catch (error) {
      logger.error('Telegram command failed', {
        chatId,
        command: parsed.command,
        error: error.message
      });
      await this._sendMessage(chatId, `Komut hatasi: ${error.message}`);
    }
  }

  _parseCommand(text) {
    const parts = text.split(/\s+/);
    const rawCommand = parts.shift() || '';
    const command = rawCommand.split('@')[0].toLowerCase();
    return {
      command,
      args: parts
    };
  }

  async _dispatchCommand(chatId, command, args) {
    switch (command) {
      case '/start':
      case '/help':
        await this._sendHelp(chatId);
        return;
      case '/chatid':
        await this._sendCurrentChatId(chatId);
        return;
      case '/status':
        await this._sendStatus(chatId);
        return;
      case '/stats':
        await this._sendStats(chatId);
        return;
      case '/pending':
        await this._sendPendingUsers(chatId);
        return;
      case '/user':
        await this._sendUserDetails(chatId, args);
        return;
      case '/setm3u':
        await this._setUserM3u(chatId, args);
        return;
      case '/extend':
        await this._extendUser(chatId, args);
        return;
      case '/payments':
        await this._sendPendingPayments(chatId);
        return;
      case '/approve':
        await this._approvePayment(chatId, args);
        return;
      case '/reject':
        await this._rejectPayment(chatId, args);
        return;
      default:
        await this._sendMessage(chatId, 'Bilinmeyen komut. /help yazin.');
    }
  }

  async _sendHelp(chatId) {
    const lines = [
      'Flixify Admin Bot',
      '',
      'Komutlar:',
      '/chatid - Mevcut sohbet ID',
      '/status - Sunucu durumu',
      '/stats - Kullanici istatistikleri',
      '/pending - Bekleyen kayitlar',
      '/user <code> - Kullanici detay',
      '/setm3u <code> <m3uUrl> [gun] - M3U tanimla/aktif et',
      '/extend <code> <gun> - Sure uzat',
      '/payments - Bekleyen odemeler',
      '/approve <paymentId> - Odemeyi onayla',
      '/reject <paymentId> [neden] - Odemeyi reddet'
    ];
    await this._sendMessage(chatId, lines.join('\n'));
  }

  async _sendCurrentChatId(chatId) {
    await this._sendMessage(chatId, `Bu sohbetin chat_id degeri: ${chatId}`);
  }

  async _sendStatus(chatId) {
    let databaseStatus = 'BAGLI';
    try {
      await this._userRepository.countByStatus();
    } catch (error) {
      databaseStatus = `HATA (${error.message})`;
    }

    const lines = [
      'Sistem Durumu',
      `Ortam: ${process.env.NODE_ENV || 'development'}`,
      `Surum: ${process.env.npm_package_version || '1.0.0'}`,
      `Uptime: ${formatUptime(process.uptime())}`,
      `Database: ${databaseStatus}`,
      `Zaman: ${new Date().toISOString()}`
    ];

    await this._sendMessage(chatId, lines.join('\n'));
  }

  async _sendStats(chatId) {
    const counts = await this._userRepository.countByStatus();
    const expiredUsers = await this._userRepository.findExpired();

    const lines = [
      'Kullanici Istatistikleri',
      `Toplam: ${counts.total || 0}`,
      `Aktif: ${counts.active || 0}`,
      `Beklemede: ${counts.pending || 0}`,
      `Askida: ${counts.suspended || 0}`,
      `Suresi dolmus: ${expiredUsers.length || 0}`
    ];

    await this._sendMessage(chatId, lines.join('\n'));
  }

  async _sendPendingUsers(chatId) {
    const pendingUsers = await this._userRepository.findByStatus('pending');
    const limited = pendingUsers.slice(0, 20);

    if (limited.length === 0) {
      await this._sendMessage(chatId, 'Bekleyen kayit bulunmuyor.');
      return;
    }

    const lines = ['Bekleyen Kayitlar (ilk 20):'];
    limited.forEach((user, index) => {
      lines.push(
        `${index + 1}) ${user.code.toString()} - ${user.createdAt.toISOString()}`
      );
    });

    lines.push('');
    lines.push('Atama ornegi: /setm3u <code> <m3uUrl> 30');
    await this._sendMessage(chatId, lines.join('\n'));
  }

  async _sendUserDetails(chatId, args) {
    const codeInput = String(args[0] || '').trim();
    if (!codeInput) {
      await this._sendMessage(chatId, 'Kullanim: /user <code>');
      return;
    }

    const codeVo = Code.create(codeInput);
    const user = await this._userRepository.findByCode(codeVo);
    if (!user) {
      await this._sendMessage(chatId, `Kullanici bulunamadi: ${codeInput}`);
      return;
    }

    const access = user.canAccessContent();
    const lines = [
      `Kod: ${user.code.toString()}`,
      `Durum: ${user.status.toString()}`,
      `Olusturma: ${user.createdAt.toISOString()}`,
      `Bitis: ${user.expiresAt ? user.expiresAt.toISOString() : '-'}`,
      `M3U: ${user.m3uUrl ? user.m3uUrl.toLogString() : '-'}`,
      `Erisim: ${access.allowed ? 'ACIK' : `KAPALI (${access.reason})`}`
    ];

    await this._sendMessage(chatId, lines.join('\n'));
  }

  async _setUserM3u(chatId, args) {
    const codeInput = String(args[0] || '').trim();
    const rawUrl = String(args[1] || '').trim();

    if (!codeInput || !rawUrl) {
      await this._sendMessage(chatId, 'Kullanim: /setm3u <code> <m3uUrl> [gun]');
      return;
    }

    const codeVo = Code.create(codeInput);
    const user = await this._userRepository.findByCode(codeVo);
    if (!user) {
      await this._sendMessage(chatId, `Kullanici bulunamadi: ${codeInput}`);
      return;
    }

    const normalizedUrl = normalizeProviderPlaylistUrl(rawUrl);
    const m3uVo = M3uUrl.create(normalizedUrl);

    const hasDaysArgument = typeof args[2] !== 'undefined';
    const days = hasDaysArgument ? parsePositiveInt(args[2], 'Gun') : null;
    const expiresAt = days ? new Date(Date.now() + (days * 24 * 60 * 60 * 1000)) : user.expiresAt;

    if (user.status.canActivate) {
      const activatedUser = user.activate(
        m3uVo,
        expiresAt || null,
        'Telegram /setm3u komutu ile guncellendi'
      );
      await this._userRepository.update(activatedUser);
    } else {
      const updates = {
        m3u_url: m3uVo.toString()
      };
      if (expiresAt) {
        updates.expires_at = expiresAt.toISOString();
      }
      if (user.status.toString() === 'expired' && expiresAt) {
        updates.status = 'active';
      }
      await this._userRepository.updateById(user.id, updates);
    }

    if (this._cacheService) {
      await this._cacheService.invalidateUser(codeVo.toString());
    }

    const lines = [
      `M3U tanimlandi: ${codeVo.toString()}`,
      `Durum: ${user.status.canActivate ? 'active yapildi' : 'm3u guncellendi'}`,
      `Bitis: ${expiresAt ? expiresAt.toISOString() : '-'}`
    ];
    await this._sendMessage(chatId, lines.join('\n'));
  }

  async _extendUser(chatId, args) {
    const codeInput = String(args[0] || '').trim();
    if (!codeInput || typeof args[1] === 'undefined') {
      await this._sendMessage(chatId, 'Kullanim: /extend <code> <gun>');
      return;
    }

    const days = parsePositiveInt(args[1], 'Gun');
    const codeVo = Code.create(codeInput);
    const user = await this._userRepository.findByCode(codeVo);

    if (!user) {
      await this._sendMessage(chatId, `Kullanici bulunamadi: ${codeInput}`);
      return;
    }

    const now = new Date();
    const currentExpiry = user.expiresAt ? new Date(user.expiresAt) : null;
    const baseDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
    const newExpiry = new Date(baseDate.getTime() + (days * 24 * 60 * 60 * 1000));

    const updates = {
      expires_at: newExpiry.toISOString()
    };

    if (user.status.toString() === 'expired' && user.m3uUrl) {
      updates.status = 'active';
    }

    await this._userRepository.updateById(user.id, updates);

    if (this._cacheService) {
      await this._cacheService.invalidateUser(codeVo.toString());
    }

    await this._sendMessage(
      chatId,
      `Sure uzatildi: ${codeVo.toString()}\nYeni bitis: ${newExpiry.toISOString()}`
    );
  }

  async _sendPendingPayments(chatId) {
    const result = await this._adminRepository.getPayments();
    if (result.error) {
      throw result.error;
    }

    const pending = (result.data || [])
      .filter((payment) => payment.status === 'pending')
      .slice(0, 10);

    if (pending.length === 0) {
      await this._sendMessage(chatId, 'Bekleyen odeme bulunmuyor.');
      return;
    }

    const lines = ['Bekleyen Odemeler (ilk 10):'];
    pending.forEach((payment, index) => {
      lines.push(
        `${index + 1}) ID: ${payment.id}\n   Tutar: ${payment.amount}\n   Yontem: ${payment.method || 'Bilinmiyor'}\n   Kod: ${payment.user_code || '-'}`
      );
    });

    await this._sendMessage(chatId, lines.join('\n'));
  }

  async _approvePayment(chatId, args) {
    const paymentId = String(args[0] || '').trim();
    if (!paymentId) {
      await this._sendMessage(chatId, 'Kullanim: /approve <paymentId>');
      return;
    }

    if (!this._actorAdminId) {
      await this._sendMessage(chatId, 'TELEGRAM_BOT_ADMIN_ID ayari eksik.');
      return;
    }

    await this._adminRepository.approvePayment(paymentId, this._actorAdminId);
    await this._sendMessage(chatId, `Odeme onaylandi: ${paymentId}`);
  }

  async _rejectPayment(chatId, args) {
    const paymentId = String(args[0] || '').trim();
    const reason = args.slice(1).join(' ').trim() || 'Telegram uzerinden reddedildi';

    if (!paymentId) {
      await this._sendMessage(chatId, 'Kullanim: /reject <paymentId> [neden]');
      return;
    }

    if (!this._actorAdminId) {
      await this._sendMessage(chatId, 'TELEGRAM_BOT_ADMIN_ID ayari eksik.');
      return;
    }

    await this._adminRepository.rejectPayment(paymentId, this._actorAdminId, reason);
    await this._sendMessage(chatId, `Odeme reddedildi: ${paymentId}`);
  }

  async _sendMessage(chatId, text) {
    await this._telegramRequest('sendMessage', {
      chat_id: chatId,
      text
    });
  }

  _getNotificationChatIds() {
    if (this._notificationChatIds.size > 0) {
      return Array.from(this._notificationChatIds);
    }
    return Array.from(this._allowedChatIds);
  }

  async _broadcastMessage(chatIds, text) {
    for (const chatId of chatIds) {
      try {
        await this._sendMessage(chatId, text);
      } catch (error) {
        logger.error('Telegram notification send failed', {
          chatId,
          error: error.message
        });
      }
    }
  }

  async _telegramRequest(method, payload) {
    const url = `https://api.telegram.org/bot${this._token}/${method}`;
    const response = await axios.post(url, payload, {
      timeout: 15000
    });

    if (!response.data?.ok) {
      throw new Error(response.data?.description || 'Telegram API error');
    }

    return response.data;
  }
}

module.exports = TelegramBotService;
