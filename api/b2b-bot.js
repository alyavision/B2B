const { Telegraf } = require('telegraf');
const { appendLeadToSheet } = require('../utils/googleSheets');
const { notifyLead } = require('../utils/telegramNotify');
const { getSellerReply } = require('../utils/aiSeller');

const token = process.env.B2B_BOT_TOKEN;
if (!token) {
  throw new Error('B2B_BOT_TOKEN is not set');
}

const bot = new Telegraf(token, { handlerTimeout: 9_000 });

// Простая in-memory сессия (подходит для serverless до подключения БД)
const userState = new Map();
function setState(userId, data) {
  const prev = userState.get(userId) || {};
  userState.set(userId, { ...prev, ...data });
}
function getState(userId) {
  return userState.get(userId) || {};
}
function clearState(userId) {
  userState.delete(userId);
}

function askName(ctx) {
  return ctx.reply('Введите имя', { reply_markup: { force_reply: true } });
}
function askContact(ctx, name) {
  return ctx.reply(`Введите контакт (телефон/email) [name:${name}]`, { reply_markup: { force_reply: true } });
}
function askCompany(ctx, name, contact) {
  return ctx.reply(`Введите компанию [name:${name}][contact:${contact}]`, { reply_markup: { force_reply: true } });
}

async function sendChecklist(ctx) {
  await ctx.reply('Чек-лист: базовый гайд по старту. (PDF добавим позже)');
}

bot.start(async (ctx) => {
  const payload = ctx.startPayload; // параметр из /start
  const userId = ctx.from?.id;

  if (payload) {
    setState(userId, { source: 'ads', sessionId: payload, hasContacts: true });
    await sendChecklist(ctx);
    await notifyLead({
      name: ctx.from?.first_name || '',
      contact: '',
      company: '',
      answers: `sessionId:${payload}`,
      source: 'Реклама',
    });
    try {
      const reply = await getSellerReply({
        userMessage: 'Пользователь пришёл по рекламе, начни первую реплику-приветствие.',
        leadContext: { userId, source: 'ads', sessionId: payload },
      });
      await ctx.reply(reply);
    } catch (e) {
      console.error('AI error (ads):', e?.message || e);
      await ctx.reply('Спасибо за обращение! Менеджер скоро свяжется с вами.');
    }
    return;
  }

  setState(userId, { step: 'name', source: 'organic' });
  await askName(ctx);
});

bot.on('message', async (ctx) => {
  const msg = ctx.message;
  if (!msg || !msg.text) return;

  const userId = ctx.from?.id;
  const state = getState(userId);

  // Сначала обработка сценария формы, если step активен
  if (state.step === 'name') {
    const name = msg.text.trim();
    setState(userId, { step: 'contact', name });
    await askContact(ctx, name);
    return;
  }
  if (state.step === 'contact') {
    const contact = msg.text.trim();
    setState(userId, { step: 'company', contact });
    await askCompany(ctx, state.name, contact);
    return;
  }
  if (state.step === 'company') {
    const company = msg.text.trim();
    const name = state.name;
    const contact = state.contact;

    try {
      await appendLeadToSheet({
        source: 'Органика',
        userId,
        name,
        contact,
        company,
        answers: '',
        checklistSent: true,
      });
    } catch (e) {
      console.error('Sheets append error:', e?.message || e);
    }

    try {
      await notifyLead({ name, contact, company, answers: '', source: 'Органика' });
    } catch (e) {
      console.error('Notify error:', e?.message || e);
    }

    clearState(userId);
    setState(userId, { hasContacts: true, source: 'organic', name, contact, company });

    await sendChecklist(ctx);

    try {
      const reply = await getSellerReply({
        userMessage: 'Пользователь оставил контакты, начни продавать.',
        leadContext: { userId, source: 'organic', name, contact, company },
      });
      await ctx.reply(reply);
    } catch (e) {
      console.error('AI error (organic):', e?.message || e);
      await ctx.reply('Спасибо! Мы получили контакты, менеджер свяжется с вами.');
    }
    return;
  }

  // Если пришёл из рекламы (payload) или уже есть контакты — продавец
  if (state.hasContacts || state.source === 'ads') {
    try {
      const reply = await getSellerReply({
        userMessage: msg.text,
        leadContext: { userId, ...state },
      });
      await ctx.reply(reply);
    } catch (e) {
      console.error('AI error (general):', e?.message || e);
      await ctx.reply('Принял сообщение. Вернусь с ответом чуть позже.');
    }
    return;
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
