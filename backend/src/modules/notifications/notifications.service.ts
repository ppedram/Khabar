import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApnsService, APNsCategory, APNsSound } from './apns.service';
import { Incident, NotificationType } from '@prisma/client';

interface NotificationPayload {
  type: NotificationType;
  incidentId?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apnsService: ApnsService,
  ) {}

  /**
   * Send notification for a nearby incident
   */
  async sendNearbyIncidentNotification(
    userId: string,
    incident: Incident,
    apnsToken?: string,
  ): Promise<void> {
    const notification = await this.createNotificationRecord({
      userId,
      incidentId: incident.id,
      type: NotificationType.NEARBY_INCIDENT,
      title: 'Nearby Incident Reported',
      body: incident.title,
      data: {
        incidentId: incident.id,
        latitude: Number(incident.latitude),
        longitude: Number(incident.longitude),
        severity: incident.severity,
      },
    });

    if (apnsToken) {
      await this.sendApnsNotification(notification.id, apnsToken, {
        title: 'Nearby Incident Reported',
        body: incident.title,
        category: APNsCategory.NEARBY_INCIDENT,
        sound: this.getSoundForSeverity(incident.severity),
        data: {
          notificationId: notification.id,
          incidentId: incident.id,
          type: 'NEARBY_INCIDENT',
        },
        threadId: `incident-${incident.id}`,
      });
    }
  }

  /**
   * Send notification when an incident is verified
   */
  async sendIncidentVerifiedNotification(
    incident: Incident,
  ): Promise<void> {
    // Notify the incident creator
    const device = await this.prisma.userDevice.findFirst({
      where: {
        userId: incident.userId,
        isActive: true,
        deviceType: 'IOS',
        apnsToken: { not: null },
      },
    });

    const notification = await this.createNotificationRecord({
      userId: incident.userId,
      incidentId: incident.id,
      type: NotificationType.VERIFICATION,
      title: 'Your Incident Was Verified',
      body: `"${incident.title}" has been verified by the community`,
      data: { incidentId: incident.id },
    });

    if (device?.apnsToken) {
      await this.sendApnsNotification(notification.id, device.apnsToken, {
        title: 'Your Incident Was Verified',
        body: `"${incident.title}" has been verified by the community`,
        category: APNsCategory.INCIDENT_VERIFIED,
        sound: APNsSound.DEFAULT,
        data: {
          notificationId: notification.id,
          incidentId: incident.id,
          type: 'INCIDENT_VERIFIED',
        },
      });
    }
  }

  /**
   * Send notification for a comment
   */
  async sendCommentNotification(
    userId: string,
    incidentId: string,
    commentPreview: string,
    commenterName: string,
  ): Promise<void> {
    const device = await this.prisma.userDevice.findFirst({
      where: {
        userId,
        isActive: true,
        deviceType: 'IOS',
        apnsToken: { not: null },
      },
    });

    const notification = await this.createNotificationRecord({
      userId,
      incidentId,
      type: NotificationType.COMMENT,
      title: `New comment from ${commenterName}`,
      body: commentPreview,
      data: { incidentId },
    });

    if (device?.apnsToken) {
      await this.sendApnsNotification(notification.id, device.apnsToken, {
        title: `New comment from ${commenterName}`,
        body: commentPreview,
        category: APNsCategory.COMMENT,
        sound: APNsSound.DEFAULT,
        data: {
          notificationId: notification.id,
          incidentId,
          type: 'COMMENT',
        },
        threadId: `incident-${incidentId}`,
      });
    }
  }

  /**
   * Send a system notification
   */
  async sendSystemNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    const device = await this.prisma.userDevice.findFirst({
      where: {
        userId,
        isActive: true,
        deviceType: 'IOS',
        apnsToken: { not: null },
      },
    });

    const notification = await this.createNotificationRecord({
      userId,
      type: NotificationType.SYSTEM,
      title,
      body,
      data,
    });

    if (device?.apnsToken) {
      await this.sendApnsNotification(notification.id, device.apnsToken, {
        title,
        body,
        category: APNsCategory.SYSTEM,
        sound: APNsSound.DEFAULT,
        data: {
          notificationId: notification.id,
          type: 'SYSTEM',
          ...data,
        },
      });
    }
  }

  /**
   * Get user's notifications
   */
  async getNotifications(
    userId: string,
    limit = 20,
    offset = 0,
    unreadOnly = false,
  ) {
    const where = {
      userId,
      ...(unreadOnly ? { isRead: false } : {}),
    };

    const [notifications, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          incident: {
            select: {
              id: true,
              title: true,
              status: true,
              severity: true,
              latitude: true,
              longitude: true,
            },
          },
        },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      notifications,
      total,
      unreadCount,
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<{ count: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return { count: result.count };
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notification not found');
    }

    await this.prisma.notification.delete({
      where: { id: notificationId },
    });
  }

  /**
   * Create notification record in database
   */
  private async createNotificationRecord(
    payload: NotificationPayload & { userId: string },
  ) {
    return this.prisma.notification.create({
      data: {
        userId: payload.userId,
        incidentId: payload.incidentId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        data: payload.data,
        apnsCategory: this.getApnsCategory(payload.type),
      },
    });
  }

  /**
   * Send APNs notification and update record
   */
  private async sendApnsNotification(
    notificationId: string,
    apnsToken: string,
    options: {
      title: string;
      body: string;
      category: APNsCategory;
      sound: APNsSound | string;
      data: Record<string, unknown>;
      threadId?: string;
    },
  ): Promise<void> {
    const result = await this.apnsService.send(apnsToken, {
      title: options.title,
      body: options.body,
      category: options.category,
      sound: options.sound,
      data: options.data,
      threadId: options.threadId,
      mutableContent: true,
    });

    // Update notification record with send status
    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        isSent: result.success,
        sentAt: result.success ? new Date() : undefined,
        apnsId: result.apnsId,
        failReason: result.error,
      },
    });

    // Handle invalid tokens
    if (result.error === 'INVALID_TOKEN') {
      await this.prisma.userDevice.updateMany({
        where: { apnsToken },
        data: { isActive: false, apnsToken: null },
      });
      this.logger.warn(`Deactivated invalid APNs token: ${apnsToken.substring(0, 10)}...`);
    }
  }

  /**
   * Get APNs category for notification type
   */
  private getApnsCategory(type: NotificationType): string {
    const categories: Record<NotificationType, APNsCategory> = {
      [NotificationType.NEARBY_INCIDENT]: APNsCategory.NEARBY_INCIDENT,
      [NotificationType.UPDATE]: APNsCategory.INCIDENT_UPDATE,
      [NotificationType.VERIFICATION]: APNsCategory.INCIDENT_VERIFIED,
      [NotificationType.COMMENT]: APNsCategory.COMMENT,
      [NotificationType.SYSTEM]: APNsCategory.SYSTEM,
    };
    return categories[type];
  }

  /**
   * Get sound based on incident severity
   */
  private getSoundForSeverity(severity: string): APNsSound {
    switch (severity) {
      case 'CRITICAL':
        return APNsSound.CRITICAL;
      case 'HIGH':
        return APNsSound.ALERT;
      default:
        return APNsSound.DEFAULT;
    }
  }
}
