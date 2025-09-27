const { Telegraf } = require('telegraf');

const token = process.env.B2B_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

if (!token) {
  throw new Error('B2B_BOT_TOKEN is not set');
}

const bot = new Telegraf(token);

function formatLead({ name, contact, company, email, answers, source, status }) {
  const lines = [
    '🎯 НОВАЯ ЗАЯВКА (B2B)',
    `👤 Имя: ${name || '-'}`,
    `📱 Телефон: ${contact || '-'}`,
    `🏢 Компания: ${company || '-'}`,
    `📧 E-mail: ${email || '-'}`,
    source ? `Источник: ${source}` : null,
    status ? `Статус: ${status}` : 'Статус: готова к звонку',
    answers ? `💬 Отзывы/ответы: ${answers}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

async function notifyLead(data) {
  if (!chatId) return;
  const text = formatLead(data);
  await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML' });
}

module.exports = { notifyLead };
