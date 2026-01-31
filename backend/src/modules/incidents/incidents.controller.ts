import type { FastifyReply, FastifyRequest } from 'fastify';
import { IncidentService } from './incidents.service.js';
import {
  createIncidentSchema,
  updateIncidentSchema,
  nearbyIncidentsSchema,
  mapIncidentsSchema,
  listIncidentsSchema,
  addUpdateSchema,
} from './incidents.schema.js';
import { paginationSchema } from '../../utils/pagination.js';

export class IncidentController {
  constructor(private readonly incidentService: IncidentService) {}

  async createIncident(
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply
  ) {
    const data = createIncidentSchema.parse(request.body);
    const incident = await this.incidentService.createIncident(
      request.user!.sub,
      data
    );
    reply.status(201).send({ success: true, data: incident });
  }

  async getNearbyIncidents(
    request: FastifyRequest<{ Querystring: unknown }>,
    reply: FastifyReply
  ) {
    const query = nearbyIncidentsSchema.parse(request.query);
    const incidents = await this.incidentService.getNearbyIncidents(query);
    reply.send({ success: true, data: incidents });
  }

  async getMapIncidents(
    request: FastifyRequest<{ Querystring: unknown }>,
    reply: FastifyReply
  ) {
    const query = mapIncidentsSchema.parse(request.query);
    const incidents = await this.incidentService.getMapIncidents(query);
    reply.send({ success: true, data: incidents });
  }

  async listIncidents(
    request: FastifyRequest<{ Querystring: unknown }>,
    reply: FastifyReply
  ) {
    const query = listIncidentsSchema.parse(request.query);
    const result = await this.incidentService.listIncidents(query);
    reply.send({ success: true, ...result });
  }

  async getIncident(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const incident = await this.incidentService.getIncident(
      request.params.id,
      request.user?.sub
    );
    reply.send({ success: true, data: incident });
  }

  async updateIncident(
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply
  ) {
    const data = updateIncidentSchema.parse(request.body);
    const isAdmin = request.user!.role === 'ADMIN';
    const incident = await this.incidentService.updateIncident(
      request.params.id,
      request.user!.sub,
      data,
      isAdmin
    );
    reply.send({ success: true, data: incident });
  }

  async deleteIncident(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const isAdmin = request.user!.role === 'ADMIN';
    await this.incidentService.deleteIncident(
      request.params.id,
      request.user!.sub,
      isAdmin
    );
    reply.send({ success: true, data: { message: 'Incident deleted' } });
  }

  async upvoteIncident(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const result = await this.incidentService.upvoteIncident(
      request.params.id,
      request.user!.sub
    );
    reply.send({ success: true, data: result });
  }

  async verifyIncident(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const result = await this.incidentService.verifyIncident(
      request.params.id,
      request.user!.sub
    );
    reply.send({ success: true, data: result });
  }

  async addUpdate(
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply
  ) {
    const data = addUpdateSchema.parse(request.body);
    const isAdmin = request.user!.role === 'ADMIN';
    const update = await this.incidentService.addUpdate(
      request.params.id,
      request.user!.sub,
      data,
      isAdmin
    );
    reply.status(201).send({ success: true, data: update });
  }

  async getUpdates(
    request: FastifyRequest<{ Params: { id: string }; Querystring: unknown }>,
    reply: FastifyReply
  ) {
    const pagination = paginationSchema.parse(request.query);
    const result = await this.incidentService.getUpdates(
      request.params.id,
      pagination
    );
    reply.send({ success: true, ...result });
  }
}
