import type { FastifyReply, FastifyRequest } from 'fastify';
import { UserService } from './users.service.js';
import {
  updateProfileSchema,
  updateSettingsSchema,
  registerDeviceSchema,
  reportUserSchema,
} from './users.schema.js';
import { paginationSchema } from '../../utils/pagination.js';

export class UserController {
  constructor(private readonly userService: UserService) {}

  async getCurrentUser(request: FastifyRequest, reply: FastifyReply) {
    const user = await this.userService.getCurrentUser(request.user!.sub);
    reply.send({ success: true, data: user });
  }

  async updateProfile(
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply
  ) {
    const data = updateProfileSchema.parse(request.body);
    const user = await this.userService.updateProfile(request.user!.sub, data);
    reply.send({ success: true, data: user });
  }

  async getSettings(request: FastifyRequest, reply: FastifyReply) {
    const settings = await this.userService.getSettings(request.user!.sub);
    reply.send({ success: true, data: settings });
  }

  async updateSettings(
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply
  ) {
    const data = updateSettingsSchema.parse(request.body);
    const settings = await this.userService.updateSettings(request.user!.sub, data);
    reply.send({ success: true, data: settings });
  }

  async getUserIncidents(
    request: FastifyRequest<{ Querystring: unknown }>,
    reply: FastifyReply
  ) {
    const pagination = paginationSchema.parse(request.query);
    const incidents = await this.userService.getUserIncidents(
      request.user!.sub,
      pagination
    );
    reply.send({ success: true, ...incidents });
  }

  async registerDevice(
    request: FastifyRequest<{ Body: unknown }>,
    reply: FastifyReply
  ) {
    const data = registerDeviceSchema.parse(request.body);
    const device = await this.userService.registerDevice(request.user!.sub, data);
    reply.send({ success: true, data: device });
  }

  async unregisterDevice(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    await this.userService.unregisterDevice(request.user!.sub, request.params.id);
    reply.send({ success: true, data: { message: 'Device unregistered' } });
  }

  async getPublicProfile(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) {
    const user = await this.userService.getPublicProfile(request.params.id);
    reply.send({ success: true, data: user });
  }

  async reportUser(
    request: FastifyRequest<{ Params: { id: string }; Body: unknown }>,
    reply: FastifyReply
  ) {
    const data = reportUserSchema.parse(request.body);
    const report = await this.userService.reportUser(
      request.user!.sub,
      request.params.id,
      data
    );
    reply.send({ success: true, data: report });
  }
}
