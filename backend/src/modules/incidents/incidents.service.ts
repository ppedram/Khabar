import { prisma } from '../../config/database.js';
import { config } from '../../config/index.js';
import { NotFoundError, ForbiddenError } from '../../utils/errors.js';
import { kmToMeters, getBoundingBox, sanitizeRadius } from '../../utils/geo.js';
import { getSkip, paginate, type PaginationParams } from '../../utils/pagination.js';
import type {
  CreateIncidentInput,
  UpdateIncidentInput,
  NearbyIncidentsQuery,
  MapIncidentsQuery,
  ListIncidentsQuery,
  AddUpdateInput,
} from './incidents.schema.js';

export class IncidentService {
  /**
   * Create a new incident
   */
  async createIncident(userId: string, data: CreateIncidentInput) {
    // Calculate expiry time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + config.incidents.expiryHours);

    const incident = await prisma.incident.create({
      data: {
        userId,
        categoryId: data.categoryId,
        title: data.title,
        description: data.description,
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
        city: data.city,
        neighborhood: data.neighborhood,
        severity: data.severity,
        isAnonymous: data.isAnonymous,
        expiresAt,
        status: config.features.requireModeration ? 'PENDING' : 'VERIFIED',
      },
      include: {
        category: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            reputationScore: true,
          },
        },
      },
    });

    // Update user's reports count
    await prisma.user.update({
      where: { id: userId },
      data: { reportsCount: { increment: 1 } },
    });

    // Add to moderation queue if moderation is required
    if (config.features.requireModeration) {
      await prisma.moderationQueue.create({
        data: {
          contentType: 'INCIDENT',
          contentId: incident.id,
          reason: 'NEW_CONTENT',
          priority: this.getSeverityPriority(data.severity),
        },
      });
    }

    return this.formatIncident(incident);
  }

  /**
   * Get nearby incidents using geospatial query
   */
  async getNearbyIncidents(query: NearbyIncidentsQuery) {
    const radiusKm = sanitizeRadius(query.radius);
    const radiusMeters = kmToMeters(radiusKm);

    // Use bounding box for initial filter (more efficient)
    const bbox = getBoundingBox(
      { latitude: query.latitude, longitude: query.longitude },
      radiusKm
    );

    const whereClause: Record<string, unknown> = {
      status: query.status ?? { in: ['PENDING', 'VERIFIED'] },
      latitude: { gte: bbox.minLat, lte: bbox.maxLat },
      longitude: { gte: bbox.minLng, lte: bbox.maxLng },
    };

    if (query.category) {
      whereClause['categoryId'] = query.category;
    }

    if (query.severity) {
      whereClause['severity'] = query.severity;
    }

    if (query.since) {
      whereClause['createdAt'] = { gte: query.since };
    }

    // Get incidents within bounding box
    const incidents = await prisma.incident.findMany({
      where: whereClause,
      include: {
        category: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
        _count: {
          select: {
            comments: true,
            media: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Limit for performance
    });

    // Calculate actual distances and filter precisely
    const incidentsWithDistance = incidents
      .map((incident) => {
        const distance = this.calculateDistance(
          query.latitude,
          query.longitude,
          Number(incident.latitude),
          Number(incident.longitude)
        );
        return { ...this.formatIncident(incident), distance };
      })
      .filter((inc) => inc.distance <= radiusKm)
      .sort((a, b) => a.distance - b.distance);

    return incidentsWithDistance;
  }

  /**
   * Get incidents for map view (within bounds)
   */
  async getMapIncidents(query: MapIncidentsQuery) {
    const whereClause: Record<string, unknown> = {
      status: query.status ?? { in: ['PENDING', 'VERIFIED'] },
      latitude: { gte: query.minLat, lte: query.maxLat },
      longitude: { gte: query.minLng, lte: query.maxLng },
    };

    if (query.categories) {
      const categoryIds = query.categories.split(',').filter(Boolean);
      if (categoryIds.length > 0) {
        whereClause['categoryId'] = { in: categoryIds };
      }
    }

    const incidents = await prisma.incident.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        latitude: true,
        longitude: true,
        severity: true,
        status: true,
        createdAt: true,
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            icon: true,
            color: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200, // Limit for map performance
    });

    return incidents.map((inc) => ({
      ...inc,
      latitude: Number(inc.latitude),
      longitude: Number(inc.longitude),
    }));
  }

  /**
   * List incidents with filters and pagination
   */
  async listIncidents(query: ListIncidentsQuery) {
    const whereClause: Record<string, unknown> = {};

    if (query.category) {
      whereClause['categoryId'] = query.category;
    }

    if (query.status) {
      whereClause['status'] = query.status;
    } else {
      whereClause['status'] = { in: ['PENDING', 'VERIFIED'] };
    }

    if (query.severity) {
      whereClause['severity'] = query.severity;
    }

    if (query.userId) {
      whereClause['userId'] = query.userId;
    }

    const [incidents, total] = await Promise.all([
      prisma.incident.findMany({
        where: whereClause,
        include: {
          category: true,
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          _count: {
            select: {
              comments: true,
              media: true,
            },
          },
        },
        orderBy: { [query.sortBy]: query.sortOrder },
        skip: getSkip(query.page, query.limit),
        take: query.limit,
      }),
      prisma.incident.count({ where: whereClause }),
    ]);

    return paginate(incidents.map(this.formatIncident), total, {
      page: query.page,
      limit: query.limit,
      sortOrder: query.sortOrder,
    } as PaginationParams);
  }

  /**
   * Get single incident by ID
   */
  async getIncident(incidentId: string, viewerId?: string) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        category: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            reputationScore: true,
          },
        },
        media: {
          where: { moderationStatus: 'APPROVED' },
          orderBy: { isPrimary: 'desc' },
        },
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: {
              select: {
                id: true,
                username: true,
                displayName: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            votes: true,
          },
        },
      },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    // Increment view count
    await prisma.incident.update({
      where: { id: incidentId },
      data: { viewsCount: { increment: 1 } },
    });

    // Check if viewer has voted
    let userVote = null;
    if (viewerId) {
      const vote = await prisma.vote.findUnique({
        where: {
          userId_incidentId: {
            userId: viewerId,
            incidentId,
          },
        },
      });
      userVote = vote?.voteType ?? null;
    }

    return {
      ...this.formatIncident(incident),
      media: incident.media,
      updates: incident.updates,
      userVote,
    };
  }

  /**
   * Update an incident
   */
  async updateIncident(
    incidentId: string,
    userId: string,
    data: UpdateIncidentInput,
    isAdmin = false
  ) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    // Only owner or admin can update
    if (incident.userId !== userId && !isAdmin) {
      throw new ForbiddenError('You can only update your own incidents');
    }

    const updated = await prisma.incident.update({
      where: { id: incidentId },
      data: {
        title: data.title,
        description: data.description,
        severity: data.severity,
      },
      include: {
        category: true,
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          },
        },
      },
    });

    return this.formatIncident(updated);
  }

  /**
   * Delete an incident
   */
  async deleteIncident(incidentId: string, userId: string, isAdmin = false) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    // Only owner or admin can delete
    if (incident.userId !== userId && !isAdmin) {
      throw new ForbiddenError('You can only delete your own incidents');
    }

    await prisma.incident.delete({
      where: { id: incidentId },
    });

    // Decrement user's reports count
    await prisma.user.update({
      where: { id: incident.userId },
      data: { reportsCount: { decrement: 1 } },
    });
  }

  /**
   * Upvote an incident
   */
  async upvoteIncident(incidentId: string, userId: string) {
    // Check if incident exists
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    // Check for existing vote
    const existingVote = await prisma.vote.findUnique({
      where: {
        userId_incidentId: {
          userId,
          incidentId,
        },
      },
    });

    if (existingVote) {
      // Remove vote
      await prisma.vote.delete({
        where: { id: existingVote.id },
      });

      await prisma.incident.update({
        where: { id: incidentId },
        data: { upvotesCount: { decrement: 1 } },
      });

      return { voted: false };
    }

    // Add vote
    await prisma.vote.create({
      data: {
        userId,
        incidentId,
        voteType: 'UPVOTE',
      },
    });

    await prisma.incident.update({
      where: { id: incidentId },
      data: { upvotesCount: { increment: 1 } },
    });

    return { voted: true };
  }

  /**
   * Verify an incident
   */
  async verifyIncident(incidentId: string, userId: string) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    // Check for existing verify vote
    const existingVote = await prisma.vote.findFirst({
      where: {
        userId,
        incidentId,
        voteType: 'VERIFY',
      },
    });

    if (existingVote) {
      return { verified: false, message: 'Already verified' };
    }

    // Add verify vote
    await prisma.vote.create({
      data: {
        userId,
        incidentId,
        voteType: 'VERIFY',
      },
    });

    // Count verify votes
    const verifyCount = await prisma.vote.count({
      where: {
        incidentId,
        voteType: 'VERIFY',
      },
    });

    // Auto-verify after threshold (e.g., 3 verifications)
    if (verifyCount >= 3 && incident.status === 'PENDING') {
      await prisma.incident.update({
        where: { id: incidentId },
        data: {
          status: 'VERIFIED',
          verifiedAt: new Date(),
          verifiedById: userId,
        },
      });

      // Update reporter's verified count
      await prisma.user.update({
        where: { id: incident.userId },
        data: {
          verifiedReportsCount: { increment: 1 },
          reputationScore: { increment: 5 },
        },
      });
    }

    return { verified: true, verifyCount };
  }

  /**
   * Add an update to an incident
   */
  async addUpdate(
    incidentId: string,
    userId: string,
    data: AddUpdateInput,
    isAdmin = false
  ) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    // Only owner or admin can add updates
    if (incident.userId !== userId && !isAdmin) {
      throw new ForbiddenError('You can only add updates to your own incidents');
    }

    const update = await prisma.incidentUpdate.create({
      data: {
        incidentId,
        userId,
        content: data.content,
        updateType: data.updateType,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
          },
        },
      },
    });

    return update;
  }

  /**
   * Get incident updates
   */
  async getUpdates(incidentId: string, pagination: PaginationParams) {
    const [updates, total] = await Promise.all([
      prisma.incidentUpdate.findMany({
        where: { incidentId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: getSkip(pagination.page, pagination.limit),
        take: pagination.limit,
      }),
      prisma.incidentUpdate.count({ where: { incidentId } }),
    ]);

    return paginate(updates, total, pagination);
  }

  /**
   * Calculate distance between two points (Haversine)
   */
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

  private getSeverityPriority(severity: string): number {
    switch (severity) {
      case 'CRITICAL':
        return 5;
      case 'HIGH':
        return 4;
      case 'MEDIUM':
        return 2;
      case 'LOW':
        return 1;
      default:
        return 2;
    }
  }

  private formatIncident(incident: {
    id: string;
    userId: string;
    categoryId: string;
    title: string;
    description: string | null;
    latitude: unknown;
    longitude: unknown;
    address: string | null;
    city: string | null;
    neighborhood: string | null;
    status: string;
    severity: string;
    isAnonymous: boolean;
    viewsCount: number;
    upvotesCount: number;
    commentsCount: number;
    createdAt: Date;
    updatedAt: Date;
    category?: object;
    user?: object;
    _count?: {
      comments?: number;
      media?: number;
      votes?: number;
    };
  }) {
    return {
      id: incident.id,
      title: incident.title,
      description: incident.description,
      latitude: Number(incident.latitude),
      longitude: Number(incident.longitude),
      address: incident.address,
      city: incident.city,
      neighborhood: incident.neighborhood,
      status: incident.status,
      severity: incident.severity,
      isAnonymous: incident.isAnonymous,
      viewsCount: incident.viewsCount,
      upvotesCount: incident.upvotesCount,
      commentsCount: incident._count?.comments ?? incident.commentsCount,
      mediaCount: incident._count?.media ?? 0,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      category: incident.category,
      user: incident.isAnonymous ? null : incident.user,
    };
  }
}
