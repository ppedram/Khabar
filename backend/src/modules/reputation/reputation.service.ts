import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReputationAction } from '@prisma/client';

interface ReputationPoints {
  incidentCreated: number;
  incidentVerified: number;
  incidentRejected: number;
  upvoteReceived: number;
  downvoteReceived: number;
  verifyReceived: number;
  commentUpvoted: number;
  reportAccepted: number;
  reportRejected: number;
  banPenalty: number;
}

const DEFAULT_POINTS: ReputationPoints = {
  incidentCreated: 5,
  incidentVerified: 20,
  incidentRejected: -10,
  upvoteReceived: 2,
  downvoteReceived: -1,
  verifyReceived: 5,
  commentUpvoted: 1,
  reportAccepted: -25,
  reportRejected: 5,
  banPenalty: -100,
};

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);
  private readonly points: ReputationPoints;

  // Thresholds for verified user status
  private readonly VERIFIED_USER_THRESHOLD = 100;
  private readonly VERIFIED_REPORTS_THRESHOLD = 5;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    // Load reputation points from config or use defaults
    this.points = {
      incidentCreated:
        this.configService.get<number>('reputation.incidentCreated') ||
        DEFAULT_POINTS.incidentCreated,
      incidentVerified:
        this.configService.get<number>('reputation.incidentVerified') ||
        DEFAULT_POINTS.incidentVerified,
      incidentRejected:
        this.configService.get<number>('reputation.incidentRejected') ||
        DEFAULT_POINTS.incidentRejected,
      upvoteReceived:
        this.configService.get<number>('reputation.upvoteReceived') ||
        DEFAULT_POINTS.upvoteReceived,
      downvoteReceived:
        this.configService.get<number>('reputation.downvoteReceived') ||
        DEFAULT_POINTS.downvoteReceived,
      verifyReceived:
        this.configService.get<number>('reputation.verifyReceived') ||
        DEFAULT_POINTS.verifyReceived,
      commentUpvoted:
        this.configService.get<number>('reputation.commentUpvoted') ||
        DEFAULT_POINTS.commentUpvoted,
      reportAccepted:
        this.configService.get<number>('reputation.reportAccepted') ||
        DEFAULT_POINTS.reportAccepted,
      reportRejected:
        this.configService.get<number>('reputation.reportRejected') ||
        DEFAULT_POINTS.reportRejected,
      banPenalty:
        this.configService.get<number>('reputation.banPenalty') ||
        DEFAULT_POINTS.banPenalty,
    };
  }

  /**
   * Adjust user reputation based on action
   */
  async adjustReputation(
    userId: string,
    action: ReputationAction,
    referenceType?: string,
    referenceId?: string,
    customPoints?: number,
  ): Promise<void> {
    const points = customPoints ?? this.getPointsForAction(action);

    if (points === 0) {
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        // Get current user
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { reputationScore: true, verifiedReportsCount: true },
        });

        if (!user) {
          this.logger.warn(`User not found for reputation adjustment: ${userId}`);
          return;
        }

        const previousScore = user.reputationScore;
        const newScore = Math.max(0, previousScore + points); // Score cannot go below 0

        // Update user reputation
        await tx.user.update({
          where: { id: userId },
          data: {
            reputationScore: newScore,
            // Check if user should be granted verified status
            isVerifiedUser: this.shouldBeVerified(
              newScore,
              user.verifiedReportsCount,
            ),
          },
        });

        // Log the reputation change
        await tx.reputationLog.create({
          data: {
            userId,
            action,
            points,
            previousScore,
            newScore,
            referenceType,
            referenceId,
            description: this.getDescriptionForAction(action),
          },
        });
      });

      this.logger.debug(
        `Adjusted reputation for user ${userId}: ${action} (${points > 0 ? '+' : ''}${points})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to adjust reputation for user ${userId}:`,
        error,
      );
    }
  }

  /**
   * Get reputation history for a user
   */
  async getReputationHistory(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{
    logs: unknown[];
    total: number;
    currentScore: number;
  }> {
    const [logs, total, user] = await Promise.all([
      this.prisma.reputationLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.reputationLog.count({ where: { userId } }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { reputationScore: true },
      }),
    ]);

    return {
      logs,
      total,
      currentScore: user?.reputationScore || 0,
    };
  }

  /**
   * Get reputation statistics for a user
   */
  async getReputationStats(userId: string): Promise<{
    currentScore: number;
    isVerifiedUser: boolean;
    totalPoints: number;
    pointsThisMonth: number;
    breakdown: Record<string, number>;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        reputationScore: true,
        isVerifiedUser: true,
      },
    });

    if (!user) {
      return {
        currentScore: 0,
        isVerifiedUser: false,
        totalPoints: 0,
        pointsThisMonth: 0,
        breakdown: {},
      };
    }

    // Get points breakdown by action
    const breakdown = await this.prisma.reputationLog.groupBy({
      by: ['action'],
      where: { userId },
      _sum: { points: true },
    });

    // Get points this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const pointsThisMonth = await this.prisma.reputationLog.aggregate({
      where: {
        userId,
        createdAt: { gte: startOfMonth },
        points: { gt: 0 },
      },
      _sum: { points: true },
    });

    // Get total positive points earned
    const totalPoints = await this.prisma.reputationLog.aggregate({
      where: {
        userId,
        points: { gt: 0 },
      },
      _sum: { points: true },
    });

    return {
      currentScore: user.reputationScore,
      isVerifiedUser: user.isVerifiedUser,
      totalPoints: totalPoints._sum.points || 0,
      pointsThisMonth: pointsThisMonth._sum.points || 0,
      breakdown: breakdown.reduce(
        (acc, item) => {
          acc[item.action] = item._sum.points || 0;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  /**
   * Admin adjustment of reputation
   */
  async adminAdjustReputation(
    userId: string,
    points: number,
    reason: string,
    adminId: string,
  ): Promise<void> {
    await this.adjustReputation(
      userId,
      ReputationAction.ADMIN_ADJUSTMENT,
      'ADMIN',
      adminId,
      points,
    );

    // Log admin action
    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'REPUTATION_ADJUSTMENT',
        entityType: 'USER',
        entityId: userId,
        newValues: { points, reason },
      },
    });
  }

  /**
   * Get points value for an action
   */
  private getPointsForAction(action: ReputationAction): number {
    const actionPoints: Record<ReputationAction, number> = {
      [ReputationAction.INCIDENT_CREATED]: this.points.incidentCreated,
      [ReputationAction.INCIDENT_VERIFIED]: this.points.incidentVerified,
      [ReputationAction.INCIDENT_REJECTED]: this.points.incidentRejected,
      [ReputationAction.UPVOTE_RECEIVED]: this.points.upvoteReceived,
      [ReputationAction.DOWNVOTE_RECEIVED]: this.points.downvoteReceived,
      [ReputationAction.VERIFY_RECEIVED]: this.points.verifyReceived,
      [ReputationAction.COMMENT_UPVOTED]: this.points.commentUpvoted,
      [ReputationAction.REPORT_ACCEPTED]: this.points.reportAccepted,
      [ReputationAction.REPORT_REJECTED]: this.points.reportRejected,
      [ReputationAction.BAN_PENALTY]: this.points.banPenalty,
      [ReputationAction.ADMIN_ADJUSTMENT]: 0, // Handled separately
    };

    return actionPoints[action] || 0;
  }

  /**
   * Get description for an action
   */
  private getDescriptionForAction(action: ReputationAction): string {
    const descriptions: Record<ReputationAction, string> = {
      [ReputationAction.INCIDENT_CREATED]: 'Created an incident report',
      [ReputationAction.INCIDENT_VERIFIED]:
        'Your incident was verified by the community',
      [ReputationAction.INCIDENT_REJECTED]:
        'Your incident was rejected or removed',
      [ReputationAction.UPVOTE_RECEIVED]: 'Received an upvote',
      [ReputationAction.DOWNVOTE_RECEIVED]: 'Received a downvote',
      [ReputationAction.VERIFY_RECEIVED]: 'Helped verify an incident',
      [ReputationAction.COMMENT_UPVOTED]: 'Your comment was upvoted',
      [ReputationAction.REPORT_ACCEPTED]: 'Received a valid report',
      [ReputationAction.REPORT_REJECTED]:
        'Report against you was dismissed',
      [ReputationAction.BAN_PENALTY]: 'Account penalty',
      [ReputationAction.ADMIN_ADJUSTMENT]: 'Admin adjustment',
    };

    return descriptions[action] || 'Reputation change';
  }

  /**
   * Check if user should have verified status
   */
  private shouldBeVerified(
    reputationScore: number,
    verifiedReportsCount: number,
  ): boolean {
    return (
      reputationScore >= this.VERIFIED_USER_THRESHOLD &&
      verifiedReportsCount >= this.VERIFIED_REPORTS_THRESHOLD
    );
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit = 10): Promise<
    {
      id: string;
      displayName: string | null;
      username: string | null;
      avatarUrl: string | null;
      reputationScore: number;
      isVerifiedUser: boolean;
      verifiedReportsCount: number;
    }[]
  > {
    return this.prisma.user.findMany({
      where: {
        isBanned: false,
        reputationScore: { gt: 0 },
      },
      select: {
        id: true,
        displayName: true,
        username: true,
        avatarUrl: true,
        reputationScore: true,
        isVerifiedUser: true,
        verifiedReportsCount: true,
      },
      orderBy: { reputationScore: 'desc' },
      take: limit,
    });
  }
}
