const OpenAI = require('openai');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function getSellerReply({ userMessage, leadContext }) {
  const system = [
    'Ты опытный B2B-продавец. Общайся естественно, кратко и по делу.',
    'Цель: назначить следующий шаг (созвон/встреча) или предложить Cashflow/продукт.',
    'Всегда учитывай контекст лида (источник: реклама/органика, имя/компания, если есть).',
  ].join(' ');

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
