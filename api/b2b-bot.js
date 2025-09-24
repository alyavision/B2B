const { Telegraf } = require('telegraf');
const { appendLeadToSheet } = require('../utils/googleSheets');
const { notifyLead } = require('../utils/telegramNotify');
const { getSellerReply } = require('../utils/aiSeller');

const token = process.env.B2B_BOT_TOKEN;
if (!token) {
  throw new Error('B2B_BOT_TOKEN is not set');
}

const bot = new Telegraf(token, { handlerTimeout: 9_000 });

const DEFAULT_WELCOME_IMAGE_URL = 'https://i.postimg.cc/vTd9Hx2L/B2B.png';
const DEFAULT_WELCOME_TEXT = 'AI-ассистент, который знает, как превратить сотрудников в команду. Давайте соберем сильный коллектив через игру.';

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

async function sendWelcome(ctx) {
  const photo = process.env.WELCOME_IMAGE_URL || DEFAULT_WELCOME_IMAGE_URL;
  const caption = process.env.WELCOME_TEXT || DEFAULT_WELCOME_TEXT;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [[{ text: 'Узнать больше', callback_data: 'learn_more' }]],
    },
  };
  try {
    if (photo) {
      await ctx.replyWithPhoto(photo, { caption, parse_mode: 'HTML', ...keyboard });
    } else {
      await ctx.reply(caption, keyboard);
    }
  } catch (e) {
    console.error('Welcome send error:', e?.message || e);
    await ctx.reply('Добро пожаловать! Нажмите «Узнать больше», чтобы начать.', keyboard);
  }
}

bot.action('learn_more', async (ctx) => {
  try {
    await ctx.answerCbQuery();
  } catch {}
  try {
    const reply = await getSellerReply({
      userMessage: 'Пользователь нажал кнопку «Узнать больше». Начни первую реплику и предложи шаг.',
      leadContext: { userId: ctx.from?.id, source: 'unknown' },
    });
    await ctx.reply(reply);
  } catch (e) {
    console.error('AI error (learn_more):', e?.message || e);
    await ctx.reply('Рассказать подробнее? Могу предложить короткий созвон сегодня/завтра.');
  }
});

bot.start(async (ctx) => {
  const payload = ctx.startPayload; // параметр из /start
  const userId = ctx.from?.id;

  await sendWelcome(ctx);

  if (payload) {
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

  await askName(ctx);
});

bot.on('message', async (ctx) => {
  const msg = ctx.message;
  if (!msg || !msg.text) return;

  const replyTo = msg.reply_to_message?.text || '';
  const replyToNorm = replyTo.toLowerCase();

  // Шаги формы определяем по reply_to (надежно для serverless)
  if (replyToNorm.includes('введите имя')) {
    const name = msg.text.trim();
    await askContact(ctx, name);
    return;
  }
  if (replyToNorm.includes('введите контакт')) {
    const meta = replyTo;
    const nameMatch = meta.match(/\[name:(.*?)\]/);
    const name = nameMatch ? nameMatch[1] : '';
    const contact = msg.text.trim();
    await askCompany(ctx, name, contact);
    return;
  }
  if (replyToNorm.includes('введите компанию')) {
    const meta = replyTo;
    const nameMatch = meta.match(/\[name:(.*?)\]/);
    const contactMatch = meta.match(/\[contact:(.*?)\]/);
    const name = nameMatch ? nameMatch[1] : '';
    const contact = contactMatch ? contactMatch[1] : '';
    const company = msg.text.trim();

    try {
      await appendLeadToSheet({
        source: 'Органика',
        userId: ctx.from?.id,
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

    await sendChecklist(ctx);

    try {
      const reply = await getSellerReply({
        userMessage: 'Пользователь оставил контакты, начни продавать.',
        leadContext: { userId: ctx.from?.id, source: 'organic', name, contact, company },
      });
      await ctx.reply(reply);
    } catch (e) {
      console.error('AI error (organic):', e?.message || e);
      await ctx.reply('Спасибо! Мы получили контакты, менеджер свяжется с вами.');
    }
    return;
  }

  // Любые обычные сообщения — включаем продавца ИИ
  if (!msg.text.startsWith('/')) {
    try {
      const reply = await getSellerReply({
        userMessage: msg.text,
        leadContext: { userId: ctx.from?.id, name: ctx.from?.first_name },
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
