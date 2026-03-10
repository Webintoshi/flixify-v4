const axios = require('axios');
const logger = require('../../config/logger');

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

class TelegramBotService {
  constructor({
    token,
    webhookSecret,
    webhookUrl,
    webhookHeaderSecret,
    allowedChatIds,
    actorAdminId,
    userRepository,
    adminRepository
  }) {
    this._token = token;
    this._webhookSecret = webhookSecret;
    this._webhookUrl = webhookUrl;
    this._webhookHeaderSecret = webhookHeaderSecret || '';
    this._allowedChatIds = toChatIdSet(allowedChatIds);
    this._actorAdminId = actorAdminId || null;
    this._userRepository = userRepository;
    this._adminRepository = adminRepository;
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
      case '/status':
        await this._sendStatus(chatId);
        return;
      case '/stats':
        await this._sendStats(chatId);
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
      '/status - Sunucu durumu',
      '/stats - Kullanici istatistikleri',
      '/payments - Bekleyen odemeler',
      '/approve <paymentId> - Odemeyi onayla',
      '/reject <paymentId> [neden] - Odemeyi reddet'
    ];
    await this._sendMessage(chatId, lines.join('\n'));
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
