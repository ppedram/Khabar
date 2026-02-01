import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import { Incident, Comment } from '@prisma/client';

interface IncidentWithCategory extends Incident {
  category?: {
    name: string;
    icon: string | null;
    color: string | null;
  };
}

@Injectable()
export class WebsocketService {
  private readonly logger = new Logger(WebsocketService.name);
  private server: Server;

  setServer(server: Server) {
    this.server = server;
  }

  /**
   * Generate area room name based on geographic coordinates
   * Uses a grid-based approach for efficient room management
   */
  getAreaRoomName(latitude: number, longitude: number, radiusKm: number): string {
    // Create grid cells based on radius
    // For a 5km radius, use ~0.05 degree cells
    const cellSize = radiusKm / 100; // Approximately
    const latCell = Math.floor(latitude / cellSize);
    const lngCell = Math.floor(longitude / cellSize);

    return `area:${latCell}:${lngCell}:${radiusKm}`;
  }

  /**
   * Broadcast a new incident to users in the affected area
   */
  broadcastNewIncident(incident: IncidentWithCategory) {
    if (!this.server) return;

    const areaRoom = this.getAreaRoomName(
      Number(incident.latitude),
      Number(incident.longitude),
      50, // Broadcast to wider area
    );

    this.server.to(areaRoom).emit('incident:new', {
      id: incident.id,
      title: incident.title,
      latitude: Number(incident.latitude),
      longitude: Number(incident.longitude),
      severity: incident.severity,
      status: incident.status,
      category: incident.category,
      createdAt: incident.createdAt,
    });

    this.logger.debug(`Broadcast new incident ${incident.id} to area ${areaRoom}`);
  }

  /**
   * Broadcast incident update to subscribers
   */
  broadcastIncidentUpdate(incident: Incident, updateType: string) {
    if (!this.server) return;

    const room = `incident:${incident.id}`;

    this.server.to(room).emit('incident:update', {
      id: incident.id,
      updateType,
      status: incident.status,
      upvotesCount: incident.upvotesCount,
      downvotesCount: incident.downvotesCount,
      verifyCount: incident.verifyCount,
      commentsCount: incident.commentsCount,
      updatedAt: incident.updatedAt,
    });

    // Also broadcast to area for map updates
    const areaRoom = this.getAreaRoomName(
      Number(incident.latitude),
      Number(incident.longitude),
      50,
    );

    this.server.to(areaRoom).emit('incident:updated', {
      id: incident.id,
      status: incident.status,
      severity: incident.severity,
    });

    this.logger.debug(`Broadcast update for incident ${incident.id}`);
  }

  /**
   * Broadcast new comment on an incident
   */
  broadcastNewComment(incidentId: string, comment: Partial<Comment> & { user?: { displayName?: string | null } }) {
    if (!this.server) return;

    const room = `incident:${incidentId}`;

    this.server.to(room).emit('comment:new', {
      incidentId,
      comment: {
        id: comment.id,
        content: comment.content,
        user: comment.user ? {
          displayName: comment.user.displayName,
        } : null,
        createdAt: comment.createdAt,
      },
    });

    this.logger.debug(`Broadcast new comment on incident ${incidentId}`);
  }

  /**
   * Broadcast incident verification
   */
  broadcastIncidentVerified(incident: Incident) {
    if (!this.server) return;

    const room = `incident:${incident.id}`;
    const areaRoom = this.getAreaRoomName(
      Number(incident.latitude),
      Number(incident.longitude),
      50,
    );

    const payload = {
      id: incident.id,
      title: incident.title,
      verifiedAt: incident.verifiedAt,
    };

    this.server.to(room).emit('incident:verified', payload);
    this.server.to(areaRoom).emit('incident:verified', payload);

    this.logger.debug(`Broadcast verification for incident ${incident.id}`);
  }

  /**
   * Broadcast incident resolution
   */
  broadcastIncidentResolved(incident: Incident) {
    if (!this.server) return;

    const room = `incident:${incident.id}`;
    const areaRoom = this.getAreaRoomName(
      Number(incident.latitude),
      Number(incident.longitude),
      50,
    );

    const payload = {
      id: incident.id,
      title: incident.title,
      resolvedAt: incident.resolvedAt,
      resolutionNote: incident.resolutionNote,
    };

    this.server.to(room).emit('incident:resolved', payload);
    this.server.to(areaRoom).emit('incident:resolved', payload);

    this.logger.debug(`Broadcast resolution for incident ${incident.id}`);
  }

  /**
   * Send a private message to a specific user
   */
  sendToUser(userId: string, event: string, data: unknown) {
    if (!this.server) return;

    const userRoom = `user:${userId}`;
    this.server.to(userRoom).emit(event, data);
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    if (!this.server) return 0;
    return this.server.sockets.sockets.size;
  }

  /**
   * Get clients in a specific room
   */
  async getClientsInRoom(room: string): Promise<number> {
    if (!this.server) return 0;
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.length;
  }
}
