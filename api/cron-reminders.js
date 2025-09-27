const { Telegraf } = require('telegraf');
const { popDueReminders } = require('../utils/reminders');

const token = process.env.B2B_BOT_TOKEN;
if (!token) throw new Error('B2B_BOT_TOKEN is not set');
const bot = new Telegraf(token);

module.exports = async (req, res) => {
  try {
    const due = await popDueReminders(100);
    for (const item of due) {
      const chatId = Number(item.chatId);
      const kind = item.kind;
      const text = kind === '4h'
        ? 'Напомню: остались вопросы? Могу предложить короткий созвон на 10–15 минут, чтобы подобрать формат под вашу задачу.'
        : 'Если тема актуальна, предлагаю созвониться — подберём подходящий вариант и даты на 10–15 минут. Подойдёт сегодня/завтра в 12:00 или 16:00?';
      try {
        await bot.telegram.sendMessage(chatId, text);
      } catch (e) {
        console.error('Reminder send error:', e?.message || e);
      }
    }
    res.status(200).send('OK');
  } catch (e) {
    console.error('Cron error:', e?.message || e);
    res.status(200).send('OK');
  }
};
