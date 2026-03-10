# Telegram Admin Bot Kurulumu (Sifirdan)

Bu rehber, Telegram botu ilk kez kuran birisi icin adim adim hazirlandi.

## 1) Telegram'da bot olustur

1. Telegram uygulamasinda `@BotFather` hesabini acin.
2. `/newbot` yazin.
3. Bot ismi verin (ornek: `Flixify Admin Bot`).
4. Bot username verin (mutlaka `bot` ile bitsin, ornek: `flixify_admin_control_bot`).
5. BotFather size bir token verecek.

Ornek token formati:
`1234567890:AA....`

Bu tokeni kaybetmeyin.

## 2) Kendi chat_id degerinizi bulun

1. Yeni olusturdugunuz bota gidin.
2. `/start` yazin.
3. (Opsiyonel ama onerilir) webhook secret ve URL uretmek icin:

```bash
npm run telegram:bootstrap
```

4. Sunucuda su komutu calistirin:

```bash
npm run telegram:get-chat-id
```

5. Cikti icindeki `chatId` degerini not alin.

## 3) Botun odeme onaylamasi icin admin UUID alin

Botun `/approve` ve `/reject` komutlari icin mevcut bir admin UUID gerekli.

Supabase SQL Editor'de su sorguyu calistirin:

```sql
select id, email, role from admins order by created_at asc;
```

Kullanmak istediginiz admin kaydinin `id` degerini not alin.

## 4) Production .env ayarlari

Sunucuda `.env` dosyaniza su alanlari ekleyin:

```env
TELEGRAM_BOT_TOKEN=BOTFATHER_TOKEN_BURAYA
TELEGRAM_WEBHOOK_SECRET=uzun_ve_tahmin_edilemez_bir_secret
TELEGRAM_WEBHOOK_URL=https://api.sizin-domain.com/api/v1/telegram/webhook/uzun_ve_tahmin_edilemez_bir_secret
TELEGRAM_WEBHOOK_HEADER_SECRET=opsiyonel_ek_secret
TELEGRAM_ALLOWED_CHAT_IDS=123456789,987654321
TELEGRAM_NOTIFICATION_CHAT_IDS=-1001234567890
TELEGRAM_BOT_ADMIN_ID=admin_uuid_buraya
TELEGRAM_EXPIRY_ALERT_DAYS=3
TELEGRAM_EXPIRY_ALERT_INTERVAL_MS=3600000
```

Notlar:
- `TELEGRAM_ALLOWED_CHAT_IDS`: bota komut verebilecek chat id listesi (virgulle ayirin).
- `TELEGRAM_NOTIFICATION_CHAT_IDS`: bildirim gidecek chat id listesi (grup id'si genelde `-100` ile baslar).
- `TELEGRAM_BOT_ADMIN_ID`: odeme onay/red icin kullanilan admin UUID.
- `TELEGRAM_EXPIRY_ALERT_DAYS`: bitime kalan gun alarmi (ornek: `3` veya `7,3,1`).
- `TELEGRAM_EXPIRY_ALERT_INTERVAL_MS`: arka plan kontrol periyodu (ms), varsayilan `3600000` (1 saat).
- `TELEGRAM_WEBHOOK_URL`: HTTPS olmalidir.

## 5) Servisi baslat / yeniden deploy et

Uygulamayi yeniden baslatin. Uygulama acilisinda webhook otomatik olarak Telegram'a set edilir.

Kontrol endpoint'i:

```bash
curl https://api.sizin-domain.com/api/v1/telegram/health
```

Beklenen yanit:
`enabled: true`

## 6) Telegram komutlarini test et

Bota su komutlari sirayla gonderin:

1. `/help`
2. `/status`
3. `/stats`
4. `/pending`
5. `/payments`

Odeme islemleri:

```text
/approve <paymentId>
/reject <paymentId> neden
```

Kullanici yonetim komutlari:

```text
/chatid
/user <code>
/setm3u <code> <m3uUrl> [gun]
/extend <code> <gun>
```

## 7) 7/24 calisma icin zorunlu checklist

1. Uygulama bir sunucuda surekli calisiyor olmali (Coolify/PM2/Docker).
2. Domain ve SSL aktif olmali (HTTPS zorunlu).
3. Serviste otomatik restart acik olmali.
4. Sunucu health check izlenmeli (`/health`).
5. `.env` yedegi guvenli yerde olmali.
6. Telegram token sadece sunucu ortam degiskeninde olmali.
7. `TELEGRAM_ALLOWED_CHAT_IDS` disindaki kullanicilar botu kullanamamali.

## Guvenlik onerileri

1. Botu gruba ekleyecekseniz sadece admin grubuna ekleyin ve grup id'sini env'de whitelist edin.
2. Token sizarsa BotFather'dan `/revoke` ile yeni token alin.
3. `TELEGRAM_WEBHOOK_SECRET` ve `TELEGRAM_WEBHOOK_HEADER_SECRET` degerlerini periyodik degistirin.
4. Sadece super admin UUID'sini `TELEGRAM_BOT_ADMIN_ID` olarak verin.
