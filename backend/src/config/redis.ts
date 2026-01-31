import Redis from 'ioredis';
import { config } from './index.js';
import { logger } from '../utils/logger.js';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    redis.on('connect', () => {
      logger.info('Redis connected');
    });

    redis.on('error', (error) => {
      logger.error({ error }, 'Redis connection error');
    });

    redis.on('close', () => {
      logger.warn('Redis connection closed');
    });
  }

  return redis;
}

export async function connectRedis(): Promise<void> {
  const client = getRedis();
  await client.ping();
  logger.info('Redis connection verified');
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.info('Redis disconnected');
  }
}

// Cache helpers
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const data = await getRedis().get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return data as T;
    }
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await getRedis().setex(key, ttlSeconds, data);
    } else {
      await getRedis().set(key, data);
    }
  },

  async del(key: string): Promise<void> {
    await getRedis().del(key);
  },

  async exists(key: string): Promise<boolean> {
    const result = await getRedis().exists(key);
    return result === 1;
  },

  async incr(key: string): Promise<number> {
    return getRedis().incr(key);
  },

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await getRedis().expire(key, ttlSeconds);
  },
};

// Pub/Sub helpers for real-time features
export const pubsub = {
  async publish(channel: string, message: unknown): Promise<void> {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    await getRedis().publish(channel, data);
  },

  createSubscriber(): Redis {
    return new Redis(config.redisUrl);
  },
};
