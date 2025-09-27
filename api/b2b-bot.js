const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { appendLeadToSheet, listAudienceUserIds, getLeadByUserId } = require('../utils/googleSheets');
const { notifyLead } = require('../utils/telegramNotify');
const { getSellerReply } = require('../utils/aiSeller');
// reminders и audience-redis не используем для простоты рассылки

const token = process.env.B2B_BOT_TOKEN;
if (!token) {
  throw new Error('B2B_BOT_TOKEN is not set');
}

const bot = new Telegraf(token, { handlerTimeout: 9_000 });

const DEFAULT_WELCOME_IMAGE_URL = 'https://i.postimg.cc/vTd9Hx2L/B2B.png';
const DEFAULT_WELCOME_TEXT = 'AI-ассистент, который знает, как превратить сотрудников в команду. Давайте соберем сильный коллектив через игру.';

const WORK_CHAT_ID = Number(process.env.TELEGRAM_CHAT_ID);

async function isAdminInWorkChat(userId) {
  try {
    if (!WORK_CHAT_ID) return false;
    const m = await bot.telegram.getChatMember(WORK_CHAT_ID, userId);
    return ['administrator', 'creator'].includes(m.status);
  } catch {
    return false;
  }
}

function askName(ctx) {
  return ctx.reply('Как вас зовут?', { reply_markup: { force_reply: true } });
}
function askContact(ctx, name) {
  return ctx.reply('Оставьте, пожалуйста, телефон или e‑mail для связи', { reply_markup: { force_reply: true } });
}
function askCompany(ctx, name, contact) {
  return ctx.reply('Как называется ваша компания?', { reply_markup: { force_reply: true } });
}

async function sendChecklist(ctx) {
  try {
    const fileId = process.env.CHECKLIST_FILE_ID;
    const fileUrl = process.env.CHECKLIST_URL;
    if (fileId) { await ctx.replyWithDocument(fileId); return; }
    if (fileUrl) {
      let filename = 'guide.pdf';
      try { const u = new URL(fileUrl); const base = path.basename(u.pathname); if (base) filename = base; } catch {}
      await ctx.replyWithDocument({ url: fileUrl, filename });
      return;
    }

    // Fallback: локальный файл из репозитория (public/)
    const candidates = [
      process.env.CHECKLIST_PATH,
      path.join(process.cwd(), 'public', 'guide.pdf'),
      path.join(process.cwd(), 'public', 'checklist.pdf'),
      path.join(process.cwd(), 'public', 'Как игры выявляют лидеров в группе.pdf'),
    ].filter(Boolean);

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          await ctx.replyWithDocument({ source: fs.createReadStream(p), filename: path.basename(p) });
          return;
        }
      } catch {}
    }

    await ctx.reply('Чек‑лист (гайд) скоро будет доступен.');
  } catch (e) {
    console.error('Checklist send error:', e?.message || e);
    await ctx.reply('Не удалось отправить гайд. Отправлю позже.');
  }
}

async function sendWelcome(ctx) {
  const photo = process.env.WELCOME_IMAGE_URL || DEFAULT_WELCOME_IMAGE_URL;
  const caption = process.env.WELCOME_TEXT || DEFAULT_WELCOME_TEXT;
  try {
    if (photo) { await ctx.replyWithPhoto(photo, { caption, parse_mode: 'HTML' }); }
    else { await ctx.reply(caption); }
  } catch (e) {
    console.error('Welcome send error:', e?.message || e);
    await ctx.reply('Добро пожаловать!');
  }
}

bot.start(async (ctx) => {
  const payload = ctx.startPayload;
  const userId = ctx.from?.id;

  // 1) Приветствие и гайд сразу
  await sendWelcome(ctx);
  await sendChecklist(ctx);

  // Если данные уже есть в Sheets — не просим заново
  let lead = null;
  try { lead = await getLeadByUserId(userId); } catch {}

  // 2) Первая реплика ИИ
  try {
    const leadContext = payload
      ? { userId, source: 'ads', sessionId: payload, name: lead?.name, company: lead?.company, contact: lead?.contact }
      : { userId, source: 'organic', name: lead?.name, company: lead?.company, contact: lead?.contact };
    const userMessage = payload
      ? 'Пользователь пришёл по рекламе, начни первую реплику-приветствие без повторных приветствий в дальнейшем.'
      : 'Пользователь пришёл органически. Коротко поприветствуй один раз и сообщи, что для подбора предложения понадобятся контакты (не дублируй их в каждом сообщении).';
    const reply = await getSellerReply({ userMessage, leadContext });
    await ctx.reply(reply);
  } catch (e) {
    console.error('AI start error:', e?.message || e);
    await ctx.reply('Готов помочь подобрать формат под ваши задачи.');
  }

  if (payload) {
    await notifyLead({
      name: ctx.from?.first_name || lead?.name || '',
      contact: lead?.contact || '',
      company: lead?.company || '',
      answers: `sessionId:${payload}`,
      source: 'Реклама',
      status: 'готова к звонку',
    });
    return;
  }

  // Если данных нет — спросим по шагам, иначе не повторяем
  if (!lead?.name) { await askName(ctx); return; }
  if (!lead?.contact) { await askContact(ctx, lead?.name); return; }
  if (!lead?.company) { await askCompany(ctx, lead?.name, lead?.contact); return; }
});

bot.command('broadcast', async (ctx) => {
  const uid = ctx.from?.id;
  const ok = await isAdminInWorkChat(uid);
  if (!ok) return;
  const audience = await listAudienceUserIds().catch(() => []);
  await ctx.reply(`Введите текст рассылки (получателей: ${audience.length}). Ответьте на это сообщение.`);
});

bot.on('message', async (ctx) => {
  const msg = ctx.message;
  if (!msg || !msg.text) return;

  // Ответ на prompt рассылки (оставляем как есть)
  if (ctx.message.reply_to_message?.text?.includes('Введите текст рассылки')) {
    const uid = ctx.from?.id;
    const ok = await isAdminInWorkChat(uid);
    if (!ok) return;
    const textToSend = msg.text;
    const audience = await listAudienceUserIds().catch(() => []);
    const rate = 25;
    let sent = 0;
    for (const chatId of audience) {
      try { await ctx.telegram.sendMessage(chatId, textToSend); } catch {}
      sent += 1;
      if (sent % rate === 0) { await new Promise((r) => setTimeout(r, 1000)); }
    }
    await ctx.reply(`Рассылка завершена. Отправлено: ${sent}`);
    return;
  }

  // Поддержка формы по reply_to без дубликатов скобок
  const replyTo = msg.reply_to_message?.text || '';
  const replyToNorm = replyTo.toLowerCase();

  if (replyToNorm.includes('как вас зовут?')) {
    const name = msg.text.trim();
    await askContact(ctx, name);
    return;
  }
  if (replyToNorm.includes('телефон') || replyToNorm.includes('e‑mail')) {
    const contact = msg.text.trim();
    await askCompany(ctx, '', contact);
    return;
  }
  if (replyToNorm.includes('как называется ваша компания?')) {
    const company = msg.text.trim();
    const userId = ctx.from?.id;

    try {
      await appendLeadToSheet({
        source: 'Органика',
        userId,
        name: '',
        contact: '',
        company,
        answers: '',
        checklistSent: true,
      });
    } catch (e) {
      console.error('Sheets append error:', e?.message || e);
    }

    try {
      await notifyLead({ name: '', contact: '', company, answers: '', source: 'Органика', status: 'готова к звонку' });
    } catch (e) {
      console.error('Notify error:', e?.message || e);
    }

    try {
      const reply = await getSellerReply({
        userMessage: 'Пользователь оставил контакты, начни продавать. Не повторяй приветствие.',
        leadContext: { userId, source: 'organic', company },
      });
      await ctx.reply(reply);
    } catch (e) {
      console.error('AI error (organic):', e?.message || e);
      await ctx.reply('Спасибо! Мы получили контакты, менеджер свяжется с вами.');
    }
    return;
  }

  // Обычный диалог — без приветствий
  if (!msg.text.startsWith('/')) {
    try {
      const userId = ctx.from?.id;
      let lead = null;
      try { lead = await getLeadByUserId(userId); } catch {}
      const reply = await getSellerReply({
        userMessage: msg.text,
        leadContext: { userId, name: lead?.name, company: lead?.company, contact: lead?.contact },
      });
      await ctx.reply(reply);
    } catch (e) {
      console.error('AI error (general):', e?.message || e);
      await ctx.reply('Принял сообщение. Вернусь с ответом чуть позже.');
    }
  }
});

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(200).send('OK');
    return;
  }

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
    res.status(200).send('OK');
  }
};
