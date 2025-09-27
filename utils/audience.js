const { Redis } = require('@upstash/redis');

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

function getRedis() {
  if (!redisUrl || !redisToken) {
    throw new Error('Upstash Redis env vars are not set');
  }
  return new Redis({ url: redisUrl, token: redisToken });
}

async function addAudience(chatId) {
  const redis = getRedis();
  await redis.sadd('audience:ids', String(chatId));
}

async function countAudience() {
  const redis = getRedis();
  return redis.scard('audience:ids');
}

async function getAudienceBatch(limit = 500) {
  const redis = getRedis();
  const ids = await redis.smembers('audience:ids');
  return ids.slice(0, limit).map((x) => Number(x));
}

async function getAllAudience() {
  const redis = getRedis();
  const ids = await redis.smembers('audience:ids');
  return ids.map((x) => Number(x));
}

async function enqueueBroadcast(messageText) {
  const redis = getRedis();
  const jobId = `job:${Date.now()}`;
  await redis.hset(jobId, { text: messageText });
  await redis.lpush('broadcast:jobs', jobId);
  return jobId;
}

async function popBroadcastJob() {
  const redis = getRedis();
  const jobId = await redis.rpop('broadcast:jobs');
  if (!jobId) return null;
  const data = await redis.hgetall(jobId);
  await redis.del(jobId);
  return { id: jobId, ...data };
}

module.exports = { addAudience, countAudience, getAudienceBatch, getAllAudience, enqueueBroadcast, popBroadcastJob };
