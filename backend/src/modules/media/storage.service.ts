import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/crypto.js';

const s3Client = new S3Client({
  endpoint: config.s3.endpoint,
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: true, // Required for MinIO
});

export interface UploadResult {
  key: string;
  url: string;
  contentType: string;
  size: number;
}

export class StorageService {
  /**
   * Upload a file to S3/MinIO
   */
  async uploadFile(
    buffer: Buffer,
    originalName: string,
    contentType: string,
    folder = 'uploads'
  ): Promise<UploadResult> {
    const extension = originalName.split('.').pop() ?? 'bin';
    const key = `${folder}/${generateId()}.${extension}`;

    try {
      await s3Client.send(
        new PutObjectCommand({
          Bucket: config.s3.bucketName,
          Key: key,
          Body: buffer,
          ContentType: contentType,
          CacheControl: 'max-age=31536000', // 1 year
        })
      );

      logger.info({ key, size: buffer.length }, 'File uploaded to S3');

      return {
        key,
        url: `${config.s3.publicUrl}/${key}`,
        contentType,
        size: buffer.length,
      };
    } catch (error) {
      logger.error({ error, key }, 'Failed to upload file to S3');
      throw error;
    }
  }

  /**
   * Delete a file from S3/MinIO
   */
  async deleteFile(key: string): Promise<void> {
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: config.s3.bucketName,
          Key: key,
        })
      );

      logger.info({ key }, 'File deleted from S3');
    } catch (error) {
      logger.error({ error, key }, 'Failed to delete file from S3');
      throw error;
    }
  }

  /**
   * Generate a presigned URL for direct upload
   */
  async getUploadUrl(
    key: string,
    contentType: string,
    expiresIn = 3600
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: config.s3.bucketName,
      Key: key,
      ContentType: contentType,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * Generate a presigned URL for download
   */
  async getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: config.s3.bucketName,
      Key: key,
    });

    return getSignedUrl(s3Client, command, { expiresIn });
  }

  /**
   * Get the public URL for a file
   */
  getPublicUrl(key: string): string {
    return `${config.s3.publicUrl}/${key}`;
  }

  /**
   * Validate file type
   */
  isAllowedImageType(contentType: string): boolean {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    return allowed.includes(contentType);
  }

  /**
   * Validate video type
   */
  isAllowedVideoType(contentType: string): boolean {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime'];
    return allowed.includes(contentType);
  }
}
