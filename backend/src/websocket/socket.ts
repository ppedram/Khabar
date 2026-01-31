import { Server as SocketIOServer, Socket } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { pubsub, getRedis } from '../config/redis.js';

interface AreaSubscription {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface SocketData {
  userId?: string;
  subscribedArea?: AreaSubscription;
  subscribedIncidents: Set<string>;
}

let io: SocketIOServer | null = null;

export function setupWebSocket(fastify: FastifyInstance): SocketIOServer {
  io = new SocketIOServer(fastify.server, {
    cors: {
      origin: config.corsOrigins,
      credentials: true,
    },
    path: '/socket.io',
    transports: ['websocket', 'polling'],
  });

  // Redis adapter for scaling (optional - for horizontal scaling)
  // In production, you'd use @socket.io/redis-adapter

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token as string | undefined;

      if (token) {
        // Verify JWT token
        const decoded = fastify.jwt.verify(token) as { sub: string };
        (socket.data as SocketData).userId = decoded.sub;
      }

      (socket.data as SocketData).subscribedIncidents = new Set();
      next();
    } catch (error) {
      // Allow connection without auth, but limit functionality
      (socket.data as SocketData).subscribedIncidents = new Set();
      next();
    }
  });

  io.on('connection', (socket: Socket) => {
    const socketData = socket.data as SocketData;
    logger.info({ socketId: socket.id, userId: socketData.userId }, 'Socket connected');

    // Join user-specific room if authenticated
    if (socketData.userId) {
      socket.join(`user:${socketData.userId}`);
    }

    // Subscribe to geographic area for new incidents
    socket.on('join_area', (bounds: AreaSubscription) => {
      if (!isValidBounds(bounds)) {
        socket.emit('error', { message: 'Invalid bounds' });
        return;
      }

      socketData.subscribedArea = bounds;
      socket.join('area_subscribers');

      logger.debug({ socketId: socket.id, bounds }, 'Socket subscribed to area');
    });

    // Unsubscribe from area
    socket.on('leave_area', () => {
      socketData.subscribedArea = undefined;
      socket.leave('area_subscribers');

      logger.debug({ socketId: socket.id }, 'Socket unsubscribed from area');
    });

    // Subscribe to specific incident updates
    socket.on('join_incident', (incidentId: string) => {
      if (!isValidUUID(incidentId)) {
        socket.emit('error', { message: 'Invalid incident ID' });
        return;
      }

      socketData.subscribedIncidents.add(incidentId);
      socket.join(`incident:${incidentId}`);

      logger.debug({ socketId: socket.id, incidentId }, 'Socket subscribed to incident');
    });

    // Unsubscribe from incident
    socket.on('leave_incident', (incidentId: string) => {
      socketData.subscribedIncidents.delete(incidentId);
      socket.leave(`incident:${incidentId}`);

      logger.debug({ socketId: socket.id, incidentId }, 'Socket unsubscribed from incident');
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'Socket disconnected');
    });
  });

  // Subscribe to Redis pub/sub for cross-server events
  setupRedisPubSub();

  logger.info('WebSocket server initialized');

  return io;
}

function setupRedisPubSub() {
  const subscriber = pubsub.createSubscriber();

  subscriber.subscribe('incidents', 'notifications');

  subscriber.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message);

      if (channel === 'incidents') {
        handleIncidentEvent(data);
      } else if (channel === 'notifications') {
        handleNotificationEvent(data);
      }
    } catch (error) {
      logger.error({ error, channel, message }, 'Failed to process pub/sub message');
    }
  });
}

function handleIncidentEvent(data: {
  type: 'new' | 'updated' | 'resolved';
  incident: {
    id: string;
    latitude: number;
    longitude: number;
    [key: string]: unknown;
  };
}) {
  if (!io) return;

  const { type, incident } = data;

  // Broadcast to incident room
  io.to(`incident:${incident.id}`).emit(`incident_${type}`, incident);

  // For new incidents, broadcast to area subscribers
  if (type === 'new') {
    const sockets = io.sockets.sockets;

    for (const [, socket] of sockets) {
      const socketData = socket.data as SocketData;

      if (socketData.subscribedArea) {
        const { minLat, maxLat, minLng, maxLng } = socketData.subscribedArea;

        if (
          incident.latitude >= minLat &&
          incident.latitude <= maxLat &&
          incident.longitude >= minLng &&
          incident.longitude <= maxLng
        ) {
          socket.emit('new_incident', incident);
        }
      }
    }
  }
}

function handleNotificationEvent(data: {
  userId: string;
  notification: object;
}) {
  if (!io) return;

  io.to(`user:${data.userId}`).emit('notification', data.notification);
}

// Utility functions
function isValidBounds(bounds: unknown): bounds is AreaSubscription {
  if (typeof bounds !== 'object' || bounds === null) return false;

  const b = bounds as Record<string, unknown>;

  return (
    typeof b['minLat'] === 'number' &&
    typeof b['maxLat'] === 'number' &&
    typeof b['minLng'] === 'number' &&
    typeof b['maxLng'] === 'number' &&
    b['minLat'] >= -90 &&
    b['maxLat'] <= 90 &&
    b['minLng'] >= -180 &&
    b['maxLng'] <= 180
  );
}

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

// Export functions for emitting events from other parts of the app
export function emitNewIncident(incident: {
  id: string;
  latitude: number;
  longitude: number;
  [key: string]: unknown;
}) {
  pubsub.publish('incidents', { type: 'new', incident });
}

export function emitIncidentUpdate(incident: {
  id: string;
  [key: string]: unknown;
}) {
  pubsub.publish('incidents', { type: 'updated', incident });
}

export function emitIncidentResolved(incident: {
  id: string;
  [key: string]: unknown;
}) {
  pubsub.publish('incidents', { type: 'resolved', incident });
}

export function emitNotification(userId: string, notification: object) {
  pubsub.publish('notifications', { userId, notification });
}

export function getIO(): SocketIOServer | null {
  return io;
}
