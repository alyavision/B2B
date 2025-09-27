const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const { appendLeadToSheet, listAudienceUserIds, getLeadByUserId } = require('../utils/googleSheets');
const { notifyLead } = require('../utils/telegramNotify');
const { getSellerReply } = require('../utils/aiSeller');
// reminders/audience-redis не используем здесь

const token = process.env.B2B_BOT_TOKEN;
if (!token) {
  throw new Error('B2B_BOT_TOKEN is not set');
}

const bot = new Telegraf(token, { handlerTimeout: 9_000 });

const DEFAULT_WELCOME_IMAGE_URL = 'https://i.postimg.cc/vTd9Hx2L/B2B.png';
const DEFAULT_WELCOME_TEXT = 'AI-ассистент, который знает, как превратить сотрудников в команду. Давайте соберем сильный коллектив через игру.';

const WORK_CHAT_ID = Number(process.env.TELEGRAM_CHAT_ID);

// Простая сессия для 3 шагов формы (держится в памяти инстанса)
const session = new Map();
function getS(userId) { return session.get(userId) || {}; }
function setS(userId, data) { session.set(userId, { ...getS(userId), ...data }); }
function clearS(userId) { session.delete(userId); }

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
function askContact(ctx) {
  return ctx.reply('Оставьте, пожалуйста, телефон или e‑mail для связи', { reply_markup: { force_reply: true } });
}
function askCompany(ctx) {
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
    const candidates = [
      process.env.CHECKLIST_PATH,
      path.join(process.cwd(), 'public', 'guide.pdf'),
      path.join(process.cwd(), 'public', 'checklist.pdf'),
      path.join(process.cwd(), 'public', 'Как игры выявляют лидеров в группе.pdf'),
    ].filter(Boolean);
    for (const p of candidates) {
      try { if (fs.existsSync(p)) { await ctx.replyWithDocument({ source: fs.createReadStream(p), filename: path.basename(p) }); return; } } catch {}
    }
    await ctx.reply('Гайд скоро будет доступен.');
  } catch (e) {
    console.error('Checklist send error:', e?.message || e);
    await ctx.reply('Не удалось отправить гайд. Отправлю позже.');
  }
}

async function sendWelcome(ctx) {
  const photo = process.env.WELCOME_IMAGE_URL || DEFAULT_WELCOME_IMAGE_URL;
  const caption = process.env.WELCOME_TEXT || DEFAULT_WELCOME_TEXT;
  try { if (photo) { await ctx.replyWithPhoto(photo, { caption, parse_mode: 'HTML' }); } else { await ctx.reply(caption); } } catch (e) { console.error('Welcome send error:', e?.message || e); await ctx.reply('Добро пожаловать!'); }
}

bot.start(async (ctx) => {
  const payload = ctx.startPayload;
  const userId = ctx.from?.id;

  await sendWelcome(ctx);
  await sendChecklist(ctx);

  let lead = null; try { lead = await getLeadByUserId(userId); } catch {}

  if (payload) {
    // Реклама: сразу продавец ИИ, без повторного приветствия
    try {
      const reply = await getSellerReply({
        userMessage: 'Пользователь пришёл по рекламе. Дай первую реплику без повторного приветствия и начни продавать.',
        leadContext: { userId, source: 'ads', sessionId: payload, name: lead?.name, company: lead?.company, contact: lead?.contact },
      });
      await ctx.reply(reply);
    } catch (e) { console.error('AI start error:', e?.message || e); }

    await notifyLead({ name: ctx.from?.first_name || lead?.name || '', contact: lead?.contact || '', company: lead?.company || '', answers: `sessionId:${payload}`, source: 'Реклама', status: 'готова к звонку' });
    return;
  }

  // Органика: если уже есть все контакты — сразу включаем продавца; иначе начинаем со первого отсутствующего шага
  const hasName = Boolean(lead?.name);
  const hasContact = Boolean(lead?.contact);
  const hasCompany = Boolean(lead?.company);

  if (hasName && hasContact && hasCompany) {
    try {
      const reply = await getSellerReply({
        userMessage: 'Пользователь пришёл органически. У нас уже есть контакты, начни продавать без повторного приветствия.',
        leadContext: { userId, source: 'organic', name: lead.name, company: lead.company, contact: lead.contact },
      });
      await ctx.reply(reply);
    } catch (e) { console.error('AI start error:', e?.message || e); }
    return;
  }

  // Выбираем первый недостающий шаг и задаём один вопрос
  if (!hasName) { setS(userId, { step: 'name' }); await askName(ctx); return; }
  if (!hasContact) { setS(userId, { step: 'contact', name: lead?.name || '' }); await askContact(ctx); return; }
  if (!hasCompany) { setS(userId, { step: 'company', name: lead?.name || '', contact: lead?.contact || '' }); await askCompany(ctx); return; }
});

bot.command('broadcast', async (ctx) => {
  const uid = ctx.from?.id; const ok = await isAdminInWorkChat(uid); if (!ok) return;
  const audience = await listAudienceUserIds().catch(() => []);
  await ctx.reply(`Введите текст рассылки (получателей: ${audience.length}). Ответьте на это сообщение.`);
});

bot.on('message', async (ctx) => {
  const msg = ctx.message; if (!msg || !msg.text) return;

  // Ответ на prompt рассылки
  if (ctx.message.reply_to_message?.text?.includes('Введите текст рассылки')) {
    const uid = ctx.from?.id; const ok = await isAdminInWorkChat(uid); if (!ok) return;
    const textToSend = msg.text; const audience = await listAudienceUserIds().catch(() => []); const rate = 25; let sent = 0;
    for (const chatId of audience) { try { await ctx.telegram.sendMessage(chatId, textToSend); } catch {} sent += 1; if (sent % rate === 0) await new Promise((r) => setTimeout(r, 1000)); }
    await ctx.reply(`Рассылка завершена. Отправлено: ${sent}`); return;
  }

  const userId = ctx.from?.id; const st = getS(userId);
  const replyTo = ctx.message.reply_to_message?.text?.toLowerCase() || '';

  // Fallback по reply_to, если сессия потерялась (serverless)
  let step = st.step;
  if (!step) {
    if (replyTo.includes('как вас зовут?')) step = 'name';
    else if (/(телефон|e-?mail|почт)/i.test(replyTo)) step = 'contact';
    else if (replyTo.includes('как называется ваша компания?')) step = 'company';
  }

  if (step === 'name') { const name = msg.text.trim(); setS(userId, { step: 'contact', name }); await askContact(ctx); return; }
  if (step === 'contact') { const contact = msg.text.trim(); setS(userId, { step: 'company', contact }); await askCompany(ctx); return; }
  if (step === 'company') {
    const company = msg.text.trim();
    // Восстановим name/contact из сессии или Sheets, чтобы не потерять данные между инстансами
    let { name, contact } = getS(userId);
    if (!name || !contact) {
      try { const lead = await getLeadByUserId(userId); name = name || lead?.name || ctx.from?.first_name || ''; contact = contact || lead?.contact || ''; } catch {}
    }
    try { await appendLeadToSheet({ source: 'Органика', userId, name: name || '', contact: contact || '', company, answers: '', checklistSent: true }); } catch (e) { console.error('Sheets append error:', e?.message || e); }
    try { await notifyLead({ name: name || '', contact: contact || '', company, answers: '', source: 'Органика', status: 'готова к звонку' }); } catch (e) { console.error('Notify error:', e?.message || e); }
    clearS(userId);
    try {
      const reply = await getSellerReply({
        userMessage: 'Контакты уже получены, не проси их повторно. Начни продавать по делу.',
        leadContext: { userId, source: 'organic', name, contact, company },
      });
      await ctx.reply(reply);
    } catch (e) { console.error('AI error (organic):', e?.message || e); await ctx.reply('Спасибо! Мы получили контакты, менеджер свяжется с вами.'); }
    return;
  }

  // Интенты и FSM для продаж
  function detectIntent(text) {
    const t = (text || '').toLowerCase();
    // если есть распознанный слот времени — сразу intent time
    if (parseSlot(t)) return 'time';
    if (/cash\s*flow|кэш ?фло|кеш ?фло/.test(t)) return 'cashflow';
    if (/(подробнее|подробно|расскажи|расскажите|что это|как проходит|формат|длительн|сколько стоит|цена|стоимост)/.test(t)) return 'details';
    if (/(давайте|готов|созвон|звонок|перезвон|назначить|как это сделать|хочу|погнали|обсудим|свяжитесь|перезвоните)/.test(t)) return 'schedule';
    return null;
  }

  function askConvenientTime(ctx, product) {
    const prefix = product === 'cashflow' ? 'по CashFlow ' : '';
    return ctx.reply(`Когда вам удобно коротко созвониться ${prefix}с менеджером? Напишите день и время, например: «завтра в 14:00» или «сегодня в 16».`);
  }

  function wordToHour(word) {
    const map = {
      'час': 1, 'один': 1, 'одна': 1,
      'два': 2, 'две': 2,
      'три': 3,
      'четыре': 4,
      'пять': 5,
      'шесть': 6,
      'семь': 7,
      'восемь': 8,
      'девять': 9,
      'десять': 10,
      'одиннадцать': 11,
      'двенадцать': 12,
      'полдень': 12,
      'полночь': 0,
    };
    return map[word];
  }

  function parseSlot(text) {
    const t = (text || '').toLowerCase();
    // день
    const dayMatch = t.match(/\b(сегодня|завтра)\b/);
    const day = dayMatch?.[1] || null;

    // цифровой формат: 12:00, 12.00, в 12, 12 00
    let m = t.match(/\b(?:на|в)?\s*(\d{1,2})(?::|\.|\s)?(\d{2})?\b/);
    if (!m) {
      // словесный час: "в два часа дня", "завтра в три", "на завтра два"
      const wm = t.match(/\b(?:на|в)?\s*(полночь|полдень|одна|один|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать)(?:\s*час(?:а|ов)?)?(?:\s*(утра|дня|вечера|ночи))?/);
      if (wm) {
        let hh = wordToHour(wm[1]);
        const period = wm[2];
        if (period === 'дня' || period === 'вечера') {
          if (hh >= 1 && hh <= 11) hh += 12; // 2 часа дня → 14:00
        } else if (period === 'ночи') {
          if (hh === 12) hh = 0;
        }
        const hhStr = String(hh).padStart(2, '0');
        return { day, time: `${hhStr}:00` };
      }
    }
    if (m) {
      let hh = Number(m[1]);
      let mm = Number(m[2] ?? '00');
      if (!Number.isFinite(hh) || hh < 0 || hh > 23) return null;
      if (!Number.isFinite(mm) || mm < 0 || mm > 59) return null;
      const hhStr = String(hh).padStart(2, '0');
      const mmStr = String(mm).padStart(2, '0');
      return { day, time: `${hhStr}:${mmStr}` };
    }
    return null;
  }

  // Обычный диалог — без приветствий, с контекстом из Sheets
  if (!msg.text.startsWith('/')) {
    const t = msg.text;
    const intent = detectIntent(t);
    const st2 = getS(userId);

    if (intent === 'cashflow') { setS(userId, { phase: 'scheduling', product: 'cashflow' }); await askConvenientTime(ctx, 'cashflow'); return; }

    // Детали по запросу пользователя
    if (intent === 'details') {
      const product = /бункер/.test(t.toLowerCase()) ? 'bunker' : (st2.product || (/cash\s*flow|кэш ?фло|кеш ?фло/.test(t.toLowerCase()) ? 'cashflow' : null));
      let info = '';
      if (product === 'cashflow') {
        info = 'CashFlow — обучающая игра на 2 часа: тренирует финансовое мышление, коммуникацию и принятие решений. Проводим в офисе или на выезде. Есть пакеты с диагностикой и отчётом для HR.';
      } else if (product === 'bunker') {
        info = '«Бункер» — командная ролевая игра на коммуникацию и переговоры. Помогает наладить взаимодействие между отделами, определить роли и снять напряжение.';
      } else {
        info = 'Мы проводим тимбилдинги и обучающие игры под задачи команды: коммуникация, ответственность, финмышление. Ведущие — практикующие психологи, есть отчёт для HR.';
      }
      await ctx.reply(info);
      await askConvenientTime(ctx, product === 'cashflow' ? 'cashflow' : null);
      setS(userId, { phase: 'scheduling', product: product || st2.product || null });
      return;
    }

    if (intent === 'schedule') { setS(userId, { phase: 'scheduling', product: st2.product || null }); await askConvenientTime(ctx, st2.product); return; }

    if (intent === 'time' || st2.phase === 'scheduling') {
      const slot = parseSlot(t);
      if (slot) { let lead = null; try { lead = await getLeadByUserId(userId); } catch {} const when = slot.day ? `${slot.day} в ${slot.time}` : `${slot.time}`; await ctx.reply(`Зафиксировал: ${when}. Менеджер свяжется в это время.`); try { await notifyLead({ name: lead?.name || ctx.from?.first_name || '', contact: lead?.contact || '', company: lead?.company || '', answers: `Слот: ${when}${st2.product ? `, продукт: ${st2.product}` : ''}`, source: 'Органика/Реклама', status: 'согласован созвон', }); } catch (e) { console.error('Notify schedule error:', e?.message || e); } setS(userId, { phase: 'scheduled' }); return; }
      await askConvenientTime(ctx, st2.product); return;
    }

    // По умолчанию — ИИ
    try {
      let lead = null; try { lead = await getLeadByUserId(userId); } catch {}
      const history = [{ role: 'user', content: t }];
      const reply = await getSellerReply({ userMessage: t + ' Продолжай по делу, не предлагай фиксированные слоты; если просят подробности — кратко объясни ценность и затем попроси удобное время.', leadContext: { userId, name: lead?.name, company: lead?.company, contact: lead?.contact, product: st2.product }, history, });
      await ctx.reply(reply, { parse_mode: undefined });
    } catch (e) {
      if (e?.message === 'AI_RATE_LIMITED') { await askConvenientTime(ctx, st2.product); } else { console.error('AI error (general):', e?.message || e); await ctx.reply('Принял сообщение. Вернусь с ответом чуть позже.'); }
    }
  }
});

module.exports = async (req, res) => { if (req.method !== 'POST') { res.status(200).send('OK'); return; } const secret = process.env.WEBHOOK_SECRET; if (secret) { const headerSecret = req.headers['x-telegram-bot-api-secret-token']; if (headerSecret !== secret) { res.status(401).send('Unauthorized'); return; } } try { await bot.handleUpdate(req.body); res.status(200).send('OK'); } catch (err) { console.error('Webhook error:', err); res.status(200).send('OK'); } };
