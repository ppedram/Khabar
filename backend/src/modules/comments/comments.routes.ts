import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CommentService } from './comments.service.js';
import { paginationSchema } from '../../utils/pagination.js';
import { reportRateLimitConfig } from '../../middleware/rate-limit.middleware.js';

const createCommentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.string().uuid().optional(),
});

const updateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

export async function commentRoutes(fastify: FastifyInstance): Promise<void> {
  const commentService = new CommentService();

  // Get comments for incident (defined in incident routes too)
  fastify.get(
    '/incident/:incidentId',
    {
      schema: {
        description: 'Get comments for an incident',
        tags: ['Comments'],
        params: {
          type: 'object',
          properties: { incidentId: { type: 'string', format: 'uuid' } },
          required: ['incidentId'],
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { incidentId: string };
        Querystring: unknown;
      }>,
      reply: FastifyReply
    ) => {
      const pagination = paginationSchema.parse(request.query);
      const result = await commentService.getComments(
        request.params.incidentId,
        pagination
      );
      reply.send({ success: true, ...result });
    }
  );

  // Create comment
  fastify.post(
    '/incident/:incidentId',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Add a comment to an incident',
        tags: ['Comments'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { incidentId: { type: 'string', format: 'uuid' } },
          required: ['incidentId'],
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { incidentId: string };
        Body: unknown;
      }>,
      reply: FastifyReply
    ) => {
      const data = createCommentSchema.parse(request.body);
      const comment = await commentService.createComment(
        request.params.incidentId,
        request.user!.sub,
        data
      );
      reply.status(201).send({ success: true, data: comment });
    }
  );

  // Update comment
  fastify.patch(
    '/:id',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Update a comment',
        tags: ['Comments'],
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
      const data = updateCommentSchema.parse(request.body);
      const comment = await commentService.updateComment(
        request.params.id,
        request.user!.sub,
        data
      );
      reply.send({ success: true, data: comment });
    }
  );

  // Delete comment
  fastify.delete(
    '/:id',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Delete a comment',
        tags: ['Comments'],
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
      const isAdmin = request.user!.role === 'ADMIN';
      await commentService.deleteComment(
        request.params.id,
        request.user!.sub,
        isAdmin
      );
      reply.send({ success: true, data: { message: 'Comment deleted' } });
    }
  );

  // Upvote comment
  fastify.post(
    '/:id/upvote',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Upvote a comment (toggle)',
        tags: ['Comments'],
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
      const result = await commentService.upvoteComment(
        request.params.id,
        request.user!.sub
      );
      reply.send({ success: true, data: result });
    }
  );

  // Report comment
  fastify.post(
    '/:id/report',
    {
      onRequest: [fastify.authenticate],
      config: {
        rateLimit: reportRateLimitConfig,
      },
      schema: {
        description: 'Report a comment',
        tags: ['Comments'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', format: 'uuid' } },
          required: ['id'],
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { reason?: string };
      }>,
      reply: FastifyReply
    ) => {
      const reason = (request.body as { reason?: string })?.reason ?? '';
      const result = await commentService.reportComment(
        request.params.id,
        request.user!.sub,
        reason
      );
      reply.send({ success: true, data: result });
    }
  );
}
