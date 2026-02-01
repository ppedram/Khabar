import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsJWT,
} from 'class-validator';
import { DeviceType } from '@prisma/client';

export class AppleSignInDto {
  @ApiProperty({
    description: 'Apple identity token from Sign in with Apple',
    example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  identityToken: string;

  @ApiPropertyOptional({
    description: 'User full name (only provided on first sign-in)',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Device token for identification',
    example: 'device-unique-id',
  })
  @IsOptional()
  @IsString()
  deviceToken?: string;

  @ApiPropertyOptional({
    description: 'Device type',
    enum: DeviceType,
    example: 'IOS',
  })
  @IsOptional()
  @IsEnum(DeviceType)
  deviceType?: DeviceType;

  @ApiPropertyOptional({
    description: 'Device name',
    example: 'iPhone 15 Pro',
  })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({
    description: 'Device model',
    example: 'iPhone16,1',
  })
  @IsOptional()
  @IsString()
  deviceModel?: string;

  @ApiPropertyOptional({
    description: 'OS version',
    example: '17.2',
  })
  @IsOptional()
  @IsString()
  osVersion?: string;

  @ApiPropertyOptional({
    description: 'App version',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional({
    description: 'APNs device token for push notifications',
    example: 'abc123...',
  })
  @IsOptional()
  @IsString()
  apnsToken?: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token',
    example: 'dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class RegisterDeviceDto {
  @ApiProperty({
    description: 'Device token for identification',
    example: 'device-unique-id',
  })
  @IsString()
  @IsNotEmpty()
  deviceToken: string;

  @ApiProperty({
    description: 'Device type',
    enum: DeviceType,
    example: 'IOS',
  })
  @IsEnum(DeviceType)
  deviceType: DeviceType;

  @ApiPropertyOptional({
    description: 'Device name',
    example: 'iPhone 15 Pro',
  })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({
    description: 'Device model',
    example: 'iPhone16,1',
  })
  @IsOptional()
  @IsString()
  deviceModel?: string;

  @ApiPropertyOptional({
    description: 'OS version',
    example: '17.2',
  })
  @IsOptional()
  @IsString()
  osVersion?: string;

  @ApiPropertyOptional({
    description: 'App version',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString()
  appVersion?: string;

  @ApiPropertyOptional({
    description: 'APNs device token for push notifications',
    example: 'abc123...',
  })
  @IsOptional()
  @IsString()
  apnsToken?: string;
}

export class LogoutDto {
  @ApiProperty({
    description: 'Refresh token to revoke',
    example: 'dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4...',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
