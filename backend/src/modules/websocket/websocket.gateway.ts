import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WebsocketService } from './websocket.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  currentArea?: string;
}

interface SubscribeAreaPayload {
  latitude: number;
  longitude: number;
  radiusKm?: number;
}

interface SubscribeIncidentPayload {
  incidentId: string;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/events',
  transports: ['websocket', 'polling'],
})
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebsocketGateway.name);
  private connectedClients = new Map<string, AuthenticatedSocket>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly websocketService: WebsocketService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
    this.websocketService.setServer(this.server);
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract and verify JWT from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (token) {
        const payload = this.jwtService.verify(token, {
          secret: this.configService.get<string>('jwt.secret'),
        });
        client.userId = payload.sub;
        this.connectedClients.set(client.id, client);
        this.logger.log(`Client connected: ${client.id} (user: ${client.userId})`);
      } else {
        // Allow anonymous connections for public incident viewing
        this.connectedClients.set(client.id, client);
        this.logger.log(`Anonymous client connected: ${client.id}`);
      }

      // Send connection acknowledgment
      client.emit('connected', {
        clientId: client.id,
        authenticated: !!client.userId,
      });
    } catch (error) {
      this.logger.warn(`Invalid token for client ${client.id}`);
      client.emit('auth_error', { message: 'Invalid authentication token' });
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Subscribe to incidents in a geographic area
   */
  @SubscribeMessage('subscribe:area')
  handleSubscribeArea(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SubscribeAreaPayload,
  ) {
    // Leave previous area room if any
    if (client.currentArea) {
      client.leave(client.currentArea);
    }

    // Create area room name based on grid cell
    const areaRoom = this.websocketService.getAreaRoomName(
      data.latitude,
      data.longitude,
      data.radiusKm || 5,
    );

    client.join(areaRoom);
    client.currentArea = areaRoom;

    this.logger.debug(`Client ${client.id} subscribed to area: ${areaRoom}`);

    client.emit('subscribed:area', {
      area: areaRoom,
      latitude: data.latitude,
      longitude: data.longitude,
      radiusKm: data.radiusKm || 5,
    });
  }

  /**
   * Unsubscribe from area updates
   */
  @SubscribeMessage('unsubscribe:area')
  handleUnsubscribeArea(@ConnectedSocket() client: AuthenticatedSocket) {
    if (client.currentArea) {
      client.leave(client.currentArea);
      const area = client.currentArea;
      client.currentArea = undefined;

      client.emit('unsubscribed:area', { area });
    }
  }

  /**
   * Subscribe to a specific incident for real-time updates
   */
  @SubscribeMessage('subscribe:incident')
  handleSubscribeIncident(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SubscribeIncidentPayload,
  ) {
    const room = `incident:${data.incidentId}`;
    client.join(room);

    this.logger.debug(`Client ${client.id} subscribed to incident: ${data.incidentId}`);

    client.emit('subscribed:incident', { incidentId: data.incidentId });
  }

  /**
   * Unsubscribe from a specific incident
   */
  @SubscribeMessage('unsubscribe:incident')
  handleUnsubscribeIncident(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: SubscribeIncidentPayload,
  ) {
    const room = `incident:${data.incidentId}`;
    client.leave(room);

    client.emit('unsubscribed:incident', { incidentId: data.incidentId });
  }

  /**
   * Update user's location (for tracking nearby incidents)
   */
  @SubscribeMessage('location:update')
  handleLocationUpdate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { latitude: number; longitude: number },
  ) {
    // Automatically subscribe to new area
    this.handleSubscribeArea(client, {
      latitude: data.latitude,
      longitude: data.longitude,
    });
  }

  /**
   * Ping for keeping connection alive
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    client.emit('pong', { timestamp: Date.now() });
  }
}
