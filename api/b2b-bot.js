const { Telegraf } = require('telegraf');

const token = process.env.B2B_BOT_TOKEN;
if (!token) {
  throw new Error('B2B_BOT_TOKEN is not set');
}

const bot = new Telegraf(token, { handlerTimeout: 9_000 });

// Базовая реакция на /start (пока заглушка)
bot.start(async (ctx) => {
  await ctx.reply('Бот запущен. Скоро здесь будет логика B2B-продавца.');
});

// Ничего не делаем в остальных апдейтах пока
bot.on('message', async (ctx) => {
  await ctx.reply('Спасибо! Мы скоро свяжемся.');
});

// Vercel serverless handler
module.exports = async (req, res) => {
  // Проверка метода
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }

  // Опциональная проверка секретного токена
  const secret = process.env.WEBHOOK_SECRET;
  if (secret) {
    const headerSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (headerSecret !== secret) {
      res.status(401).send('Unauthorized');
      return;
    }
  }

  try {
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).send('Internal Server Error');
  }
};
