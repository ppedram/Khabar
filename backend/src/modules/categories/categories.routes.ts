import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CategoryService } from './categories.service.js';

export async function categoryRoutes(fastify: FastifyInstance): Promise<void> {
  const categoryService = new CategoryService();

  // Get all categories
  fastify.get(
    '/',
    {
      schema: {
        description: 'Get all incident categories',
        tags: ['Categories'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    slug: { type: 'string' },
                    description: { type: 'string' },
                    icon: { type: 'string' },
                    color: { type: 'string' },
                    severityLevel: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const categories = await categoryService.getAllCategories();
      reply.send({ success: true, data: categories });
    }
  );

  // Get category by slug
  fastify.get(
    '/:slug',
    {
      schema: {
        description: 'Get category details by slug',
        tags: ['Categories'],
        params: {
          type: 'object',
          properties: {
            slug: { type: 'string' },
          },
          required: ['slug'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { slug: string } }>,
      reply: FastifyReply
    ) => {
      const category = await categoryService.getCategoryBySlug(request.params.slug);
      reply.send({ success: true, data: category });
    }
  );

  // Get category statistics
  fastify.get(
    '/stats/summary',
    {
      schema: {
        description: 'Get category statistics',
        tags: ['Categories'],
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const stats = await categoryService.getCategoryStats();
      reply.send({ success: true, data: stats });
    }
  );
}
