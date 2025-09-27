const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

async function getSellerReply({ userMessage, leadContext }) {
  const cfg = loadServices();
  const servicesText = cfg?.services
    ? cfg.services.map(s => `- ${s.name}: ${s.pitches?.join(', ') || ''}`).join('\n')
    : null;

  const company = cfg?.company || 'Наша компания';
  const tone = cfg?.tone || 'Вы, дружелюбно, кратко, по делу';
  const cta = cfg?.cta || 'Предложите выбрать время для короткого созвона сегодня/завтра.';

  const customSystem = process.env.SELLER_SYSTEM_PROMPT && process.env.SELLER_SYSTEM_PROMPT.trim();
  const knowledge = loadCompanyKnowledge();

  const baseSystem = [
    `Ты опытный B2B-продавец компании ${company}.`,
    `Тон: ${tone}.`,
    'Цель: квалифицировать (роль, компания, бюджет, сроки) и довести до следующего шага.',
    `CTA: ${cta}.`,
    'Учитывай контекст лида (источник: реклама/органика, имя/компания, если есть).',
    'Пиши 2–4 коротких предложения, без канцелярита. Всегда заканчивай CTA.',
  ].join(' ');

  const systemParts = [];
  if (customSystem) systemParts.push(customSystem); else systemParts.push(baseSystem);
  if (servicesText) systemParts.push('Наши услуги и офферы:\n' + servicesText);
  if (knowledge) systemParts.push('Справка компании (используй при ответах, но не цитируй целиком):\n' + knowledge);

  const system = systemParts.join('\n\n');

  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: `Контекст лида: ${JSON.stringify(leadContext, null, 0)}` },
    { role: 'user', content: userMessage.slice(0, 4000) },
  ];

  const resp = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.6,
  });

  return resp.choices?.[0]?.message?.content?.trim() || 'Готов помочь! Расскажите, что вас интересует?';
}

module.exports = { getSellerReply };
