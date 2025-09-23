const { Telegraf } = require('telegraf');

const token = process.env.B2B_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token) {
  throw new Error('B2B_BOT_TOKEN is not set');
}

const bot = new Telegraf(token);

async function notifyLead({ name, contact, company, answers, source }) {
  if (!chatId) return;
  const lines = [
    'Новый лид (B2B):',
    `👤 ${name || '-'}\n📱 ${contact || '-'}\n🏢 ${company || '-'}`,
    answers ? `💬 ${answers}` : null,
    source ? `🔥 ${source}` : null,
  ].filter(Boolean);
  const text = lines.join('\n');
  await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

module.exports = { notifyLead };
