require('dotenv').config();
const axios = require('axios');

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN bulunamadi. .env dosyasini kontrol edin.');
    process.exit(1);
  }

  const url = `https://api.telegram.org/bot${token}/getUpdates`;
  const response = await axios.get(url, { timeout: 15000 });

  if (!response.data?.ok) {
    throw new Error(response.data?.description || 'Telegram API hatasi');
  }

  const updates = response.data.result || [];
  if (updates.length === 0) {
    console.log('Henuz update yok. Bota Telegram uygulamasindan /start yazip tekrar deneyin.');
    return;
  }

  const chatMap = new Map();
  updates.forEach((update) => {
    const msg = update.message || update.edited_message;
    if (!msg?.chat?.id) return;

    const chatId = String(msg.chat.id);
    chatMap.set(chatId, {
      chatId,
      type: msg.chat.type || 'unknown',
      title: msg.chat.title || null,
      username: msg.chat.username || null,
      firstName: msg.chat.first_name || null,
      lastName: msg.chat.last_name || null
    });
  });

  if (chatMap.size === 0) {
    console.log('Update var ama chat bilgisi bulunamadi.');
    return;
  }

  console.log('Bulunan chat ID listesi:');
  for (const chat of chatMap.values()) {
    console.log(JSON.stringify(chat, null, 2));
  }
}

main().catch((error) => {
  console.error('Komut basarisiz:', error.message);
  process.exit(1);
});
