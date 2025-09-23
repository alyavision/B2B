# B2B Telegram Bot (Telegraf + Vercel)

## Быстрый старт
1. Установите переменные окружения в Vercel: `B2B_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, опционально `WEBHOOK_SECRET`.
2. Задеплойте проект: `vercel --prod` (локально: `npm i -g vercel`).
3. Установите вебхук на прод-URL:

```bash
curl -s -X POST "https://api.telegram.org/bot$B2B_BOT_TOKEN/setWebhook" \
  -d "url=https://<ваш-домен>.vercel.app/api/b2b-bot" \
  -d "secret_token=$WEBHOOK_SECRET"
```

## Переменные окружения
- `B2B_BOT_TOKEN` — токен Telegram-бота
- `TELEGRAM_CHAT_ID` — ID рабочего чата (-100...) для уведомлений
- `WEBHOOK_SECRET` — секрет заголовка `x-telegram-bot-api-secret-token` (опционально)

## Структура
- `api/b2b-bot.js` — серверлес-функция (вебхук Telegram)
- `utils/googleSheets.js` — запись лидов в Google Sheets (заглушка)
- `utils/telegramNotify.js` — уведомления в рабочий чат
- `utils/aiSeller.js` — ответы ИИ-продавца (заглушка)

## Примечания
- Только webhook; polling не используется.
- При смене домена/пути — переустановите webhook.
