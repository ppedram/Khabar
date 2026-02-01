import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  IsLatitude,
  IsLongitude,
  MinLength,
  MaxLength,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Display name',
    example: 'John Doe',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({
    description: 'Username (alphanumeric and underscores only)',
    example: 'johndoe',
    minLength: 3,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'Username can only contain letters, numbers, and underscores',
  })
  username?: string;

  @ApiPropertyOptional({
    description: 'Avatar URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsOptional()
  @IsString()
  avatarUrl?: string;
}

export class UpdateSettingsDto {
  @ApiPropertyOptional({
    description: 'Notification radius in kilometers',
    example: 5.0,
    minimum: 0.1,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0.1)
  @Max(50)
  notificationRadiusKm?: number;

  @ApiPropertyOptional({
    description: 'Enable/disable notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Category IDs to receive notifications for',
    example: ['uuid1', 'uuid2'],
  })
  @IsOptional()
  @IsArray()
  notifyCategories?: string[];

  @ApiPropertyOptional({
    description: 'Quiet hours start time (HH:MM format)',
    example: '22:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Time must be in HH:MM format',
  })
  quietHoursStart?: string;

  @ApiPropertyOptional({
    description: 'Quiet hours end time (HH:MM format)',
    example: '07:00',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Time must be in HH:MM format',
  })
  quietHoursEnd?: string;

  @ApiPropertyOptional({
    description: 'Home location latitude',
    example: 37.7749,
  })
  @IsOptional()
  @IsNumber()
  @IsLatitude()
  @Type(() => Number)
  homeLocationLat?: number;

  @ApiPropertyOptional({
    description: 'Home location longitude',
    example: -122.4194,
  })
  @IsOptional()
  @IsNumber()
  @IsLongitude()
  @Type(() => Number)
  homeLocationLng?: number;

  @ApiPropertyOptional({
    description: 'User timezone',
    example: 'America/Los_Angeles',
  })
  @IsOptional()
  @IsString()
  timezone?: string;
}
