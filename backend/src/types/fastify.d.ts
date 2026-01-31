import { JWT } from '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    jwt: JWT;
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    authenticateOptional: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    requireAdmin: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
    requireModerator: (
      request: FastifyRequest,
      reply: FastifyReply
    ) => Promise<void>;
  }

  interface FastifyRequest {
    user?: JWTPayload;
  }
}

export interface JWTPayload {
  sub: string; // user id
  phone: string;
  role: 'USER' | 'MODERATOR' | 'ADMIN';
  iat: number;
  exp: number;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}
