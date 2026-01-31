import type { FastifyInstance } from 'fastify';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { otpRateLimitConfig, authRateLimitConfig } from '../../middleware/rate-limit.middleware.js';

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const authService = new AuthService(fastify);
  const controller = new AuthController(authService);

  // Request OTP
  fastify.post(
    '/request-otp',
    {
      config: {
        rateLimit: otpRateLimitConfig,
      },
      schema: {
        description: 'Request OTP for phone verification',
        tags: ['Auth'],
        body: {
          type: 'object',
          required: ['phoneNumber'],
          properties: {
            phoneNumber: {
              type: 'string',
              description: 'Phone number in E.164 format',
              example: '+1234567890',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    controller.requestOtp.bind(controller)
  );

  // Verify OTP
  fastify.post(
    '/verify-otp',
    {
      config: {
        rateLimit: authRateLimitConfig,
      },
      schema: {
        description: 'Verify OTP and get authentication tokens',
        tags: ['Auth'],
        body: {
          type: 'object',
          required: ['phoneNumber', 'code'],
          properties: {
            phoneNumber: {
              type: 'string',
              description: 'Phone number in E.164 format',
              example: '+1234567890',
            },
            code: {
              type: 'string',
              description: '6-digit verification code',
              example: '123456',
            },
            deviceToken: {
              type: 'string',
              description: 'FCM device token for push notifications',
            },
            deviceType: {
              type: 'string',
              enum: ['IOS', 'ANDROID', 'WEB'],
            },
            deviceName: {
              type: 'string',
              description: 'Human-readable device name',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accessToken: { type: 'string' },
                  refreshToken: { type: 'string' },
                  user: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      phoneNumber: { type: 'string' },
                      email: { type: 'string', nullable: true },
                      username: { type: 'string', nullable: true },
                      displayName: { type: 'string', nullable: true },
                      avatarUrl: { type: 'string', nullable: true },
                      role: { type: 'string' },
                      reputationScore: { type: 'number' },
                      createdAt: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    controller.verifyOtp.bind(controller)
  );

  // Refresh token
  fastify.post(
    '/refresh',
    {
      config: {
        rateLimit: authRateLimitConfig,
      },
      schema: {
        description: 'Refresh access token using refresh token',
        tags: ['Auth'],
        body: {
          type: 'object',
          required: ['refreshToken'],
          properties: {
            refreshToken: {
              type: 'string',
              description: 'Refresh token from previous authentication',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  accessToken: { type: 'string' },
                  refreshToken: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    controller.refresh.bind(controller)
  );

  // Logout (requires authentication)
  fastify.post(
    '/logout',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Logout and revoke refresh token',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            refreshToken: {
              type: 'string',
              description: 'Refresh token to revoke',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    controller.logout.bind(controller)
  );

  // Logout all devices (requires authentication)
  fastify.delete(
    '/logout-all',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Logout from all devices',
        tags: ['Auth'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    controller.logoutAll.bind(controller)
  );
}
