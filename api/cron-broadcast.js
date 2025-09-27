const { Telegraf } = require('telegraf');
const { popBroadcastJob, getAudienceBatch } = require('../utils/audience');

const token = process.env.B2B_BOT_TOKEN;
if (!token) throw new Error('B2B_BOT_TOKEN is not set');
const bot = new Telegraf(token);

const RATE = Number(process.env.BROADCAST_RATE || 25);

module.exports = async (req, res) => {
  try {
    const job = await popBroadcastJob();
    if (!job) {
      res.status(200).send('NO-JOB');
      return;
    }
    const text = job.text;
    const audience = await getAudienceBatch(1000);
    let sent = 0;
    for (const chatId of audience) {
      try {
        await bot.telegram.sendMessage(chatId, text);
        sent += 1;
        if (sent % RATE === 0) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (e) {
        console.error('Broadcast send error:', e?.message || e);
      }
    }
    res.status(200).send(`SENT:${sent}`);
  } catch (e) {
    console.error('Broadcast cron error:', e?.message || e);
    res.status(200).send('OK');
  }
};
