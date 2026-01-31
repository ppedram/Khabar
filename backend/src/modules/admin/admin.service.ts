import { prisma } from '../../config/database.js';
import { NotFoundError, BadRequestError } from '../../utils/errors.js';
import { getSkip, paginate, type PaginationParams } from '../../utils/pagination.js';

export class AdminService {
  /**
   * Get moderation queue
   */
  async getModerationQueue(
    pagination: PaginationParams,
    filters: {
      contentType?: string;
      status?: string;
    }
  ) {
    const where: Record<string, unknown> = {};

    if (filters.contentType) {
      where['contentType'] = filters.contentType;
    }

    if (filters.status) {
      where['status'] = filters.status;
    } else {
      where['status'] = { in: ['PENDING', 'IN_REVIEW'] };
    }

    const [items, total] = await Promise.all([
      prisma.moderationQueue.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        skip: getSkip(pagination.page, pagination.limit),
        take: pagination.limit,
      }),
      prisma.moderationQueue.count({ where }),
    ]);

    // Fetch actual content for each item
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        let content = null;

        switch (item.contentType) {
          case 'INCIDENT':
            content = await prisma.incident.findUnique({
              where: { id: item.contentId },
              include: { category: true, user: { select: { id: true, username: true } } },
            });
            break;
          case 'COMMENT':
            content = await prisma.comment.findUnique({
              where: { id: item.contentId },
              include: { user: { select: { id: true, username: true } } },
            });
            break;
          case 'MEDIA':
            content = await prisma.incidentMedia.findUnique({
              where: { id: item.contentId },
            });
            break;
          case 'USER':
            content = await prisma.user.findUnique({
              where: { id: item.contentId },
              select: { id: true, username: true, phoneNumber: true, isBanned: true },
            });
            break;
        }

        return { ...item, content };
      })
    );

    return paginate(enrichedItems, total, pagination);
  }

  /**
   * Process moderation item
   */
  async processModerationItem(
    itemId: string,
    moderatorId: string,
    decision: 'APPROVED' | 'REJECTED',
    notes?: string
  ) {
    const item = await prisma.moderationQueue.findUnique({
      where: { id: itemId },
    });

    if (!item) {
      throw new NotFoundError('Moderation item not found');
    }

    // Update the moderation queue item
    await prisma.moderationQueue.update({
      where: { id: itemId },
      data: {
        status: decision,
        decidedById: moderatorId,
        decidedAt: new Date(),
        decisionNotes: notes,
      },
    });

    // Apply the decision to the content
    switch (item.contentType) {
      case 'INCIDENT':
        await prisma.incident.update({
          where: { id: item.contentId },
          data: {
            status: decision === 'APPROVED' ? 'VERIFIED' : 'REJECTED',
            verifiedById: decision === 'APPROVED' ? moderatorId : undefined,
            verifiedAt: decision === 'APPROVED' ? new Date() : undefined,
          },
        });
        break;

      case 'COMMENT':
        await prisma.comment.update({
          where: { id: item.contentId },
          data: {
            moderationStatus: decision,
            isDeleted: decision === 'REJECTED',
          },
        });
        break;

      case 'MEDIA':
        await prisma.incidentMedia.update({
          where: { id: item.contentId },
          data: { moderationStatus: decision },
        });
        break;

      case 'USER':
        if (decision === 'REJECTED') {
          // Ban the user if they were reported and decision is to take action
          await prisma.user.update({
            where: { id: item.contentId },
            data: {
              isBanned: true,
              banReason: notes ?? 'Violated community guidelines',
            },
          });
        }
        break;
    }

    return { message: `Content ${decision.toLowerCase()}` };
  }

  /**
   * Get all incidents (admin view)
   */
  async getAllIncidents(
    pagination: PaginationParams,
    filters: { status?: string; severity?: string }
  ) {
    const where: Record<string, unknown> = {};

    if (filters.status) {
      where['status'] = filters.status;
    }

    if (filters.severity) {
      where['severity'] = filters.severity;
    }

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where,
        include: {
          category: true,
          user: { select: { id: true, username: true, phoneNumber: true } },
          _count: { select: { comments: true, media: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: getSkip(pagination.page, pagination.limit),
        take: pagination.limit,
      }),
      prisma.incident.count({ where }),
    ]);

    return paginate(incidents, total, pagination);
  }

  /**
   * Update incident status (admin)
   */
  async updateIncidentStatus(
    incidentId: string,
    status: string,
    moderatorId: string
  ) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    const validStatuses = ['PENDING', 'VERIFIED', 'RESOLVED', 'REJECTED', 'EXPIRED'];
    if (!validStatuses.includes(status)) {
      throw new BadRequestError('Invalid status');
    }

    const updateData: Record<string, unknown> = { status };

    if (status === 'VERIFIED') {
      updateData['verifiedById'] = moderatorId;
      updateData['verifiedAt'] = new Date();
    } else if (status === 'RESOLVED') {
      updateData['resolvedAt'] = new Date();
    }

    return prisma.incident.update({
      where: { id: incidentId },
      data: updateData,
    });
  }

  /**
   * Get all users (admin view)
   */
  async getAllUsers(
    pagination: PaginationParams,
    filters: { role?: string; isBanned?: boolean }
  ) {
    const where: Record<string, unknown> = {};

    if (filters.role) {
      where['role'] = filters.role;
    }

    if (filters.isBanned !== undefined) {
      where['isBanned'] = filters.isBanned;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          phoneNumber: true,
          email: true,
          username: true,
          displayName: true,
          role: true,
          reputationScore: true,
          reportsCount: true,
          isBanned: true,
          banReason: true,
          createdAt: true,
          lastActiveAt: true,
          _count: { select: { incidents: true, comments: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: getSkip(pagination.page, pagination.limit),
        take: pagination.limit,
      }),
      prisma.user.count({ where }),
    ]);

    return paginate(users, total, pagination);
  }

  /**
   * Update user (admin)
   */
  async updateUser(
    userId: string,
    data: {
      role?: 'USER' | 'MODERATOR' | 'ADMIN';
      isBanned?: boolean;
      banReason?: string;
    }
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return prisma.user.update({
      where: { id: userId },
      data: {
        role: data.role,
        isBanned: data.isBanned,
        banReason: data.banReason,
      },
      select: {
        id: true,
        username: true,
        role: true,
        isBanned: true,
        banReason: true,
      },
    });
  }

  /**
   * Get platform statistics
   */
  async getStats() {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsers24h,
      totalIncidents,
      newIncidents24h,
      activeIncidents,
      pendingModeration,
      incidentsByCategory,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: last24Hours } } }),
      prisma.incident.count(),
      prisma.incident.count({ where: { createdAt: { gte: last24Hours } } }),
      prisma.incident.count({ where: { status: { in: ['PENDING', 'VERIFIED'] } } }),
      prisma.moderationQueue.count({ where: { status: 'PENDING' } }),
      prisma.incident.groupBy({
        by: ['categoryId'],
        where: { createdAt: { gte: last7Days } },
        _count: { id: true },
      }),
    ]);

    // Get category names
    const categories = await prisma.category.findMany({
      where: { id: { in: incidentsByCategory.map((c) => c.categoryId) } },
    });

    const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

    return {
      users: {
        total: totalUsers,
        new24h: newUsers24h,
      },
      incidents: {
        total: totalIncidents,
        new24h: newIncidents24h,
        active: activeIncidents,
      },
      moderation: {
        pending: pendingModeration,
      },
      incidentsByCategory: incidentsByCategory.map((c) => ({
        category: categoryMap.get(c.categoryId) ?? 'Unknown',
        count: c._count.id,
      })),
    };
  }

  /**
   * Get user reports
   */
  async getUserReports(pagination: PaginationParams, status?: string) {
    const where: Record<string, unknown> = {};

    if (status) {
      where['status'] = status;
    }

    const [reports, total] = await Promise.all([
      prisma.userReport.findMany({
        where,
        include: {
          reporter: { select: { id: true, username: true } },
          reportedUser: { select: { id: true, username: true, isBanned: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: getSkip(pagination.page, pagination.limit),
        take: pagination.limit,
      }),
      prisma.userReport.count({ where }),
    ]);

    return paginate(reports, total, pagination);
  }

  /**
   * Process user report
   */
  async processUserReport(
    reportId: string,
    status: 'REVIEWED' | 'ACTION_TAKEN' | 'DISMISSED'
  ) {
    const report = await prisma.userReport.findUnique({
      where: { id: reportId },
    });

    if (!report) {
      throw new NotFoundError('Report not found');
    }

    return prisma.userReport.update({
      where: { id: reportId },
      data: { status },
    });
  }
}
