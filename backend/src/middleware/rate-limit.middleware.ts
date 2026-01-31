import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { config } from '../config/index.js';
import { getRedis } from '../config/redis.js';

export async function registerRateLimiting(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    global: true,
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
    redis: getRedis(),
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise use IP
      return request.user?.sub ?? request.ip;
    },
    errorResponseBuilder: (_request, context) => ({
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: `Rate limit exceeded. Please try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
      },
    }),
  });
}

// Stricter rate limits for sensitive endpoints
export const authRateLimitConfig = {
  max: 5,
  timeWindow: '1 minute',
  keyGenerator: (request: { ip: string }) => `auth:${request.ip}`,
};

export const otpRateLimitConfig = {
  max: 3,
  timeWindow: '10 minutes',
  keyGenerator: (request: { ip: string; body?: { phoneNumber?: string } }) =>
    `otp:${request.body?.phoneNumber ?? request.ip}`,
};

export const uploadRateLimitConfig = {
  max: 20,
  timeWindow: '1 hour',
  keyGenerator: (request: { user?: { sub: string }; ip: string }) =>
    `upload:${request.user?.sub ?? request.ip}`,
};

export const reportRateLimitConfig = {
  max: 10,
  timeWindow: '1 hour',
  keyGenerator: (request: { user?: { sub: string }; ip: string }) =>
    `report:${request.user?.sub ?? request.ip}`,
};
