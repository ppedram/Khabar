import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { NotificationService } from './notifications.service.js';
import { paginationSchema } from '../../utils/pagination.js';

export async function notificationRoutes(fastify: FastifyInstance): Promise<void> {
  const notificationService = new NotificationService();

  // All notification routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // Get notifications
  fastify.get(
    '/',
    {
      schema: {
        description: 'Get user notifications',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest<{ Querystring: unknown }>, reply: FastifyReply) => {
      const pagination = paginationSchema.parse(request.query);
      const result = await notificationService.getNotifications(
        request.user!.sub,
        pagination
      );
      reply.send({ success: true, ...result });
    }
  );

  // Get unread count
  fastify.get(
    '/unread-count',
    {
      schema: {
        description: 'Get unread notification count',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await notificationService.getUnreadCount(request.user!.sub);
      reply.send({ success: true, data: result });
    }
  );

  // Mark notification as read
  fastify.patch(
    '/:id/read',
    {
      schema: {
        description: 'Mark notification as read',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const notification = await notificationService.markAsRead(
        request.params.id,
        request.user!.sub
      );
      reply.send({ success: true, data: notification });
    }
  );

  // Mark all as read
  fastify.patch(
    '/read-all',
    {
      schema: {
        description: 'Mark all notifications as read',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await notificationService.markAllAsRead(request.user!.sub);
      reply.send({ success: true, data: result });
    }
  );

  // Delete notification
  fastify.delete(
    '/:id',
    {
      schema: {
        description: 'Delete a notification',
        tags: ['Notifications'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      await notificationService.deleteNotification(
        request.params.id,
        request.user!.sub
      );
      reply.send({ success: true, data: { message: 'Notification deleted' } });
    }
  );
}
