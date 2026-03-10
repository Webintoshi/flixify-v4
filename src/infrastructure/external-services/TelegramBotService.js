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

function formatDateTr(value) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleString('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatPaymentBadge(summary) {
  if (!summary?.hasPaymentReport) {
    return '❌ Odeme bildirimi yok';
  }

  switch (summary.latestStatus) {
    case 'pending':
      return '⏳ Bildirim yapildi (onay bekliyor)';
    case 'approved':
      return '✅ Odeme onayli';
    case 'rejected':
      return '🚫 Odeme reddedildi';
    default:
      return `ℹ️ Son durum: ${summary.latestStatus || 'bilinmiyor'}`;
  }
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

function parseExpiryAlertDays(value) {
  const raw = String(value || '3')
    .split(',')
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter((entry) => Number.isFinite(entry) && entry > 0);

  if (raw.length === 0) {
    return [3];
  }

  return Array.from(new Set(raw)).sort((a, b) => a - b);
}

function normalizeIntervalMs(value) {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 5 * 60 * 1000) {
    return 60 * 60 * 1000;
  }
  return parsed;
}

const M3U_MONTH_OPTIONS = {
  1: 30,
  3: 90,
  6: 180,
  12: 365
};

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
    cacheService = null,
    expiryAlertDays = '3',
    expiryAlertIntervalMs = null
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
    this._pendingM3uPlanByChat = new Map();
    this._expiryAlertDays = parseExpiryAlertDays(expiryAlertDays);
    this._expiryAlertIntervalMs = normalizeIntervalMs(expiryAlertIntervalMs);
    this._expiryAlertTimer = null;
    this._localAlertDedup = new Map();
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
      allowed_updates: ['message', 'callback_query'],
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

    this._startExpiryAlertMonitor();
  }

  async notifyNewRegistration({
    code,
    createdAt = new Date().toISOString()
  }) {
    if (!this._token) {
      return;
    }

    const targetChats = this._getNotificationChatIds();
    if (targetChats.length === 0) {
      return;
    }

    const message = this._buildRegistrationMessage({
      code,
      createdAt
    });

    const replyMarkup = this._buildRegistrationKeyboard(code);
    await this._broadcastMessage(targetChats, message, {
      parseMode: 'HTML',
      replyMarkup
    });
  }

  async handleUpdate(update) {
    if (!this.isEnabled() || !update || typeof update !== 'object') {
      return;
    }

    const callbackQuery = update.callback_query;
    if (callbackQuery) {
      const callbackChatId = String(callbackQuery.message?.chat?.id || callbackQuery.from?.id || '');
      if (!callbackChatId) {
        return;
      }

      if (!this._allowedChatIds.has(callbackChatId)) {
        logger.warn('Unauthorized Telegram callback tried to use bot', { chatId: callbackChatId });
        await this._answerCallbackQuery(callbackQuery.id, 'Yetkisiz sohbet.', true);
        return;
      }

      try {
        await this._handleCallbackQuery(callbackQuery, callbackChatId);
      } catch (error) {
        logger.error('Telegram callback failed', {
          chatId: callbackChatId,
          callbackData: callbackQuery.data,
          error: error.message
        });
        await this._answerCallbackQuery(callbackQuery.id, `Hata: ${error.message}`, true);
      }
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
    const parsed = this._parseCommand(text);
    if (!parsed.command) {
      return;
    }

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
    const parts = String(text || '').trim().split(/\s+/).filter(Boolean);
    const commandIndex = parts.findIndex((part) => part.startsWith('/'));

    if (commandIndex === -1) {
      return {
        command: '',
        args: []
      };
    }

    const rawCommand = parts[commandIndex] || '';
    const command = rawCommand.split('@')[0].toLowerCase();
    return {
      command,
      args: parts.slice(commandIndex + 1)
    };
  }

  _buildRegistrationMessage({
    code,
    createdAt
  }) {
    const lines = [
      '🆕 <b>Yeni Kayit</b>',
      '',
      `👤 <b>Kullanici Kodu:</b> <code>${escapeHtml(code)}</code>`,
      `🗓️ <b>Tarih:</b> ${escapeHtml(formatDateTr(createdAt))}`
    ];

    return lines.join('\n');
  }

  _buildRegistrationKeyboard(code) {
    return {
      inline_keyboard: [
        [
          {
            text: '📋 Kodu Kopyala',
            copy_text: { text: code }
          }
        ],
        [
          { text: '👤 Kullanici Detayi', callback_data: `user:${code}` },
          { text: '💳 Odeme Durumu', callback_data: `payment:${code}` }
        ],
        [
          {
            text: '🧩 M3U Ata',
            callback_data: `m3u_months:${code}`
          }
        ]
      ]
    };
  }

  async _handleCallbackQuery(callbackQuery, chatId) {
    const data = String(callbackQuery.data || '');
    const parts = data.split(':');
    const action = parts[0];
    const codeInput = parts[1];

    if (!action || !codeInput) {
      await this._answerCallbackQuery(callbackQuery.id, 'Gecersiz secim.', true);
      return;
    }

    if (action === 'user') {
      await this._sendUserDetails(chatId, [codeInput]);
      await this._answerCallbackQuery(callbackQuery.id, 'Kullanici detayi gonderildi.');
      return;
    }

    if (action === 'payment') {
      await this._sendUserPaymentStatus(chatId, codeInput);
      await this._answerCallbackQuery(callbackQuery.id, 'Odeme durumu gonderildi.');
      return;
    }

    if (action === 'm3u_months') {
      await this._sendM3uMonthOptions(chatId, codeInput);
      await this._answerCallbackQuery(callbackQuery.id, 'Süre secimini yapin.');
      return;
    }

    if (action === 'm3u_setplan') {
      const months = parsePositiveInt(parts[2], 'Ay');
      const days = M3U_MONTH_OPTIONS[months];
      if (!days) {
        await this._answerCallbackQuery(callbackQuery.id, 'Desteklenmeyen ay secimi.', true);
        return;
      }
      this._setPendingM3uPlan(chatId, codeInput, months, days);
      await this._sendM3uPlanSelected(chatId, codeInput, months, days);
      await this._answerCallbackQuery(callbackQuery.id, `${months} ay secildi.`);
      return;
    }

    await this._answerCallbackQuery(callbackQuery.id, 'Bilinmeyen secim.', true);
  }

  async _sendM3uMonthOptions(chatId, codeInput) {
    const codeVo = Code.create(codeInput);
    const user = await this._userRepository.findByCode(codeVo);
    if (!user) {
      await this._sendMessage(chatId, `Kullanici bulunamadi: ${codeInput}`);
      return;
    }

    const text = [
      '🧩 M3U Atama Süresi',
      `👤 Kod: ${codeVo.toString()}`,
      '',
      'Kaç aylik atama yapilsin?'
    ].join('\n');

    await this._sendMessage(chatId, text, {
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '1 Ay', callback_data: `m3u_setplan:${codeVo.toString()}:1` },
            { text: '3 Ay', callback_data: `m3u_setplan:${codeVo.toString()}:3` }
          ],
          [
            { text: '6 Ay', callback_data: `m3u_setplan:${codeVo.toString()}:6` },
            { text: '12 Ay', callback_data: `m3u_setplan:${codeVo.toString()}:12` }
          ]
        ]
      }
    });
  }

  async _sendM3uPlanSelected(chatId, codeInput, months, days) {
    const lines = [
      `✅ Süre secildi: ${months} ay (${days} gun)`,
      `👤 Kod: ${codeInput}`,
      '',
      'Simdi M3U URL girin:',
      `/setm3u ${codeInput} <m3uUrl>`
    ];

    await this._sendMessage(chatId, lines.join('\n'), {
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: '⚡ Komutu Hazirla',
              switch_inline_query_current_chat: `/setm3u ${codeInput} `
            }
          ]
        ]
      }
    });
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

  async _sendUserPaymentStatus(chatId, codeInput) {
    const codeVo = Code.create(codeInput);
    const user = await this._userRepository.findByCode(codeVo);
    if (!user) {
      await this._sendMessage(chatId, `Kullanici bulunamadi: ${codeInput}`);
      return;
    }

    let summary = null;
    if (this._adminRepository?.getPaymentSummaryByUserId) {
      summary = await this._adminRepository.getPaymentSummaryByUserId(user.id);
    }

    const lines = [
      `💳 Odeme Durumu - ${codeVo.toString()}`,
      `${formatPaymentBadge(summary)}`
    ];

    if (summary?.latestPayment) {
      lines.push(`ID: ${summary.latestPayment.id}`);
      lines.push(`Tutar: ${summary.latestPayment.amount || '-'}`);
      lines.push(`Yontem: ${summary.latestPayment.method || '-'}`);
      lines.push(`Tarih: ${formatDateTr(summary.latestPayment.created_at)}`);
    }

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
    const selectedPlan = this._getPendingM3uPlan(chatId, codeVo.toString());
    const days = hasDaysArgument
      ? parsePositiveInt(args[2], 'Gun')
      : (selectedPlan?.days || null);
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

    this._clearPendingM3uPlan(chatId, codeVo.toString());

    const lines = [
      `M3U tanimlandi: ${codeVo.toString()}`,
      `Durum: ${user.status.canActivate ? 'active yapildi' : 'm3u guncellendi'}`,
      `Süre: ${days ? `${days} gun${selectedPlan?.months ? ` (${selectedPlan.months} ay)` : ''}` : 'degismedi'}`,
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

  async _sendMessage(chatId, text, options = {}) {
    const payload = {
      chat_id: chatId,
      text
    };

    if (options.parseMode) {
      payload.parse_mode = options.parseMode;
    }

    if (options.replyMarkup) {
      payload.reply_markup = options.replyMarkup;
    }

    await this._telegramRequest('sendMessage', payload);
  }

  async _answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    await this._telegramRequest('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text,
      show_alert: showAlert
    });
  }

  _getNotificationChatIds() {
    if (this._notificationChatIds.size > 0) {
      return Array.from(this._notificationChatIds);
    }
    return Array.from(this._allowedChatIds);
  }

  _m3uPlanKey(chatId, code) {
    return `${chatId}:${code}`;
  }

  _setPendingM3uPlan(chatId, code, months, days) {
    const key = this._m3uPlanKey(chatId, code);
    this._pendingM3uPlanByChat.set(key, {
      months,
      days,
      createdAt: Date.now()
    });
  }

  _getPendingM3uPlan(chatId, code) {
    const key = this._m3uPlanKey(chatId, code);
    const plan = this._pendingM3uPlanByChat.get(key);
    if (!plan) {
      return null;
    }

    // 30 dakika sonra süre seçimi geçersiz olsun
    if (Date.now() - plan.createdAt > 30 * 60 * 1000) {
      this._pendingM3uPlanByChat.delete(key);
      return null;
    }

    return plan;
  }

  _clearPendingM3uPlan(chatId, code) {
    const key = this._m3uPlanKey(chatId, code);
    this._pendingM3uPlanByChat.delete(key);
  }

  async _broadcastMessage(chatIds, text, options = {}) {
    let deliveredCount = 0;
    for (const chatId of chatIds) {
      try {
        await this._sendMessage(chatId, text, options);
        deliveredCount++;
      } catch (error) {
        logger.error('Telegram notification send failed', {
          chatId,
          error: error.message
        });
      }
    }

    return deliveredCount;
  }

  _startExpiryAlertMonitor() {
    if (!this._token || this._expiryAlertTimer) {
      return;
    }

    const run = async () => {
      try {
        await this._checkExpiringUsersAndNotify();
      } catch (error) {
        logger.error('Telegram expiry monitor failed', { error: error.message });
      }
    };

    run();
    this._expiryAlertTimer = setInterval(run, this._expiryAlertIntervalMs);
    if (typeof this._expiryAlertTimer.unref === 'function') {
      this._expiryAlertTimer.unref();
    }

    logger.info('Telegram expiry alert monitor started', {
      days: this._expiryAlertDays,
      intervalMs: this._expiryAlertIntervalMs
    });
  }

  async _checkExpiringUsersAndNotify() {
    const targetChats = this._getNotificationChatIds();
    if (targetChats.length === 0) {
      return;
    }

    const activeUsers = await this._userRepository.findByStatus('active');
    if (!Array.isArray(activeUsers) || activeUsers.length === 0) {
      return;
    }

    const nowMs = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    let sentCount = 0;

    for (const user of activeUsers) {
      if (!user?.m3uUrl || !user?.expiresAt) {
        continue;
      }

      const expiresAt = new Date(user.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        continue;
      }

      const diffMs = expiresAt.getTime() - nowMs;
      if (diffMs <= 0) {
        continue;
      }

      const daysRemaining = Math.ceil(diffMs / oneDayMs);
      if (!this._expiryAlertDays.includes(daysRemaining)) {
        continue;
      }

      const code = user.code.toString();
      const dedupKey = `expiry:${code}:${daysRemaining}:${expiresAt.toISOString().slice(0, 10)}`;
      const alreadySent = await this._hasSentExpiryAlert(dedupKey);
      if (alreadySent) {
        continue;
      }

      const text = [
        '⏰ <b>Paket Bitis Uyarisi</b>',
        '',
        `👤 <b>Kullanici Kodu:</b> <code>${escapeHtml(code)}</code>`,
        `🗓️ <b>Bitis Tarihi:</b> ${escapeHtml(formatDateTr(expiresAt))}`,
        `⚠️ <b>Kalan Sure:</b> ${daysRemaining} gun`
      ].join('\n');

      const delivered = await this._broadcastMessage(targetChats, text, {
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '📋 Kodu Kopyala', copy_text: { text: code } }
            ],
            [
              { text: '👤 Kullanici Detayi', callback_data: `user:${code}` },
              {
                text: '⏳ Sure Uzat',
                switch_inline_query_current_chat: `/extend ${code} `
              }
            ]
          ]
        }
      });

      if (delivered > 0) {
        await this._markExpiryAlertSent(dedupKey, 48 * 60 * 60);
        sentCount++;
      }
    }

    if (sentCount > 0) {
      logger.info('Telegram expiry alerts sent', { count: sentCount });
    }
  }

  async _hasSentExpiryAlert(key) {
    if (this._cacheService) {
      try {
        const exists = await this._cacheService.exists(`telegram-alert:${key}`);
        if (exists) {
          return true;
        }
      } catch (error) {
        logger.warn('Failed to read expiry alert key from cache', { error: error.message, key });
      }
    }

    const localExpiresAt = this._localAlertDedup.get(key);
    if (!localExpiresAt) {
      return false;
    }

    if (localExpiresAt < Date.now()) {
      this._localAlertDedup.delete(key);
      return false;
    }

    return true;
  }

  async _markExpiryAlertSent(key, ttlSeconds) {
    const expiresAtMs = Date.now() + (ttlSeconds * 1000);
    this._localAlertDedup.set(key, expiresAtMs);

    if (!this._cacheService) {
      return;
    }

    try {
      await this._cacheService.set(`telegram-alert:${key}`, { sent: true }, ttlSeconds);
    } catch (error) {
      logger.warn('Failed to write expiry alert key to cache', { error: error.message, key });
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
