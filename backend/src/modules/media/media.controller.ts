import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MediaService } from './media.service';
import {
  RequestUploadUrlDto,
  ConfirmUploadDto,
} from './dto/media.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { User, UserRole, ModerationStatus } from '@prisma/client';

@ApiTags('media')
@Controller('media')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('request-upload')
  @Throttle({ medium: { limit: 20, ttl: 60000 } }) // 20 uploads per minute
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Request presigned upload URL',
    description:
      'Get a presigned URL for direct upload from iOS. Use this URL to upload media directly to S3.',
  })
  @ApiResponse({
    status: 200,
    description: 'Presigned URL generated',
    schema: {
      properties: {
        uploadUrl: { type: 'string', description: 'Presigned URL for upload' },
        key: { type: 'string', description: 'S3 key for the file' },
        publicUrl: { type: 'string', description: 'Public URL after upload' },
        expiresAt: { type: 'string', format: 'date-time' },
        instructions: {
          type: 'object',
          properties: {
            method: { type: 'string', example: 'PUT' },
            headers: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async requestUploadUrl(
    @Body() dto: RequestUploadUrlDto,
    @CurrentUser() user: User,
  ) {
    return this.mediaService.requestUploadUrl(dto, user);
  }

  @Post('confirm-upload')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Confirm upload and create media record',
    description:
      'After uploading to S3 using the presigned URL, confirm the upload to create the media record',
  })
  @ApiResponse({ status: 201, description: 'Media record created' })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  async confirmUpload(
    @Body() dto: ConfirmUploadDto,
    @CurrentUser() user: User,
  ) {
    return this.mediaService.confirmUpload(dto, user);
  }

  @Get('incident/:incidentId')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get media for an incident',
    description: 'Fetch all approved media for a specific incident',
  })
  @ApiParam({ name: 'incidentId', description: 'Incident UUID' })
  async getMediaForIncident(
    @Param('incidentId', ParseUUIDPipe) incidentId: string,
  ) {
    return this.mediaService.getMediaForIncident(incidentId);
  }

  @Post(':id/primary')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Set media as primary',
    description: 'Set this media as the primary/featured media for the incident',
  })
  @ApiParam({ name: 'id', description: 'Media UUID' })
  async setPrimaryMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return this.mediaService.setPrimaryMedia(id, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete media',
    description: 'Delete media from incident (owner or admin only)',
  })
  @ApiParam({ name: 'id', description: 'Media UUID' })
  async deleteMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.mediaService.deleteMedia(id, user);
  }

  @Post(':id/moderate')
  @Roles(UserRole.ADMIN, UserRole.MODERATOR)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Moderate media (admin/moderator only)',
    description: 'Approve or reject media content',
  })
  @ApiParam({ name: 'id', description: 'Media UUID' })
  async moderateMedia(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: ModerationStatus; notes?: string },
  ) {
    return this.mediaService.moderateMedia(id, body.status, body.notes);
  }
}
