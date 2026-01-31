import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import multipart from '@fastify/multipart';

import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.middleware.js';
import { registerAuthHooks } from './middleware/auth.middleware.js';
import { registerRateLimiting } from './middleware/rate-limit.middleware.js';

// Route imports
import { authRoutes } from './modules/auth/auth.routes.js';
import { userRoutes } from './modules/users/users.routes.js';
import { categoryRoutes } from './modules/categories/categories.routes.js';
import { incidentRoutes } from './modules/incidents/incidents.routes.js';
import { commentRoutes } from './modules/comments/comments.routes.js';
import { mediaRoutes } from './modules/media/media.routes.js';
import { notificationRoutes } from './modules/notifications/notifications.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { searchRoutes } from './modules/search/search.routes.js';

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: config.logLevel,
      transport: config.isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
    },
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // Security plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: config.isProduction,
  });

  await fastify.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

  // JWT plugin
  await fastify.register(jwt, {
    secret: config.jwt.secret,
    sign: {
      expiresIn: config.jwt.accessExpiry,
    },
  });

  // File upload plugin
  await fastify.register(multipart, {
    limits: {
      fileSize: config.media.maxVideoSizeMb * 1024 * 1024, // Max video size
      files: 5, // Max files per request
    },
  });

  // Rate limiting
  await registerRateLimiting(fastify);

  // Auth hooks
  registerAuthHooks(fastify);

  // API Documentation
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Khabar API',
        description: 'Crime and Safety Reporting API',
        version: '1.0.0',
      },
      servers: [
        {
          url: config.isProduction
            ? 'https://api.khabar.app'
            : `http://localhost:${config.port}`,
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });

  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  });

  // Health check (before prefix)
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // API routes with version prefix
  await fastify.register(
    async (api) => {
      await api.register(authRoutes, { prefix: '/auth' });
      await api.register(userRoutes, { prefix: '/users' });
      await api.register(categoryRoutes, { prefix: '/categories' });
      await api.register(incidentRoutes, { prefix: '/incidents' });
      await api.register(commentRoutes, { prefix: '/comments' });
      await api.register(mediaRoutes, { prefix: '/media' });
      await api.register(notificationRoutes, { prefix: '/notifications' });
      await api.register(adminRoutes, { prefix: '/admin' });
      await api.register(searchRoutes, { prefix: '/search' });
    },
    { prefix: config.apiPrefix }
  );

  // Error handling
  fastify.setErrorHandler(errorHandler);
  fastify.setNotFoundHandler(notFoundHandler);

  // Graceful shutdown hooks
  fastify.addHook('onClose', async () => {
    logger.info('Server shutting down...');
  });

  return fastify;
}
