const { Redis } = require('@upstash/redis');

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

function getRedis() {
  if (!redisUrl || !redisToken) {
    throw new Error('Upstash Redis env vars are not set');
  }
  return new Redis({ url: redisUrl, token: redisToken });
}

function makeReminderId(userId, kind, dueMs) {
  return `r:${userId}:${kind}:${dueMs}`;
}

async function scheduleReminders({ userId, chatId }) {
  const redis = getRedis();
  const now = Date.now();
  const fourH = now + 4 * 60 * 60 * 1000;
  const twentyFourH = now + 24 * 60 * 60 * 1000;

  const r1 = makeReminderId(userId, '4h', fourH);
  const r2 = makeReminderId(userId, '24h', twentyFourH);

  // Сохраняем payload
  await redis.hset(r1, { userId: String(userId), chatId: String(chatId), kind: '4h' });
  await redis.hset(r2, { userId: String(userId), chatId: String(chatId), kind: '24h' });
  // Индексируем в отсортированном наборе по времени
  await redis.zadd('reminders:due', { score: fourH, member: r1 });
  await redis.zadd('reminders:due', { score: twentyFourH, member: r2 });
}

async function cancelReminders(userId) {
  const redis = getRedis();
  // Вытащим все элементы и удалим по шаблону
  const now = Date.now() + 365 * 24 * 60 * 60 * 1000; // верхняя граница
  const list = await redis.zrangebyscore('reminders:due', 0, now);
  const toDelete = list.filter((id) => id.startsWith(`r:${userId}:`));
  if (toDelete.length === 0) return;
  await redis.zrem('reminders:due', ...toDelete);
  for (const id of toDelete) {
    await redis.del(id);
  }
}

async function popDueReminders(limit = 100) {
  const redis = getRedis();
  const now = Date.now();
  const due = await redis.zrangebyscore('reminders:due', 0, now, { limit: { offset: 0, count: limit } });
  const items = [];
  for (const id of due) {
    const data = await redis.hgetall(id);
    items.push({ id, ...data });
  }
  if (due.length) {
    await redis.zrem('reminders:due', ...due);
    for (const id of due) await redis.del(id);
  }
  return items;
}

module.exports = { scheduleReminders, cancelReminders, popDueReminders };
