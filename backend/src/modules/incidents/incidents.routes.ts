import type { FastifyInstance } from 'fastify';
import { IncidentController } from './incidents.controller.js';
import { IncidentService } from './incidents.service.js';
import { reportRateLimitConfig } from '../../middleware/rate-limit.middleware.js';

export async function incidentRoutes(fastify: FastifyInstance): Promise<void> {
  const incidentService = new IncidentService();
  const controller = new IncidentController(incidentService);

  // List incidents
  fastify.get(
    '/',
    {
      onRequest: [fastify.authenticateOptional],
      schema: {
        description: 'List incidents with filters and pagination',
        tags: ['Incidents'],
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'number', default: 1 },
            limit: { type: 'number', default: 20 },
            category: { type: 'string', format: 'uuid' },
            status: { type: 'string', enum: ['PENDING', 'VERIFIED', 'RESOLVED', 'REJECTED', 'EXPIRED'] },
            severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
            sortBy: { type: 'string', enum: ['createdAt', 'severity', 'upvotesCount'] },
            sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
      },
    },
    controller.listIncidents.bind(controller)
  );

  // Create incident
  fastify.post(
    '/',
    {
      onRequest: [fastify.authenticate],
      config: {
        rateLimit: reportRateLimitConfig,
      },
      schema: {
        description: 'Create a new incident report',
        tags: ['Incidents'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          required: ['categoryId', 'title', 'latitude', 'longitude'],
          properties: {
            categoryId: { type: 'string', format: 'uuid' },
            title: { type: 'string', minLength: 5, maxLength: 200 },
            description: { type: 'string', maxLength: 2000 },
            latitude: { type: 'number', minimum: -90, maximum: 90 },
            longitude: { type: 'number', minimum: -180, maximum: 180 },
            address: { type: 'string' },
            city: { type: 'string' },
            neighborhood: { type: 'string' },
            severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
            isAnonymous: { type: 'boolean' },
          },
        },
      },
    },
    controller.createIncident.bind(controller)
  );

  // Get nearby incidents
  fastify.get(
    '/nearby',
    {
      onRequest: [fastify.authenticateOptional],
      schema: {
        description: 'Get incidents near a location',
        tags: ['Incidents'],
        querystring: {
          type: 'object',
          required: ['latitude', 'longitude'],
          properties: {
            latitude: { type: 'number' },
            longitude: { type: 'number' },
            radius: { type: 'number', default: 5, description: 'Radius in kilometers' },
            category: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            severity: { type: 'string' },
            since: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    controller.getNearbyIncidents.bind(controller)
  );

  // Get incidents for map
  fastify.get(
    '/map',
    {
      onRequest: [fastify.authenticateOptional],
      schema: {
        description: 'Get incidents within map bounds',
        tags: ['Incidents'],
        querystring: {
          type: 'object',
          required: ['minLat', 'maxLat', 'minLng', 'maxLng'],
          properties: {
            minLat: { type: 'number' },
            maxLat: { type: 'number' },
            minLng: { type: 'number' },
            maxLng: { type: 'number' },
            categories: { type: 'string', description: 'Comma-separated category IDs' },
            status: { type: 'string' },
          },
        },
      },
    },
    controller.getMapIncidents.bind(controller)
  );

  // Get single incident
  fastify.get(
    '/:id',
    {
      onRequest: [fastify.authenticateOptional],
      schema: {
        description: 'Get incident details',
        tags: ['Incidents'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    controller.getIncident.bind(controller)
  );

  // Update incident
  fastify.patch(
    '/:id',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Update an incident',
        tags: ['Incidents'],
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
    controller.updateIncident.bind(controller)
  );

  // Delete incident
  fastify.delete(
    '/:id',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Delete an incident',
        tags: ['Incidents'],
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
    controller.deleteIncident.bind(controller)
  );

  // Upvote incident
  fastify.post(
    '/:id/upvote',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Upvote an incident (toggle)',
        tags: ['Incidents'],
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
    controller.upvoteIncident.bind(controller)
  );

  // Verify incident
  fastify.post(
    '/:id/verify',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Verify an incident (confirm it is real)',
        tags: ['Incidents'],
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
    controller.verifyIncident.bind(controller)
  );

  // Add incident update
  fastify.post(
    '/:id/updates',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Add an update to an incident',
        tags: ['Incidents'],
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
    controller.addUpdate.bind(controller)
  );

  // Get incident updates
  fastify.get(
    '/:id/updates',
    {
      schema: {
        description: 'Get incident updates',
        tags: ['Incidents'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
          required: ['id'],
        },
      },
    },
    controller.getUpdates.bind(controller)
  );
}
