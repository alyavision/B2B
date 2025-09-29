const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SELLER_MODE = (process.env.SELLER_MODE || '').toLowerCase();
const ASSISTANT_ID = process.env.SELLER_ASSISTANT_ID;

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

async function runAssistantOnce({ userMessage, leadContext, history }) {
  if (!ASSISTANT_ID) throw new Error('ASSISTANT_ID_MISSING');
  const hist = Array.isArray(history) ? history.slice(-8) : [];
  const historyText = hist.map(h => `${h.role === 'assistant' ? 'Ассистент' : 'Пользователь'}: ${h.content}`).join('\n');
  const contextText = `Контекст лида: ${JSON.stringify(leadContext || {}, null, 0)}\nИстория (последние сообщения):\n${historyText}\nТекущее сообщение: ${userMessage}`;

  const tryRun = async () => {
    const thread = await client.beta.threads.create({ messages: [{ role: 'user', content: contextText }] });
    const run = await client.beta.threads.runs.create({ thread_id: thread.id, assistant_id: ASSISTANT_ID });
    const started = Date.now();
    while (true) {
      const r = await client.beta.threads.runs.retrieve(thread.id, run.id);
      if (r.status === 'completed') {
        const msgs = await client.beta.threads.messages.list(thread.id, { order: 'desc', limit: 1 });
        const msg = msgs.data?.[0];
        const text = msg?.content?.[0]?.text?.value || '';
        return text.trim();
      }
      if (['failed', 'cancelled', 'expired'].includes(r.status)) {
        throw new Error(`ASSISTANT_RUN_${r.status.toUpperCase()}`);
      }
      if (Date.now() - started > 9000) {
        throw new Error('ASSISTANT_TIMEOUT');
      }
      await new Promise((res) => setTimeout(res, 300));
    }
  };

  try {
    return await tryRun();
  } catch (e) {
    if (e?.message === 'ASSISTANT_TIMEOUT') {
      // одна повторная попытка
      try {
        return await tryRun();
      } catch {}
    }
    throw e;
  }
}

async function getSellerReply({ userMessage, leadContext, history }) {
  // Только ассистент: без локальных промптов/чат-комплишнса
  if (SELLER_MODE === 'assistant' && ASSISTANT_ID) {
    try {
      const text = await runAssistantOnce({ userMessage, leadContext, history });
      if (text) return text;
      return 'Принял сообщение. Вернусь с ответом чуть позже.';
    } catch {
      return 'Принял сообщение. Вернусь с ответом чуть позже.';
    }
  }

  // Резервный режим (если нужен в будущем): локальные промпты
  const knowledge = loadCompanyKnowledge();
  const customSystem = loadSystemPrompt();
  const system = [
    customSystem || 'Отвечай кратко и по делу.',
    knowledge ? `Справка:\n${knowledge}` : '',
  ].filter(Boolean).join('\n\n');

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: userMessage.slice(0, 4000) },
  ];

  const resp = await client.chat.completions.create({ model: 'gpt-4o', messages, temperature: 0.3 });
  return resp.choices?.[0]?.message?.content?.trim() || 'Принял сообщение.';
}

module.exports = { getSellerReply };
