import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from './storage.service';
import {
  CreateMediaDto,
  RequestUploadUrlDto,
  ConfirmUploadDto,
} from './dto/media.dto';
import { User, MediaType, ModerationStatus } from '@prisma/client';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * Request a presigned URL for direct upload from iOS
   * This is the preferred method for iOS apps
   */
  async requestUploadUrl(dto: RequestUploadUrlDto, user: User) {
    // Validate file type
    const type = dto.contentType.startsWith('video/') ? 'video' : 'image';
    if (!this.storageService.validateFileType(dto.contentType, type)) {
      throw new BadRequestException(`Invalid ${type} type: ${dto.contentType}`);
    }

    // Validate file size
    if (!this.storageService.validateFileSize(dto.fileSize, type)) {
      const maxSize =
        type === 'image'
          ? this.configService.get<number>('media.maxImageSizeMb')
          : this.configService.get<number>('media.maxVideoSizeMb');
      throw new BadRequestException(
        `File size exceeds maximum of ${maxSize}MB for ${type}`,
      );
    }

    // Validate video duration if provided
    if (type === 'video' && dto.durationSeconds) {
      const maxDuration =
        this.configService.get<number>('media.maxVideoDurationSeconds') || 60;
      if (dto.durationSeconds > maxDuration) {
        throw new BadRequestException(
          `Video duration exceeds maximum of ${maxDuration} seconds`,
        );
      }
    }

    // Generate presigned URL
    const presigned = await this.storageService.getPresignedUploadUrl(
      dto.fileName,
      {
        contentType: dto.contentType,
        expiresIn: 3600, // 1 hour
      },
    );

    return {
      uploadUrl: presigned.uploadUrl,
      key: presigned.key,
      publicUrl: presigned.publicUrl,
      expiresAt: presigned.expiresAt,
      instructions: {
        method: 'PUT',
        headers: {
          'Content-Type': dto.contentType,
        },
      },
    };
  }

  /**
   * Confirm upload and create media record
   */
  async confirmUpload(dto: ConfirmUploadDto, user: User) {
    // Verify incident exists and user has permission
    const incident = await this.prisma.incident.findUnique({
      where: { id: dto.incidentId },
    });

    if (!incident) {
      throw new NotFoundException('Incident not found');
    }

    // Only incident owner can add media
    if (incident.userId !== user.id) {
      throw new ForbiddenException('Not authorized to add media to this incident');
    }

    // Determine media type
    const mediaType = dto.mimeType?.startsWith('video/')
      ? MediaType.VIDEO
      : MediaType.IMAGE;

    // Check if this is the first media (make it primary)
    const existingMedia = await this.prisma.incidentMedia.count({
      where: { incidentId: dto.incidentId },
    });

    const media = await this.prisma.incidentMedia.create({
      data: {
        incidentId: dto.incidentId,
        userId: user.id,
        mediaType,
        url: dto.publicUrl,
        s3Key: dto.key,
        s3Bucket: this.configService.get<string>('s3.bucketName'),
        fileName: dto.fileName,
        mimeType: dto.mimeType,
        fileSize: dto.fileSize,
        durationSeconds: dto.durationSeconds,
        width: dto.width,
        height: dto.height,
        deviceModel: dto.deviceModel,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : undefined,
        isPrimary: existingMedia === 0,
        moderationStatus: ModerationStatus.PENDING,
      },
    });

    this.logger.log(
      `Media uploaded: ${media.id} for incident ${dto.incidentId}`,
    );

    // TODO: Queue for moderation/AI content analysis

    return media;
  }

  /**
   * Get media for an incident
   */
  async getMediaForIncident(incidentId: string) {
    return this.prisma.incidentMedia.findMany({
      where: {
        incidentId,
        moderationStatus: ModerationStatus.APPROVED,
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Delete media
   */
  async deleteMedia(mediaId: string, user: User) {
    const media = await this.prisma.incidentMedia.findUnique({
      where: { id: mediaId },
      include: { incident: true },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    // Only owner or admin can delete
    if (media.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('Not authorized to delete this media');
    }

    // Delete from S3
    if (media.s3Key) {
      await this.storageService.deleteFile(media.s3Key);
    }

    // Delete thumbnail if exists
    if (media.thumbnailUrl) {
      const thumbnailKey = media.thumbnailUrl.split('/').pop();
      if (thumbnailKey) {
        try {
          await this.storageService.deleteFile(`thumbnails/${thumbnailKey}`);
        } catch {
          // Ignore thumbnail deletion errors
        }
      }
    }

    await this.prisma.incidentMedia.delete({ where: { id: mediaId } });

    this.logger.log(`Media deleted: ${mediaId}`);
  }

  /**
   * Set media as primary for incident
   */
  async setPrimaryMedia(mediaId: string, user: User) {
    const media = await this.prisma.incidentMedia.findUnique({
      where: { id: mediaId },
      include: { incident: true },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    if (media.userId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('Not authorized');
    }

    // Update all media for this incident
    await this.prisma.$transaction([
      // Remove primary from all
      this.prisma.incidentMedia.updateMany({
        where: { incidentId: media.incidentId },
        data: { isPrimary: false },
      }),
      // Set this one as primary
      this.prisma.incidentMedia.update({
        where: { id: mediaId },
        data: { isPrimary: true },
      }),
    ]);

    return { message: 'Primary media updated' };
  }

  /**
   * Moderate media (admin only)
   */
  async moderateMedia(
    mediaId: string,
    status: ModerationStatus,
    notes?: string,
  ) {
    const media = await this.prisma.incidentMedia.findUnique({
      where: { id: mediaId },
    });

    if (!media) {
      throw new NotFoundException('Media not found');
    }

    return this.prisma.incidentMedia.update({
      where: { id: mediaId },
      data: { moderationStatus: status },
    });
  }
}
