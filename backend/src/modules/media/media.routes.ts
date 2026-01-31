import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MediaService } from './media.service.js';
import { uploadRateLimitConfig } from '../../middleware/rate-limit.middleware.js';

export async function mediaRoutes(fastify: FastifyInstance): Promise<void> {
  const mediaService = new MediaService();

  // Upload media to incident
  fastify.post(
    '/incident/:incidentId',
    {
      onRequest: [fastify.authenticate],
      config: {
        rateLimit: uploadRateLimitConfig,
      },
      schema: {
        description: 'Upload media to an incident',
        tags: ['Media'],
        security: [{ bearerAuth: [] }],
        consumes: ['multipart/form-data'],
        params: {
          type: 'object',
          properties: {
            incidentId: { type: 'string', format: 'uuid' },
          },
          required: ['incidentId'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { incidentId: string } }>,
      reply: FastifyReply
    ) => {
      const file = await request.file();

      if (!file) {
        reply.status(400).send({
          success: false,
          error: { code: 'NO_FILE', message: 'No file uploaded' },
        });
        return;
      }

      const media = await mediaService.uploadMedia(
        request.params.incidentId,
        request.user!.sub,
        file
      );

      reply.status(201).send({ success: true, data: media });
    }
  );

  // Get media for incident
  fastify.get(
    '/incident/:incidentId',
    {
      schema: {
        description: 'Get media for an incident',
        tags: ['Media'],
        params: {
          type: 'object',
          properties: {
            incidentId: { type: 'string', format: 'uuid' },
          },
          required: ['incidentId'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { incidentId: string } }>,
      reply: FastifyReply
    ) => {
      const media = await mediaService.getIncidentMedia(request.params.incidentId);
      reply.send({ success: true, data: media });
    }
  );

  // Delete media
  fastify.delete(
    '/:id',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Delete media',
        tags: ['Media'],
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
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const isAdmin = request.user!.role === 'ADMIN';
      await mediaService.deleteMedia(request.params.id, request.user!.sub, isAdmin);
      reply.send({ success: true, data: { message: 'Media deleted' } });
    }
  );

  // Set primary media
  fastify.patch(
    '/incident/:incidentId/primary/:mediaId',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Set primary media for an incident',
        tags: ['Media'],
        security: [{ bearerAuth: [] }],
        params: {
          type: 'object',
          properties: {
            incidentId: { type: 'string', format: 'uuid' },
            mediaId: { type: 'string', format: 'uuid' },
          },
          required: ['incidentId', 'mediaId'],
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: { incidentId: string; mediaId: string };
      }>,
      reply: FastifyReply
    ) => {
      const media = await mediaService.setPrimaryMedia(
        request.params.incidentId,
        request.params.mediaId,
        request.user!.sub
      );
      reply.send({ success: true, data: media });
    }
  );
}
