import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { AppError, isAppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  logger.error(
    {
      err: error,
      url: request.url,
      method: request.method,
      userId: request.user?.sub,
    },
    'Request error'
  );

  // Handle our custom application errors
  if (isAppError(error)) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    };

    // Add validation errors if present
    if ('errors' in error && error.errors) {
      response.error.details = error.errors;
    }

    reply.status(error.statusCode).send(response);
    return;
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    };

    reply.status(422).send(response);
    return;
  }

  // Handle Fastify validation errors
  if ('validation' in error && error.validation) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: error.validation,
      },
    };

    reply.status(400).send(response);
    return;
  }

  // Handle JWT errors
  if (error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' ||
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED' ||
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID') {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired token',
      },
    };

    reply.status(401).send(response);
    return;
  }

  // Handle rate limit errors
  if (error.statusCode === 429) {
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many requests, please try again later',
      },
    };

    reply.status(429).send(response);
    return;
  }

  // Default to internal server error
  const response: ErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProduction
        ? 'An unexpected error occurred'
        : error.message || 'An unexpected error occurred',
    },
  };

  // Include stack trace in development
  if (!config.isProduction) {
    (response.error as Record<string, unknown>).stack = error.stack;
  }

  reply.status(500).send(response);
}

export function notFoundHandler(
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const response: ErrorResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
    },
  };

  reply.status(404).send(response);
}
