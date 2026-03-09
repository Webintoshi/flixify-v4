require('dotenv').config();
const crypto = require('crypto');

function main() {
  const existingSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const secret = existingSecret && !existingSecret.startsWith('REPLACE_WITH_')
    ? existingSecret
    : crypto.randomBytes(32).toString('hex');

  const baseApiUrl = process.env.TELEGRAM_API_BASE_URL || 'http://api.flixify.pro';
  const webhookUrl = `${baseApiUrl.replace(/\/$/, '')}/api/v1/telegram/webhook/${secret}`;

  console.log('Telegram bootstrap hazirlandi.');
  console.log('');
  console.log('Bu degerleri .env dosyaniza ekleyin/guncelleyin:');
  console.log(`TELEGRAM_WEBHOOK_SECRET=${secret}`);
  console.log(`TELEGRAM_WEBHOOK_URL=${webhookUrl}`);
  console.log('');
  console.log('Sonra sirasiyla:');
  console.log('1) Telegram botuna /start yazin');
  console.log('2) npm run telegram:get-chat-id');
  console.log('3) TELEGRAM_ALLOWED_CHAT_IDS doldurun');
  console.log('4) TELEGRAM_BOT_ADMIN_ID doldurun');
}

main();
