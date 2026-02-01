import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsUUID,
  Min,
  MaxLength,
  IsDateString,
} from 'class-validator';

export class RequestUploadUrlDto {
  @ApiProperty({
    description: 'Original file name',
    example: 'incident_video.mov',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'video/quicktime',
  })
  @IsString()
  @IsNotEmpty()
  contentType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 10485760,
  })
  @IsNumber()
  @Min(1)
  fileSize: number;

  @ApiPropertyOptional({
    description: 'Video duration in seconds (required for videos)',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationSeconds?: number;
}

export class ConfirmUploadDto {
  @ApiProperty({
    description: 'Incident ID to attach media to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  incidentId: string;

  @ApiProperty({
    description: 'S3 key returned from request-upload',
    example: 'videos/abc123.mov',
  })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({
    description: 'Public URL returned from request-upload',
    example: 'https://s3.example.com/khabar-media/videos/abc123.mov',
  })
  @IsString()
  @IsNotEmpty()
  publicUrl: string;

  @ApiProperty({
    description: 'Original file name',
    example: 'incident_video.mov',
  })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({
    description: 'MIME type',
    example: 'video/quicktime',
  })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 10485760,
  })
  @IsNumber()
  @Min(1)
  fileSize: number;

  @ApiPropertyOptional({
    description: 'Video duration in seconds',
    example: 30,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationSeconds?: number;

  @ApiPropertyOptional({
    description: 'Media width in pixels',
    example: 1920,
  })
  @IsOptional()
  @IsNumber()
  width?: number;

  @ApiPropertyOptional({
    description: 'Media height in pixels',
    example: 1080,
  })
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional({
    description: 'Device model that captured the media',
    example: 'iPhone 15 Pro',
  })
  @IsOptional()
  @IsString()
  deviceModel?: string;

  @ApiPropertyOptional({
    description: 'When the media was captured (ISO 8601)',
    example: '2024-01-15T10:30:00Z',
  })
  @IsOptional()
  @IsDateString()
  capturedAt?: string;
}

export class CreateMediaDto extends ConfirmUploadDto {}
