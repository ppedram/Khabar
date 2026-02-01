import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ReputationService } from '../reputation/reputation.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  NearbyIncidentsDto,
  BoundingBoxDto,
  VoteDto,
} from './dto/incidents.dto';
import {
  Incident,
  IncidentStatus,
  VoteType,
  User,
  ReputationAction,
} from '@prisma/client';
import { addHours } from 'date-fns';

interface IncidentWithDistance extends Incident {
  distance_meters?: number;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
}

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly reputationService: ReputationService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Create a new incident
   */
  async create(dto: CreateIncidentDto, user: User): Promise<Incident> {
    // Validate category exists
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });

    if (!category || !category.isActive) {
      throw new BadRequestException('Invalid category');
    }

    // Calculate expiry time
    const expiryHours = this.configService.get<number>('incidents.expiryHours') || 24;
    const expiresAt = addHours(new Date(), expiryHours);

    // Create incident
    const incident = await this.prisma.incident.create({
      data: {
        userId: user.id,
        categoryId: dto.categoryId,
        title: dto.title,
        description: dto.description,
        latitude: dto.latitude,
        longitude: dto.longitude,
        address: dto.address,
        city: dto.city,
        neighborhood: dto.neighborhood,
        postalCode: dto.postalCode,
        severity: dto.severity,
        isAnonymous: dto.isAnonymous || false,
        expiresAt,
        verificationThreshold:
          this.configService.get<number>('incidents.verificationThreshold') || 3,
      },
      include: {
        category: true,
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
            reputationScore: true,
            isVerifiedUser: true,
          },
        },
      },
    });

    // Update user's report count
    await this.prisma.user.update({
      where: { id: user.id },
      data: { reportsCount: { increment: 1 } },
    });

    // Award reputation points
    await this.reputationService.adjustReputation(
      user.id,
      ReputationAction.INCIDENT_CREATED,
      'INCIDENT',
      incident.id,
    );

    // Notify nearby users
    this.notifyNearbyUsers(incident).catch((err) => {
      this.logger.error('Failed to notify nearby users:', err);
    });

    this.logger.log(`Incident created: ${incident.id} by user ${user.id}`);

    return incident;
  }

  /**
   * Get incidents within a radius (PostGIS ST_DWithin)
   */
  async findNearby(
    dto: NearbyIncidentsDto,
  ): Promise<{ incidents: IncidentWithDistance[]; total: number }> {
    const maxRadius =
      this.configService.get<number>('geo.maxSearchRadiusKm') || 50;
    const radiusKm = Math.min(dto.radiusKm || 5, maxRadius);

    const status = dto.status || [
      IncidentStatus.PENDING,
      IncidentStatus.VERIFIED,
    ];

    const incidents = (await this.prisma.findIncidentsWithinRadius(
      dto.latitude,
      dto.longitude,
      radiusKm,
      {
        status: status as string[],
        categoryId: dto.categoryId,
        limit: dto.limit || 50,
        offset: dto.offset || 0,
      },
    )) as IncidentWithDistance[];

    return {
      incidents,
      total: incidents.length,
    };
  }

  /**
   * Get incidents within a bounding box (for map view)
   */
  async findInBoundingBox(
    dto: BoundingBoxDto,
  ): Promise<IncidentWithDistance[]> {
    const status = dto.status || [
      IncidentStatus.PENDING,
      IncidentStatus.VERIFIED,
    ];

    return this.prisma.findIncidentsInBoundingBox(
      dto.minLat,
      dto.minLng,
      dto.maxLat,
      dto.maxLng,
      {
        status: status as string[],
        limit: dto.limit || 100,
      },
    ) as Promise<IncidentWithDistance[]>;
  }

  /**
   * Get a single incident by ID
   */
  async findOne(id: string, userId?: string): Promise<Incident> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        category: true,
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
            reputationScore: true,
            isVerifiedUser: true,
          },
        },
        media: {
          where: { moderationStatus: 'APPROVED' },
          orderBy: { isPrimary: 'desc' },
        },
        _count: {
          select: { comments: true, votes: true },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    // Increment view count
    await this.prisma.incident.update({
      where: { id },
      data: { viewsCount: { increment: 1 } },
    });

    // Get user's vote if logged in
    if (userId) {
      const userVote = await this.prisma.vote.findUnique({
        where: { userId_incidentId: { userId, incidentId: id } },
      });
      (incident as Incident & { userVote?: VoteType }).userVote = userVote?.voteType;
    }

    return incident;
  }

  /**
   * Update an incident
   */
  async update(
    id: string,
    dto: UpdateIncidentDto,
    user: User,
  ): Promise<Incident> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
    });

    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    // Only owner or admin can update
    if (incident.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('Not authorized to update this incident');
    }

    // Verified/resolved incidents cannot be updated except by admin
    if (
      incident.status !== IncidentStatus.PENDING &&
      user.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('Cannot update a verified or resolved incident');
    }

    return this.prisma.incident.update({
      where: { id },
      data: dto,
      include: {
        category: true,
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            avatarUrl: true,
            reputationScore: true,
          },
        },
      },
    });
  }

  /**
   * Vote on an incident (upvote, downvote, or verify)
   */
  async vote(id: string, dto: VoteDto, user: User): Promise<Incident> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    // Cannot vote on own incident
    if (incident.userId === user.id) {
      throw new ForbiddenException('Cannot vote on your own incident');
    }

    // Cannot vote on expired/rejected incidents
    if (
      incident.status === IncidentStatus.EXPIRED ||
      incident.status === IncidentStatus.REJECTED
    ) {
      throw new ForbiddenException('Cannot vote on this incident');
    }

    // Check for existing vote
    const existingVote = await this.prisma.vote.findUnique({
      where: { userId_incidentId: { userId: user.id, incidentId: id } },
    });

    await this.prisma.$transaction(async (tx) => {
      if (existingVote) {
        // Remove old vote effects
        await this.reverseVoteEffects(tx, incident, existingVote.voteType);

        if (existingVote.voteType === dto.voteType) {
          // Same vote = remove vote
          await tx.vote.delete({
            where: { id: existingVote.id },
          });
          return;
        }

        // Update vote
        await tx.vote.update({
          where: { id: existingVote.id },
          data: { voteType: dto.voteType },
        });
      } else {
        // Create new vote
        await tx.vote.create({
          data: {
            userId: user.id,
            incidentId: id,
            voteType: dto.voteType,
          },
        });
      }

      // Apply new vote effects
      await this.applyVoteEffects(tx, incident, dto.voteType, user);
    });

    // Return updated incident
    return this.prisma.incident.findUnique({
      where: { id },
      include: {
        category: true,
        _count: { select: { comments: true, votes: true } },
      },
    }) as Promise<Incident>;
  }

  /**
   * Resolve an incident
   */
  async resolve(
    id: string,
    resolutionNote: string,
    user: User,
  ): Promise<Incident> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
    });

    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    // Only owner, moderator, or admin can resolve
    if (
      incident.userId !== user.id &&
      user.role !== 'ADMIN' &&
      user.role !== 'MODERATOR'
    ) {
      throw new ForbiddenException('Not authorized to resolve this incident');
    }

    return this.prisma.incident.update({
      where: { id },
      data: {
        status: IncidentStatus.RESOLVED,
        resolvedAt: new Date(),
        resolutionNote,
      },
      include: { category: true },
    });
  }

  /**
   * Delete an incident
   */
  async remove(id: string, user: User): Promise<void> {
    const incident = await this.prisma.incident.findUnique({
      where: { id },
    });

    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    // Only owner or admin can delete
    if (incident.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('Not authorized to delete this incident');
    }

    await this.prisma.incident.delete({ where: { id } });

    // Deduct reputation for deleted incident
    if (incident.status === IncidentStatus.VERIFIED) {
      await this.reputationService.adjustReputation(
        incident.userId,
        ReputationAction.INCIDENT_REJECTED,
        'INCIDENT',
        id,
      );
    }
  }

  /**
   * Get user's incidents
   */
  async findByUser(
    userId: string,
    limit = 20,
    offset = 0,
  ): Promise<{ incidents: Incident[]; total: number }> {
    const [incidents, total] = await Promise.all([
      this.prisma.incident.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          category: true,
          _count: { select: { comments: true, votes: true } },
        },
      }),
      this.prisma.incident.count({ where: { userId } }),
    ]);

    return { incidents, total };
  }

  /**
   * Apply vote effects (update counters and check verification)
   */
  private async applyVoteEffects(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    incident: Incident & { user: User },
    voteType: VoteType,
    voter: User,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};

    switch (voteType) {
      case VoteType.UPVOTE:
        updateData.upvotesCount = { increment: 1 };
        await this.reputationService.adjustReputation(
          incident.userId,
          ReputationAction.UPVOTE_RECEIVED,
          'INCIDENT',
          incident.id,
        );
        break;

      case VoteType.DOWNVOTE:
        updateData.downvotesCount = { increment: 1 };
        await this.reputationService.adjustReputation(
          incident.userId,
          ReputationAction.DOWNVOTE_RECEIVED,
          'INCIDENT',
          incident.id,
        );
        break;

      case VoteType.VERIFY:
        updateData.verifyCount = { increment: 1 };

        // Check if verification threshold reached
        const verifyCount = incident.verifyCount + 1;
        if (
          verifyCount >= incident.verificationThreshold &&
          incident.status === IncidentStatus.PENDING
        ) {
          updateData.status = IncidentStatus.VERIFIED;
          updateData.verifiedAt = new Date();
          updateData.verifiedById = voter.id;

          // Award reputation to incident creator
          await this.reputationService.adjustReputation(
            incident.userId,
            ReputationAction.INCIDENT_VERIFIED,
            'INCIDENT',
            incident.id,
          );

          // Update verified reports count
          await tx.user.update({
            where: { id: incident.userId },
            data: { verifiedReportsCount: { increment: 1 } },
          });
        }

        // Award reputation to verifier
        await this.reputationService.adjustReputation(
          voter.id,
          ReputationAction.VERIFY_RECEIVED,
          'INCIDENT',
          incident.id,
        );
        break;
    }

    await tx.incident.update({
      where: { id: incident.id },
      data: updateData,
    });
  }

  /**
   * Reverse vote effects
   */
  private async reverseVoteEffects(
    tx: Parameters<Parameters<typeof this.prisma.$transaction>[0]>[0],
    incident: Incident,
    voteType: VoteType,
  ): Promise<void> {
    const updateData: Record<string, unknown> = {};

    switch (voteType) {
      case VoteType.UPVOTE:
        updateData.upvotesCount = { decrement: 1 };
        break;
      case VoteType.DOWNVOTE:
        updateData.downvotesCount = { decrement: 1 };
        break;
      case VoteType.VERIFY:
        updateData.verifyCount = { decrement: 1 };
        break;
    }

    await tx.incident.update({
      where: { id: incident.id },
      data: updateData,
    });
  }

  /**
   * Notify users near the incident
   */
  private async notifyNearbyUsers(incident: Incident): Promise<void> {
    const maxRadius =
      this.configService.get<number>('geo.maxSearchRadiusKm') || 50;

    const nearbyUsers = await this.prisma.findUsersWithinRadius(
      Number(incident.latitude),
      Number(incident.longitude),
      maxRadius,
    );

    for (const nearbyUser of nearbyUsers) {
      if (nearbyUser.userId === incident.userId) continue; // Don't notify creator

      await this.notificationsService.sendNearbyIncidentNotification(
        nearbyUser.userId,
        incident,
        nearbyUser.apnsToken || undefined,
      );
    }

    this.logger.log(
      `Notified ${nearbyUsers.length} users about incident ${incident.id}`,
    );
  }
}
