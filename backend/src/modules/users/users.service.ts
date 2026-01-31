import { prisma } from '../../config/database.js';
import { NotFoundError, ConflictError } from '../../utils/errors.js';
import type {
  UpdateProfileInput,
  UpdateSettingsInput,
  RegisterDeviceInput,
  ReportUserInput,
} from './users.schema.js';
import type { PaginationParams } from '../../utils/pagination.js';
import { getSkip, paginate } from '../../utils/pagination.js';

export class UserService {
  /**
   * Get current user profile
   */
  async getCurrentUser(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        settings: true,
        _count: {
          select: {
            incidents: true,
            comments: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return this.sanitizeUser(user);
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, data: UpdateProfileInput) {
    // Check username uniqueness if provided
    if (data.username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username: data.username,
          id: { not: userId },
        },
      });

      if (existingUser) {
        throw new ConflictError('Username already taken');
      }
    }

    // Check email uniqueness if provided
    if (data.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: data.email,
          id: { not: userId },
        },
      });

      if (existingUser) {
        throw new ConflictError('Email already in use');
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        username: data.username,
        displayName: data.displayName,
        email: data.email,
      },
      include: { settings: true },
    });

    return this.sanitizeUser(user);
  }

  /**
   * Update user avatar
   */
  async updateAvatar(userId: string, avatarUrl: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
    });

    return { avatarUrl: user.avatarUrl };
  }

  /**
   * Get user settings
   */
  async getSettings(userId: string) {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      // Create default settings if not exists
      return prisma.userSettings.create({
        data: {
          userId,
          notificationRadiusKm: 5.0,
          notificationsEnabled: true,
        },
      });
    }

    return settings;
  }

  /**
   * Update user settings
   */
  async updateSettings(userId: string, data: UpdateSettingsInput) {
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: {
        notificationRadiusKm: data.notificationRadiusKm,
        notificationsEnabled: data.notificationsEnabled,
        notifyCategories: data.notifyCategories,
        quietHoursStart: data.quietHoursStart,
        quietHoursEnd: data.quietHoursEnd,
        homeLocationLat: data.homeLocationLat,
        homeLocationLng: data.homeLocationLng,
      },
      create: {
        userId,
        notificationRadiusKm: data.notificationRadiusKm ?? 5.0,
        notificationsEnabled: data.notificationsEnabled ?? true,
        notifyCategories: data.notifyCategories ?? [],
        quietHoursStart: data.quietHoursStart,
        quietHoursEnd: data.quietHoursEnd,
        homeLocationLat: data.homeLocationLat,
        homeLocationLng: data.homeLocationLng,
      },
    });

    return settings;
  }

  /**
   * Get user's incidents
   */
  async getUserIncidents(userId: string, pagination: PaginationParams) {
    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where: { userId },
        include: {
          category: true,
          _count: {
            select: {
              comments: true,
              media: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: getSkip(pagination.page, pagination.limit),
        take: pagination.limit,
      }),
      prisma.incident.count({ where: { userId } }),
    ]);

    return paginate(incidents, total, pagination);
  }

  /**
   * Register device for push notifications
   */
  async registerDevice(userId: string, data: RegisterDeviceInput) {
    const device = await prisma.userDevice.upsert({
      where: {
        userId_deviceToken: {
          userId,
          deviceToken: data.deviceToken,
        },
      },
      update: {
        deviceType: data.deviceType,
        deviceName: data.deviceName,
        isActive: true,
        lastUsedAt: new Date(),
      },
      create: {
        userId,
        deviceToken: data.deviceToken,
        deviceType: data.deviceType,
        deviceName: data.deviceName,
        isActive: true,
      },
    });

    return device;
  }

  /**
   * Unregister device
   */
  async unregisterDevice(userId: string, deviceId: string) {
    await prisma.userDevice.updateMany({
      where: {
        id: deviceId,
        userId,
      },
      data: { isActive: false },
    });
  }

  /**
   * Get public user profile
   */
  async getPublicProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        reputationScore: true,
        reportsCount: true,
        verifiedReportsCount: true,
        createdAt: true,
        _count: {
          select: {
            incidents: {
              where: { status: { in: ['VERIFIED', 'RESOLVED'] } },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }

  /**
   * Report a user
   */
  async reportUser(
    reporterId: string,
    reportedUserId: string,
    data: ReportUserInput
  ) {
    if (reporterId === reportedUserId) {
      throw new ConflictError('You cannot report yourself');
    }

    // Check if user exists
    const reportedUser = await prisma.user.findUnique({
      where: { id: reportedUserId },
    });

    if (!reportedUser) {
      throw new NotFoundError('User not found');
    }

    // Create report
    const report = await prisma.userReport.create({
      data: {
        reporterId,
        reportedUserId,
        reason: data.reason,
        description: data.description,
      },
    });

    // Add to moderation queue
    await prisma.moderationQueue.create({
      data: {
        contentType: 'USER',
        contentId: reportedUserId,
        reason: 'REPORTED',
        reportedById: reporterId,
        reportReason: data.description,
        priority: 2,
      },
    });

    return report;
  }

  /**
   * Sanitize user for response
   */
  private sanitizeUser(user: {
    id: string;
    phoneNumber: string;
    email: string | null;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    role: string;
    reputationScore: number;
    reportsCount: number;
    verifiedReportsCount: number;
    createdAt: Date;
    settings?: object | null;
    _count?: {
      incidents?: number;
      comments?: number;
    };
  }) {
    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      reputationScore: user.reputationScore,
      reportsCount: user.reportsCount,
      verifiedReportsCount: user.verifiedReportsCount,
      createdAt: user.createdAt,
      settings: user.settings,
      stats: user._count,
    };
  }
}
