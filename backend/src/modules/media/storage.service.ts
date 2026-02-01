import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

interface UploadOptions {
  folder?: string;
  contentType?: string;
  metadata?: Record<string, string>;
}

interface PresignedUrlOptions {
  expiresIn?: number; // seconds
  contentType?: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('s3.endpoint');
    const region = this.configService.get<string>('s3.region') || 'us-east-1';
    const accessKey = this.configService.get<string>('s3.accessKey');
    const secretKey = this.configService.get<string>('s3.secretKey');

    this.bucketName =
      this.configService.get<string>('s3.bucketName') || 'khabar-media';
    this.publicUrl = this.configService.get<string>('s3.publicUrl') || '';

    this.s3Client = new S3Client({
      endpoint,
      region,
      credentials: {
        accessKeyId: accessKey || '',
        secretAccessKey: secretKey || '',
      },
      forcePathStyle: true, // Required for MinIO
    });
  }

  /**
   * Upload a file to S3
   */
  async uploadFile(
    buffer: Buffer,
    originalName: string,
    options: UploadOptions = {},
  ): Promise<{ key: string; url: string }> {
    const extension = this.getExtension(originalName);
    const folder = options.folder || 'uploads';
    const key = `${folder}/${uuidv4()}${extension}`;

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: buffer,
          ContentType: options.contentType || this.getMimeType(extension),
          Metadata: options.metadata,
        }),
      );

      const url = this.getPublicUrl(key);
      this.logger.log(`File uploaded: ${key}`);

      return { key, url };
    } catch (error) {
      this.logger.error('Failed to upload file:', error);
      throw new BadRequestException('Failed to upload file');
    }
  }

  /**
   * Generate a presigned URL for direct upload from iOS app
   */
  async getPresignedUploadUrl(
    fileName: string,
    options: PresignedUrlOptions = {},
  ): Promise<{
    uploadUrl: string;
    key: string;
    publicUrl: string;
    expiresAt: Date;
  }> {
    const extension = this.getExtension(fileName);
    const folder = this.getFolderForType(options.contentType);
    const key = `${folder}/${uuidv4()}${extension}`;

    const expiresIn = options.expiresIn || 3600; // Default 1 hour

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        ContentType: options.contentType,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn,
      });

      const publicUrl = this.getPublicUrl(key);
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      return {
        uploadUrl,
        key,
        publicUrl,
        expiresAt,
      };
    } catch (error) {
      this.logger.error('Failed to generate presigned URL:', error);
      throw new BadRequestException('Failed to generate upload URL');
    }
  }

  /**
   * Generate a presigned URL for downloading private content
   */
  async getPresignedDownloadUrl(
    key: string,
    expiresIn = 3600,
  ): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, command, { expiresIn });
    } catch (error) {
      this.logger.error('Failed to generate download URL:', error);
      throw new BadRequestException('Failed to generate download URL');
    }
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      this.logger.log(`File deleted: ${key}`);
    } catch (error) {
      this.logger.error('Failed to delete file:', error);
      throw new BadRequestException('Failed to delete file');
    }
  }

  /**
   * Validate file type for iOS media
   */
  validateFileType(
    contentType: string,
    type: 'image' | 'video',
  ): boolean {
    const allowedImages = this.configService.get<string[]>(
      'media.allowedImageTypes',
    ) || ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

    const allowedVideos = this.configService.get<string[]>(
      'media.allowedVideoTypes',
    ) || ['video/mp4', 'video/quicktime', 'video/x-m4v'];

    if (type === 'image') {
      return allowedImages.includes(contentType);
    }

    return allowedVideos.includes(contentType);
  }

  /**
   * Validate file size
   */
  validateFileSize(sizeBytes: number, type: 'image' | 'video'): boolean {
    const maxImageMb =
      this.configService.get<number>('media.maxImageSizeMb') || 10;
    const maxVideoMb =
      this.configService.get<number>('media.maxVideoSizeMb') || 100;

    const maxBytes =
      type === 'image' ? maxImageMb * 1024 * 1024 : maxVideoMb * 1024 * 1024;

    return sizeBytes <= maxBytes;
  }

  /**
   * Get public URL for a key
   */
  private getPublicUrl(key: string): string {
    if (this.publicUrl) {
      return `${this.publicUrl}/${key}`;
    }
    const endpoint = this.configService.get<string>('s3.endpoint');
    return `${endpoint}/${this.bucketName}/${key}`;
  }

  /**
   * Get file extension
   */
  private getExtension(fileName: string): string {
    const parts = fileName.split('.');
    if (parts.length > 1) {
      return `.${parts[parts.length - 1].toLowerCase()}`;
    }
    return '';
  }

  /**
   * Get MIME type from extension
   */
  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.heic': 'image/heic',
      '.heif': 'image/heif',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.m4v': 'video/x-m4v',
    };
    return mimeTypes[extension] || 'application/octet-stream';
  }

  /**
   * Get folder based on content type
   */
  private getFolderForType(contentType?: string): string {
    if (contentType?.startsWith('image/')) {
      return 'images';
    }
    if (contentType?.startsWith('video/')) {
      return 'videos';
    }
    return 'uploads';
  }
}
