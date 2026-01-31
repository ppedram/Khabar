import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AdminService } from './admin.service.js';
import { paginationSchema } from '../../utils/pagination.js';

const processModerationSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  notes: z.string().max(1000).optional(),
});

const updateUserSchema = z.object({
  role: z.enum(['USER', 'MODERATOR', 'ADMIN']).optional(),
  isBanned: z.boolean().optional(),
  banReason: z.string().max(500).optional(),
});

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  const adminService = new AdminService();

  // All admin routes require moderator or admin role
  fastify.addHook('onRequest', fastify.requireModerator);

  // Get moderation queue
  fastify.get(
    '/moderation-queue',
    {
      schema: {
        description: 'Get moderation queue',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            contentType: { type: 'string', enum: ['INCIDENT', 'COMMENT', 'MEDIA', 'USER'] },
            status: { type: 'string', enum: ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'] },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: unknown }>, reply: FastifyReply) => {
      const pagination = paginationSchema.parse(request.query);
      const query = request.query as { contentType?: string; status?: string };
      const result = await adminService.getModerationQueue(pagination, {
        contentType: query.contentType,
        status: query.status,
      });
      reply.send({ success: true, ...result });
    }
  );

  // Process moderation item
  fastify.patch(
    '/moderation-queue/:id',
    {
      schema: {
        description: 'Process a moderation item',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      const data = processModerationSchema.parse(request.body);
      const result = await adminService.processModerationItem(
        request.params.id,
        request.user!.sub,
        data.decision,
        data.notes
      );
      reply.send({ success: true, data: result });
    }
  );

  // Get all incidents (admin view)
  fastify.get(
    '/incidents',
    {
      schema: {
        description: 'Get all incidents (admin view)',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest<{ Querystring: unknown }>, reply: FastifyReply) => {
      const pagination = paginationSchema.parse(request.query);
      const query = request.query as { status?: string; severity?: string };
      const result = await adminService.getAllIncidents(pagination, {
        status: query.status,
        severity: query.severity,
      });
      reply.send({ success: true, ...result });
    }
  );

  // Update incident status
  fastify.patch(
    '/incidents/:id/status',
    {
      schema: {
        description: 'Update incident status',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: {
              type: 'string',
              enum: ['PENDING', 'VERIFIED', 'RESOLVED', 'REJECTED', 'EXPIRED'],
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status: string };
      }>,
      reply: FastifyReply
    ) => {
      const { status } = request.body;
      const incident = await adminService.updateIncidentStatus(
        request.params.id,
        status,
        request.user!.sub
      );
      reply.send({ success: true, data: incident });
    }
  );

  // Get all users - admin only
  fastify.get(
    '/users',
    {
      onRequest: [fastify.requireAdmin],
      schema: {
        description: 'Get all users (admin only)',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest<{ Querystring: unknown }>, reply: FastifyReply) => {
      const pagination = paginationSchema.parse(request.query);
      const query = request.query as { role?: string; isBanned?: string };
      const result = await adminService.getAllUsers(pagination, {
        role: query.role,
        isBanned: query.isBanned === 'true',
      });
      reply.send({ success: true, ...result });
    }
  );

  // Update user - admin only
  fastify.patch(
    '/users/:id',
    {
      onRequest: [fastify.requireAdmin],
      schema: {
        description: 'Update user (admin only)',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
      reply: FastifyReply
    ) => {
      const data = updateUserSchema.parse(request.body);
      const user = await adminService.updateUser(request.params.id, data);
      reply.send({ success: true, data: user });
    }
  );

  // Get platform statistics
  fastify.get(
    '/stats',
    {
      schema: {
        description: 'Get platform statistics',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const stats = await adminService.getStats();
      reply.send({ success: true, data: stats });
    }
  );

  // Get user reports
  fastify.get(
    '/reports',
    {
      schema: {
        description: 'Get user reports',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
      },
    },
    async (request: FastifyRequest<{ Querystring: unknown }>, reply: FastifyReply) => {
      const pagination = paginationSchema.parse(request.query);
      const query = request.query as { status?: string };
      const result = await adminService.getUserReports(pagination, query.status);
      reply.send({ success: true, ...result });
    }
  );

  // Process user report
  fastify.patch(
    '/reports/:id',
    {
      schema: {
        description: 'Process a user report',
        tags: ['Admin'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['REVIEWED', 'ACTION_TAKEN', 'DISMISSED'] },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status: 'REVIEWED' | 'ACTION_TAKEN' | 'DISMISSED' };
      }>,
      reply: FastifyReply
    ) => {
      const report = await adminService.processUserReport(
        request.params.id,
        request.body.status
      );
      reply.send({ success: true, data: report });
    }
  );
}
