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

function buildAssistantInstructions(leadContext) {
  const parts = [
    'Веди себя как опытный B2B‑продавец. Коротко, по делу, без приветствий и без Markdown.',
    'Никогда не проси имя/телефон/e‑mail/компанию — сбор контактов делает сам бот.',
    'Не повторяй квалификацию, если диалог уже идёт. Отвечай на вопрос и веди к смысловому следующему шагу.',
    'Если уместно, попроси собеседника назвать удобный день и время В СВОБОДНОЙ ФОРМЕ. Не навязывай фиксированные слоты.',
  ];
  if (leadContext?.source === 'ads') {
    parts.push('Пользователь пришёл из рекламы: работай с готовым лидом, не проси контакты.');
  }
  if (leadContext?.started) {
    parts.push('Диалог уже начат: не здороваться повторно.');
  }
  return parts.join(' ');
}

async function runAssistantOnce({ userMessage, leadContext, history }) {
  if (!ASSISTANT_ID) throw new Error('ASSISTANT_ID_MISSING');
  const hist = Array.isArray(history) ? history.slice(-8) : [];
  const historyText = hist.map(h => `${h.role === 'assistant' ? 'Ассистент' : 'Пользователь'}: ${h.content}`).join('\n');
  const contextText = `Контекст лида: ${JSON.stringify(leadContext || {}, null, 0)}\nИстория (последние сообщения):\n${historyText}\nТекущее сообщение: ${userMessage}`;

  const thread = await client.beta.threads.create({ messages: [{ role: 'user', content: contextText }] });

  const run = await client.beta.threads.runs.create({
    thread_id: thread.id,
    assistant_id: ASSISTANT_ID,
    instructions: buildAssistantInstructions(leadContext),
  });

  const started = Date.now();
  while (true) {
    const r = await client.beta.threads.runs.retrieve(thread.id, run.id);
    if (r.status === 'completed') break;
    if (['failed', 'cancelled', 'expired'].includes(r.status)) {
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
  if (SELLER_MODE === 'assistant' && ASSISTANT_ID) {
    try {
      const text = await runAssistantOnce({ userMessage, leadContext, history });
      if (text) return text;
    } catch (e) {
      // fallback ниже
    }
  }

  const cfg = loadServices();
  const servicesText = cfg?.services
    ? cfg.services.map(s => `- ${s.name}: ${s.pitches?.join(', ') || ''}`).join('\n')
    : null;

  const company = cfg?.company || 'Наша компания';
  const tone = cfg?.tone || 'Вы, дружелюбно, кратко, по делу';
  const cta = cfg?.cta || 'Попроси собеседника назвать удобный день и время для короткого созвона в свободной форме (не навязывай слоты).';

  const customSystem = loadSystemPrompt();
  const knowledge = loadCompanyKnowledge();

  const baseSystem = [
    `Ты опытный B2B-продавец компании ${company}.`,
    `Тон: ${tone}.`,
    'Не используй приветствия и Markdown. Никогда не проси имя/телефон/e‑mail/компанию.',
    `CTA: ${cta}.`,
  ].join(' ');

  const systemParts = [];
  if (customSystem) systemParts.push(customSystem); else systemParts.push(baseSystem);
  if (servicesText) systemParts.push('Наши услуги и офферы:\n' + servicesText);
  if (knowledge) systemParts.push('Справка компании (используй при ответах, но не цитируй целиком):\n' + knowledge);

  const hasAnyContact = Boolean(leadContext && (leadContext.contact || leadContext.company || leadContext.name));
  if (hasAnyContact) systemParts.push('Контакты уже есть — не проси их повторно.');

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
