import { pino } from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.logLevel,
  transport: config.isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
  base: {
    env: config.nodeEnv,
  },
  redact: {
    paths: ['req.headers.authorization', 'password', 'token', 'otp'],
    censor: '[REDACTED]',
  },
});

export type Logger = typeof logger;

export function createChildLogger(context: Record<string, unknown>): Logger {
  return logger.child(context);
}
