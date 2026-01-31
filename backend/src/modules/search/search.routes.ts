import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../config/database.js';
import { getSkip, paginate } from '../../utils/pagination.js';

const searchSchema = z.object({
  q: z.string().min(2).max(100),
  type: z.enum(['all', 'incidents', 'users']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const autocompleteSchema = z.object({
  q: z.string().min(2).max(50),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export async function searchRoutes(fastify: FastifyInstance): Promise<void> {
  // Search incidents and users
  fastify.get(
    '/',
    {
      onRequest: [fastify.authenticateOptional],
      schema: {
        description: 'Search incidents and users',
        tags: ['Search'],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 2 },
            type: { type: 'string', enum: ['all', 'incidents', 'users'] },
            page: { type: 'number' },
            limit: { type: 'number' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: unknown }>, reply: FastifyReply) => {
      const { q, type, page, limit } = searchSchema.parse(request.query);
      const searchTerm = `%${q}%`;

      const results: {
        incidents?: object[];
        users?: object[];
        meta: object;
      } = { meta: {} };

      if (type === 'all' || type === 'incidents') {
        const [incidents, totalIncidents] = await Promise.all([
          prisma.incident.findMany({
            where: {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { address: { contains: q, mode: 'insensitive' } },
                { neighborhood: { contains: q, mode: 'insensitive' } },
              ],
              status: { in: ['PENDING', 'VERIFIED'] },
            },
            include: {
              category: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            skip: getSkip(page, limit),
            take: limit,
          }),
          prisma.incident.count({
            where: {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { address: { contains: q, mode: 'insensitive' } },
                { neighborhood: { contains: q, mode: 'insensitive' } },
              ],
              status: { in: ['PENDING', 'VERIFIED'] },
            },
          }),
        ]);

        results.incidents = incidents.map((inc) => ({
          ...inc,
          latitude: Number(inc.latitude),
          longitude: Number(inc.longitude),
          user: inc.isAnonymous ? null : inc.user,
        }));

        (results.meta as Record<string, unknown>).totalIncidents = totalIncidents;
      }

      if (type === 'all' || type === 'users') {
        const [users, totalUsers] = await Promise.all([
          prisma.user.findMany({
            where: {
              OR: [
                { username: { contains: q, mode: 'insensitive' } },
                { displayName: { contains: q, mode: 'insensitive' } },
              ],
              isBanned: false,
            },
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
              reputationScore: true,
              _count: {
                select: {
                  incidents: {
                    where: { status: { in: ['VERIFIED', 'RESOLVED'] } },
                  },
                },
              },
            },
            orderBy: { reputationScore: 'desc' },
            skip: getSkip(page, limit),
            take: limit,
          }),
          prisma.user.count({
            where: {
              OR: [
                { username: { contains: q, mode: 'insensitive' } },
                { displayName: { contains: q, mode: 'insensitive' } },
              ],
              isBanned: false,
            },
          }),
        ]);

        results.users = users;
        (results.meta as Record<string, unknown>).totalUsers = totalUsers;
      }

      (results.meta as Record<string, unknown>).page = page;
      (results.meta as Record<string, unknown>).limit = limit;

      reply.send({ success: true, data: results });
    }
  );

  // Autocomplete for search
  fastify.get(
    '/autocomplete',
    {
      schema: {
        description: 'Autocomplete suggestions for search',
        tags: ['Search'],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 2 },
            limit: { type: 'number' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: unknown }>, reply: FastifyReply) => {
      const { q, limit } = autocompleteSchema.parse(request.query);

      const [incidents, categories, users] = await Promise.all([
        // Recent incident titles
        prisma.incident.findMany({
          where: {
            title: { contains: q, mode: 'insensitive' },
            status: { in: ['PENDING', 'VERIFIED'] },
          },
          select: { id: true, title: true },
          orderBy: { createdAt: 'desc' },
          take: limit,
        }),

        // Matching categories
        prisma.category.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } },
            ],
            isActive: true,
          },
          select: { id: true, name: true, slug: true, icon: true },
          take: limit,
        }),

        // Matching usernames
        prisma.user.findMany({
          where: {
            username: { contains: q, mode: 'insensitive' },
            isBanned: false,
          },
          select: { id: true, username: true, avatarUrl: true },
          take: limit,
        }),
      ]);

      const suggestions = [
        ...incidents.map((i) => ({ type: 'incident', id: i.id, text: i.title })),
        ...categories.map((c) => ({
          type: 'category',
          id: c.id,
          text: c.name,
          slug: c.slug,
          icon: c.icon,
        })),
        ...users.map((u) => ({
          type: 'user',
          id: u.id,
          text: u.username,
          avatar: u.avatarUrl,
        })),
      ].slice(0, limit);

      reply.send({ success: true, data: suggestions });
    }
  );
}
