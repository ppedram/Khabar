import { prisma } from '../../config/database.js';
import { config } from '../../config/index.js';
import { StorageService } from './storage.service.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../../utils/errors.js';
import type { MultipartFile } from '@fastify/multipart';

export class MediaService {
  private storageService: StorageService;

  constructor() {
    this.storageService = new StorageService();
  }

  /**
   * Upload media to an incident
   */
  async uploadMedia(
    incidentId: string,
    userId: string,
    file: MultipartFile
  ) {
    // Validate incident exists and user owns it
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    if (incident.userId !== userId) {
      throw new ForbiddenError('You can only add media to your own incidents');
    }

    // Validate file type
    const contentType = file.mimetype;
    let mediaType: 'IMAGE' | 'VIDEO' | 'AUDIO';

    if (this.storageService.isAllowedImageType(contentType)) {
      mediaType = 'IMAGE';

      // Check file size
      const buffer = await file.toBuffer();
      if (buffer.length > config.media.maxImageSizeMb * 1024 * 1024) {
        throw new BadRequestError(
          `Image size exceeds maximum of ${config.media.maxImageSizeMb}MB`
        );
      }

      // Upload file
      const result = await this.storageService.uploadFile(
        buffer,
        file.filename,
        contentType,
        `incidents/${incidentId}`
      );

      // Check if this is the first media (make it primary)
      const existingMedia = await prisma.incidentMedia.count({
        where: { incidentId },
      });

      // Create media record
      const media = await prisma.incidentMedia.create({
        data: {
          incidentId,
          userId,
          mediaType,
          url: result.url,
          fileSize: result.size,
          isPrimary: existingMedia === 0,
          moderationStatus: config.features.requireModeration ? 'PENDING' : 'APPROVED',
        },
      });

      // Add to moderation queue if required
      if (config.features.requireModeration) {
        await prisma.moderationQueue.create({
          data: {
            contentType: 'MEDIA',
            contentId: media.id,
            reason: 'NEW_CONTENT',
            priority: 1,
          },
        });
      }

      return media;
    } else if (this.storageService.isAllowedVideoType(contentType)) {
      mediaType = 'VIDEO';

      // Check file size
      const buffer = await file.toBuffer();
      if (buffer.length > config.media.maxVideoSizeMb * 1024 * 1024) {
        throw new BadRequestError(
          `Video size exceeds maximum of ${config.media.maxVideoSizeMb}MB`
        );
      }

      // Upload file
      const result = await this.storageService.uploadFile(
        buffer,
        file.filename,
        contentType,
        `incidents/${incidentId}`
      );

      // Check if this is the first media (make it primary)
      const existingMedia = await prisma.incidentMedia.count({
        where: { incidentId },
      });

      // Create media record
      const media = await prisma.incidentMedia.create({
        data: {
          incidentId,
          userId,
          mediaType,
          url: result.url,
          fileSize: result.size,
          isPrimary: existingMedia === 0,
          moderationStatus: config.features.requireModeration ? 'PENDING' : 'APPROVED',
        },
      });

      // Add to moderation queue if required
      if (config.features.requireModeration) {
        await prisma.moderationQueue.create({
          data: {
            contentType: 'MEDIA',
            contentId: media.id,
            reason: 'NEW_CONTENT',
            priority: 1,
          },
        });
      }

      return media;
    } else {
      throw new BadRequestError('Unsupported file type');
    }
  }

  /**
   * Get media for an incident
   */
  async getIncidentMedia(incidentId: string) {
    return prisma.incidentMedia.findMany({
      where: {
        incidentId,
        moderationStatus: 'APPROVED',
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Delete media
   */
  async deleteMedia(mediaId: string, userId: string, isAdmin = false) {
    const media = await prisma.incidentMedia.findUnique({
      where: { id: mediaId },
      include: { incident: true },
    });

    if (!media) {
      throw new NotFoundError('Media not found');
    }

    if (media.userId !== userId && !isAdmin) {
      throw new ForbiddenError('You can only delete your own media');
    }

    // Extract key from URL
    const key = media.url.replace(`${config.s3.publicUrl}/`, '');

    // Delete from storage
    await this.storageService.deleteFile(key);

    // Delete from database
    await prisma.incidentMedia.delete({
      where: { id: mediaId },
    });
  }

  /**
   * Set primary media for an incident
   */
  async setPrimaryMedia(incidentId: string, mediaId: string, userId: string) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident) {
      throw new NotFoundError('Incident not found');
    }

    if (incident.userId !== userId) {
      throw new ForbiddenError('You can only modify your own incidents');
    }

    // Remove primary from all media
    await prisma.incidentMedia.updateMany({
      where: { incidentId },
      data: { isPrimary: false },
    });

    // Set new primary
    const media = await prisma.incidentMedia.update({
      where: { id: mediaId },
      data: { isPrimary: true },
    });

    return media;
  }
}
