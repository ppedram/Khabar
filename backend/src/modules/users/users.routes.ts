import type { FastifyInstance } from 'fastify';
import { UserController } from './users.controller.js';
import { UserService } from './users.service.js';
import { reportRateLimitConfig } from '../../middleware/rate-limit.middleware.js';

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  const userService = new UserService();
  const controller = new UserController(userService);

  // Get current user
  fastify.get(
    '/me',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Get current user profile',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
      },
    },
    controller.getCurrentUser.bind(controller)
  );

  // Update profile
  fastify.patch(
    '/me',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Update current user profile',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
      },
    },
    controller.updateProfile.bind(controller)
  );

  // Get settings
  fastify.get(
    '/me/settings',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Get user settings',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
      },
    },
    controller.getSettings.bind(controller)
  );

  // Update settings
  fastify.patch(
    '/me/settings',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Update user settings',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
      },
    },
    controller.updateSettings.bind(controller)
  );

  // Get user's incidents
  fastify.get(
    '/me/incidents',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: "Get current user's reported incidents",
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
      },
    },
    controller.getUserIncidents.bind(controller)
  );

  // Register device
  fastify.post(
    '/me/devices',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Register device for push notifications',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
      },
    },
    controller.registerDevice.bind(controller)
  );

  // Unregister device
  fastify.delete(
    '/me/devices/:id',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Unregister device',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    controller.unregisterDevice.bind(controller)
  );

  // Get public profile
  fastify.get(
    '/:id',
    {
      onRequest: [fastify.authenticateOptional],
      schema: {
        description: 'Get public user profile',
        tags: ['Users'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    controller.getPublicProfile.bind(controller)
  );

  // Report user
  fastify.post(
    '/:id/report',
    {
      onRequest: [fastify.authenticate],
      config: {
        rateLimit: reportRateLimitConfig,
      },
      schema: {
        description: 'Report a user',
        tags: ['Users'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    controller.reportUser.bind(controller)
  );
}
