import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReputationService } from '../reputation/reputation.service';
import { UpdateProfileDto, UpdateSettingsDto } from './dto/users.dto';
import { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reputationService: ReputationService,
  ) {}

  /**
   * Get user profile by ID
   */
  async findById(id: string, includePrivate = false) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        username: true,
        avatarUrl: true,
        role: true,
        reputationScore: true,
        reportsCount: true,
        verifiedReportsCount: true,
        isVerifiedUser: true,
        createdAt: true,
        // Private fields
        ...(includePrivate && {
          email: true,
          appleEmail: true,
          phoneNumber: true,
          authProvider: true,
          lastActiveAt: true,
        }),
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Get current user's full profile
   */
  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
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
      throw new NotFoundException('User not found');
    }

    // Get reputation stats
    const reputationStats = await this.reputationService.getReputationStats(userId);

    // Remove sensitive fields
    const { appleRefreshToken, ...safeUser } = user;

    return {
      ...safeUser,
      reputationStats,
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // Check username uniqueness if being changed
    if (dto.username) {
      const existing = await this.prisma.user.findUnique({
        where: { username: dto.username },
      });
      if (existing && existing.id !== userId) {
        throw new ConflictException('Username is already taken');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        displayName: dto.displayName,
        username: dto.username,
        avatarUrl: dto.avatarUrl,
      },
      select: {
        id: true,
        displayName: true,
        username: true,
        avatarUrl: true,
        email: true,
        role: true,
        reputationScore: true,
        isVerifiedUser: true,
      },
    });

    return updated;
  }

  /**
   * Update user settings
   */
  async updateSettings(userId: string, dto: UpdateSettingsDto) {
    // Validate notification radius
    if (dto.notificationRadiusKm && dto.notificationRadiusKm > 50) {
      throw new BadRequestException('Notification radius cannot exceed 50km');
    }

    const settings = await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        ...dto,
      },
      update: dto,
    });

    return settings;
  }

  /**
   * Get user settings
   */
  async getSettings(userId: string) {
    let settings = await this.prisma.userSettings.findUnique({
      where: { userId },
    });

    // Create default settings if not exists
    if (!settings) {
      settings = await this.prisma.userSettings.create({
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
   * Get public user profile
   */
  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        username: true,
        avatarUrl: true,
        reputationScore: true,
        reportsCount: true,
        verifiedReportsCount: true,
        isVerifiedUser: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Get user's incident history
   */
  async getUserIncidents(userId: string, limit = 20, offset = 0) {
    const [incidents, total] = await Promise.all([
      this.prisma.incident.findMany({
        where: { userId, isAnonymous: false },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          category: {
            select: { name: true, icon: true, color: true },
          },
        },
      }),
      this.prisma.incident.count({ where: { userId, isAnonymous: false } }),
    ]);

    return { incidents, total };
  }

  /**
   * Get reputation history
   */
  async getReputationHistory(userId: string, limit = 20, offset = 0) {
    return this.reputationService.getReputationHistory(userId, limit, offset);
  }

  /**
   * Get reputation leaderboard
   */
  async getLeaderboard(limit = 10) {
    return this.reputationService.getLeaderboard(limit);
  }

  /**
   * Check username availability
   */
  async checkUsernameAvailability(username: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    return !user;
  }

  /**
   * Deactivate account
   */
  async deactivateAccount(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isBanned: true,
        banReason: 'User requested account deactivation',
        bannedAt: new Date(),
      },
    });

    // Revoke all tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Delete account and all associated data
   */
  async deleteAccount(userId: string): Promise<void> {
    // This will cascade delete due to Prisma relations
    await this.prisma.user.delete({
      where: { id: userId },
    });
  }
}
