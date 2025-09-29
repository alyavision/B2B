const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SELLER_MODE = (process.env.SELLER_MODE || '').toLowerCase();
const ASSISTANT_ID = process.env.SELLER_ASSISTANT_ID;

function loadServices() {
  try {
    if (process.env.SELLER_SERVICES) {
      return JSON.parse(process.env.SELLER_SERVICES);
    }
  } catch {}
  try {
    const p = path.join(process.cwd(), 'config', 'services.json');
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadCompanyKnowledge() {
  const envText = process.env.SELLER_KNOWLEDGE && process.env.SELLER_KNOWLEDGE.trim();
  if (envText) return envText;
  try {
    const p = path.join(process.cwd(), 'config', 'company.md');
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf-8');
    }
  } catch {}
  return null;
}

function loadSystemPrompt() {
  const envPrompt = process.env.SELLER_SYSTEM_PROMPT && process.env.SELLER_SYSTEM_PROMPT.trim();
  if (envPrompt) return envPrompt;
  try {
    const p = path.join(process.cwd(), 'config', 'prompt.md');
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
  } catch {}
  return null;
}

async function safeChatCreate(args, retryModel = null) {
  try {
    return await client.chat.completions.create(args);
  } catch (e) {
    const code = e?.status || e?.code;
    if (code === 429 || code === 402) {
      await new Promise((r) => setTimeout(r, 700));
      try {
        return await client.chat.completions.create(args);
      } catch (e2) {
        if (retryModel) {
          const alt = { ...args, model: retryModel };
          return await client.chat.completions.create(alt);
        }
        throw e2;
      }
    }
    throw e;
  }
}

async function runAssistantOnce({ userMessage, leadContext, history }) {
  if (!ASSISTANT_ID) throw new Error('ASSISTANT_ID_MISSING');
  // Сформируем единое пользовательское сообщение с контекстом и историей
  const hist = Array.isArray(history) ? history.slice(-8) : [];
  const historyText = hist.map(h => `${h.role === 'assistant' ? 'Ассистент' : 'Пользователь'}: ${h.content}`).join('\n');
  const contextText = `Контекст лида: ${JSON.stringify(leadContext || {}, null, 0)}\nИстория (последние сообщения):\n${historyText}\nТекущее сообщение: ${userMessage}`;

  const thread = await client.beta.threads.create({
    messages: [{ role: 'user', content: contextText }],
  });

  const run = await client.beta.threads.runs.create({
    thread_id: thread.id,
    assistant_id: ASSISTANT_ID,
  });

  // Ждём завершения до ~6 секунд (serverless ограничение), с шагом 300мс
  const started = Date.now();
  while (true) {
    const r = await client.beta.threads.runs.retrieve(thread.id, run.id);
    if (r.status === 'completed') break;
    if (r.status === 'failed' || r.status === 'cancelled' || r.status === 'expired') {
      throw new Error(`ASSISTANT_RUN_${r.status.toUpperCase()}`);
    }
    if (Date.now() - started > 6000) {
      throw new Error('ASSISTANT_TIMEOUT');
    }
    await new Promise((res) => setTimeout(res, 300));
  }

  const msgs = await client.beta.threads.messages.list(thread.id, { order: 'desc', limit: 1 });
  const msg = msgs.data?.[0];
  const text = msg?.content?.[0]?.text?.value || '';
  return text.trim();
}

async function getSellerReply({ userMessage, leadContext, history }) {
  // Режим ассистента
  if (SELLER_MODE === 'assistant' && ASSISTANT_ID) {
    try {
      const text = await runAssistantOnce({ userMessage, leadContext, history });
      if (text) return text;
    } catch (e) {
      // Падают на 429/таймаутах —fallback к обычному чату ниже
    }
  }

  // Обычный чат (наш текущий режим)
  const cfg = loadServices();
  const servicesText = cfg?.services
    ? cfg.services.map(s => `- ${s.name}: ${s.pitches?.join(', ') || ''}`).join('\n')
    : null;

  const company = cfg?.company || 'Наша компания';
  const tone = cfg?.tone || 'Вы, дружелюбно, кратко, по делу';
  const cta = cfg?.cta || 'Предложите выбрать время для короткого созвона сегодня/завтра.';

  const customSystem = loadSystemPrompt();
  const knowledge = loadCompanyKnowledge();

  const baseSystem = [
    `Ты опытный B2B-продавец компании ${company}.`,
    `Тон: ${tone}.`,
    'Цель: квалифицировать (роль, компания, бюджет, сроки) и довести до следующего шага.',
    `CTA: ${cta}.`,
    'Не используй Markdown/эмодзи, только простой текст. Не повторяй приветствие, если диалог уже идёт.',
  ].join(' ');

  const systemParts = [];
  if (customSystem) systemParts.push(customSystem); else systemParts.push(baseSystem);
  if (servicesText) systemParts.push('Наши услуги и офферы:\n' + servicesText);
  if (knowledge) systemParts.push('Справка компании (используй при ответах, но не цитируй целиком):\n' + knowledge);

  // Динамические правила
  const hasAnyContact = Boolean(leadContext && (leadContext.contact || leadContext.company || leadContext.name));
  const missing = [];
  if (leadContext) {
    if (!leadContext.name) missing.push('имя');
    if (!leadContext.contact) missing.push('контакт');
    if (!leadContext.company) missing.push('компания');
  }
  if (hasAnyContact) {
    systemParts.push('Контакты частично/полностью получены. Никогда не проси контакты повторно. Не делай повторную квалификацию. Не начинай с приветствия.');
  }
  if (missing.length > 0 && missing.length < 3) {
    systemParts.push('Если не хватает данных, разрешено спросить максимум ОДИН недостающий пункт (' + missing.join(', ') + '), затем сразу продолжай по делу: ценность и CTA на созвон.');
  }

  const system = systemParts.join('\n\n');

  const clippedHistory = Array.isArray(history) ? history.slice(-8) : [];

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Контекст лида: ${JSON.stringify(leadContext || {}, null, 0)}` },
    ...clippedHistory.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage.slice(0, 4000) },
  ];

  const resp = await safeChatCreate({ model: 'gpt-4o', messages, temperature: 0.3 }, 'gpt-4o-mini');
  return resp.choices?.[0]?.message?.content?.trim() || 'Готов помочь! Расскажите, что вас интересует?';
}

module.exports = { getSellerReply };
