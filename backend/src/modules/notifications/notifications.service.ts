import { prisma } from '../../config/database.js';
import { getSkip, paginate, type PaginationParams } from '../../utils/pagination.js';
import { NotFoundError } from '../../utils/errors.js';

export class NotificationService {
  /**
   * Get user notifications
   */
  async getNotifications(userId: string, pagination: PaginationParams) {
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        include: {
          incident: {
            select: {
              id: true,
              title: true,
              latitude: true,
              longitude: true,
              category: {
                select: {
                  name: true,
                  icon: true,
                  color: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: getSkip(pagination.page, pagination.limit),
        take: pagination.limit,
      }),
      prisma.notification.count({ where: { userId } }),
    ]);

    return paginate(notifications, total, pagination);
  }

  /**
   * Get unread notification count
   */
  async getUnreadCount(userId: string) {
    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { unreadCount: count };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string) {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return { message: 'All notifications marked as read' };
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string, userId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundError('Notification not found');
    }

    await prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  /**
   * Create a notification (internal use)
   */
  async createNotification(data: {
    userId: string;
    incidentId?: string;
    type: 'NEARBY_INCIDENT' | 'COMMENT' | 'UPDATE' | 'VERIFICATION' | 'SYSTEM';
    title: string;
    body?: string;
    data?: Record<string, unknown>;
  }) {
    return prisma.notification.create({
      data: {
        userId: data.userId,
        incidentId: data.incidentId,
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data ?? {},
      },
    });
  }

  /**
   * Create notifications for users near an incident
   */
  async notifyNearbyUsers(
    incidentId: string,
    latitude: number,
    longitude: number,
    radiusKm: number,
    excludeUserId?: string
  ) {
    // Find users with home location near the incident
    // This is a simplified version - in production, you'd use PostGIS
    const users = await prisma.userSettings.findMany({
      where: {
        notificationsEnabled: true,
        homeLocationLat: { not: null },
        homeLocationLng: { not: null },
        ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            isBanned: true,
          },
        },
      },
    });

    const notifications = [];

    for (const settings of users) {
      if (settings.user.isBanned) continue;
      if (!settings.homeLocationLat || !settings.homeLocationLng) continue;

      // Calculate distance
      const distance = this.calculateDistance(
        latitude,
        longitude,
        Number(settings.homeLocationLat),
        Number(settings.homeLocationLng)
      );

      // Check if within user's notification radius
      const userRadius = Number(settings.notificationRadiusKm);
      if (distance <= userRadius) {
        notifications.push({
          userId: settings.userId,
          incidentId,
        });
      }
    }

    // Create notifications in batch
    if (notifications.length > 0) {
      const incident = await prisma.incident.findUnique({
        where: { id: incidentId },
        include: { category: true },
      });

      if (incident) {
        await prisma.notification.createMany({
          data: notifications.map((n) => ({
            userId: n.userId,
            incidentId: n.incidentId,
            type: 'NEARBY_INCIDENT' as const,
            title: `New ${incident.category.name} incident nearby`,
            body: incident.title,
            data: {
              incidentId,
              categorySlug: incident.category.slug,
            },
          })),
        });
      }
    }

    return { notifiedCount: notifications.length };
  }

  private calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
