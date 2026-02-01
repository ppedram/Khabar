import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsUUID,
  IsArray,
  Min,
  Max,
  MaxLength,
  IsLatitude,
  IsLongitude,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IncidentSeverity, IncidentStatus, VoteType } from '@prisma/client';

export class CreateIncidentDto {
  @ApiProperty({
    description: 'Category ID for the incident',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  categoryId: string;

  @ApiProperty({
    description: 'Incident title',
    example: 'Suspicious activity near park',
    maxLength: 200,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the incident',
    example: 'Saw someone looking into parked cars...',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Latitude (Google Maps format)',
    example: 37.7749,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @IsLatitude()
  @Type(() => Number)
  latitude: number;

  @ApiProperty({
    description: 'Longitude (Google Maps format)',
    example: -122.4194,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @IsLongitude()
  @Type(() => Number)
  longitude: number;

  @ApiPropertyOptional({
    description: 'Street address',
    example: '123 Main St',
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({
    description: 'City name',
    example: 'San Francisco',
  })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({
    description: 'Neighborhood name',
    example: 'Mission District',
  })
  @IsOptional()
  @IsString()
  neighborhood?: string;

  @ApiPropertyOptional({
    description: 'Postal code',
    example: '94103',
  })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({
    description: 'Incident severity level',
    enum: IncidentSeverity,
    default: 'MEDIUM',
  })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @ApiPropertyOptional({
    description: 'Post anonymously',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;
}

export class UpdateIncidentDto {
  @ApiPropertyOptional({
    description: 'Incident title',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description: 'Detailed description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Incident severity',
    enum: IncidentSeverity,
  })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;
}

export class NearbyIncidentsDto {
  @ApiProperty({
    description: 'Center latitude',
    example: 37.7749,
  })
  @IsNumber()
  @IsLatitude()
  @Type(() => Number)
  latitude: number;

  @ApiProperty({
    description: 'Center longitude',
    example: -122.4194,
  })
  @IsNumber()
  @IsLongitude()
  @Type(() => Number)
  longitude: number;

  @ApiPropertyOptional({
    description: 'Search radius in kilometers',
    default: 5,
    minimum: 0.1,
    maximum: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(50)
  @Type(() => Number)
  radiusKm?: number;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: IncidentStatus,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(IncidentStatus, { each: true })
  status?: IncidentStatus[];

  @ApiPropertyOptional({
    description: 'Filter by category ID',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'Limit results',
    default: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Offset for pagination',
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}

export class BoundingBoxDto {
  @ApiProperty({
    description: 'Minimum latitude (southwest corner)',
    example: 37.7,
  })
  @IsNumber()
  @IsLatitude()
  @Type(() => Number)
  minLat: number;

  @ApiProperty({
    description: 'Minimum longitude (southwest corner)',
    example: -122.5,
  })
  @IsNumber()
  @IsLongitude()
  @Type(() => Number)
  minLng: number;

  @ApiProperty({
    description: 'Maximum latitude (northeast corner)',
    example: 37.8,
  })
  @IsNumber()
  @IsLatitude()
  @Type(() => Number)
  maxLat: number;

  @ApiProperty({
    description: 'Maximum longitude (northeast corner)',
    example: -122.3,
  })
  @IsNumber()
  @IsLongitude()
  @Type(() => Number)
  maxLng: number;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: IncidentStatus,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsEnum(IncidentStatus, { each: true })
  status?: IncidentStatus[];

  @ApiPropertyOptional({
    description: 'Limit results',
    default: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number;
}

export class VoteDto {
  @ApiProperty({
    description: 'Type of vote',
    enum: VoteType,
    example: 'UPVOTE',
  })
  @IsEnum(VoteType)
  voteType: VoteType;
}

export class ResolveIncidentDto {
  @ApiProperty({
    description: 'Resolution note',
    example: 'Police arrived and situation resolved',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  resolutionNote: string;
}
