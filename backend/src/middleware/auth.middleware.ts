import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { prisma } from '../config/database.js';

export function registerAuthHooks(fastify: FastifyInstance): void {
  // Standard authentication - requires valid JWT
  fastify.decorate(
    'authenticate',
    async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
      try {
        await request.jwtVerify();

        // Check if user is banned
        const user = await prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { isBanned: true },
        });

        if (user?.isBanned) {
          throw new ForbiddenError('Your account has been suspended');
        }
      } catch (err) {
        throw new UnauthorizedError('Authentication required');
      }
    }
  );

  // Optional authentication - populates user if token present, but doesn't require it
  fastify.decorate(
    'authenticateOptional',
    async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
      try {
        const authHeader = request.headers.authorization;
        if (authHeader) {
          await request.jwtVerify();
        }
      } catch {
        // Silently ignore auth errors for optional auth
        request.user = undefined;
      }
    }
  );

  // Admin-only access
  fastify.decorate(
    'requireAdmin',
    async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
      try {
        await request.jwtVerify();

        if (request.user.role !== 'ADMIN') {
          throw new ForbiddenError('Admin access required');
        }

        // Verify user still has admin role in database
        const user = await prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { role: true, isBanned: true },
        });

        if (!user || user.role !== 'ADMIN') {
          throw new ForbiddenError('Admin access required');
        }

        if (user.isBanned) {
          throw new ForbiddenError('Your account has been suspended');
        }
      } catch (err) {
        if (err instanceof ForbiddenError) throw err;
        throw new UnauthorizedError('Authentication required');
      }
    }
  );

  // Moderator or Admin access
  fastify.decorate(
    'requireModerator',
    async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
      try {
        await request.jwtVerify();

        if (request.user.role !== 'ADMIN' && request.user.role !== 'MODERATOR') {
          throw new ForbiddenError('Moderator access required');
        }

        // Verify user still has appropriate role in database
        const user = await prisma.user.findUnique({
          where: { id: request.user.sub },
          select: { role: true, isBanned: true },
        });

        if (!user || (user.role !== 'ADMIN' && user.role !== 'MODERATOR')) {
          throw new ForbiddenError('Moderator access required');
        }

        if (user.isBanned) {
          throw new ForbiddenError('Your account has been suspended');
        }
      } catch (err) {
        if (err instanceof ForbiddenError) throw err;
        throw new UnauthorizedError('Authentication required');
      }
    }
  );
}
