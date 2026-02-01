import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
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
  ApiQuery,
} from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { IncidentsService } from './incidents.service';
import {
  CreateIncidentDto,
  UpdateIncidentDto,
  NearbyIncidentsDto,
  BoundingBoxDto,
  VoteDto,
  ResolveIncidentDto,
} from './dto/incidents.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { User, UserRole } from '@prisma/client';

@ApiTags('incidents')
@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  @Throttle({ short: { limit: 3, ttl: 60000 } }) // 3 incidents per minute
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a new incident',
    description: 'Report a new safety incident with geolocation',
  })
  @ApiResponse({
    status: 201,
    description: 'Incident created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async create(
    @Body() createIncidentDto: CreateIncidentDto,
    @CurrentUser() user: User,
  ) {
    return this.incidentsService.create(createIncidentDto, user);
  }

  @Get('nearby')
  @Public()
  @SkipThrottle()
  @ApiOperation({
    summary: 'Get incidents within radius',
    description: 'Fetch incidents within a specified radius using PostGIS',
  })
  @ApiResponse({
    status: 200,
    description: 'List of nearby incidents with distance',
  })
  async findNearby(@Query() query: NearbyIncidentsDto) {
    return this.incidentsService.findNearby(query);
  }

  @Get('bbox')
  @Public()
  @SkipThrottle()
  @ApiOperation({
    summary: 'Get incidents in bounding box',
    description: 'Fetch incidents within a map bounding box for map view',
  })
  @ApiResponse({
    status: 200,
    description: 'List of incidents in bounding box',
  })
  async findInBoundingBox(@Query() query: BoundingBoxDto) {
    return this.incidentsService.findInBoundingBox(query);
  }

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get my incidents',
    description: 'Fetch incidents created by the authenticated user',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async findMyIncidents(
    @CurrentUser() user: User,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.incidentsService.findByUser(
      user.id,
      limit || 20,
      offset || 0,
    );
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'Get incident by ID',
    description: 'Fetch a single incident with full details',
  })
  @ApiParam({ name: 'id', description: 'Incident UUID' })
  @ApiResponse({ status: 200, description: 'Incident details' })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: User,
  ) {
    return this.incidentsService.findOne(id, user?.id);
  }

  @Put(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update an incident',
    description: 'Update incident details (owner or admin only)',
  })
  @ApiParam({ name: 'id', description: 'Incident UUID' })
  @ApiResponse({ status: 200, description: 'Incident updated' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateIncidentDto: UpdateIncidentDto,
    @CurrentUser() user: User,
  ) {
    return this.incidentsService.update(id, updateIncidentDto, user);
  }

  @Post(':id/vote')
  @ApiBearerAuth('JWT-auth')
  @Throttle({ medium: { limit: 30, ttl: 60000 } }) // 30 votes per minute
  @ApiOperation({
    summary: 'Vote on an incident',
    description: 'Upvote, downvote, or verify an incident',
  })
  @ApiParam({ name: 'id', description: 'Incident UUID' })
  @ApiResponse({ status: 200, description: 'Vote recorded' })
  @ApiResponse({ status: 403, description: 'Cannot vote on own incident' })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  async vote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() voteDto: VoteDto,
    @CurrentUser() user: User,
  ) {
    return this.incidentsService.vote(id, voteDto, user);
  }

  @Post(':id/resolve')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Resolve an incident',
    description: 'Mark an incident as resolved (owner/mod/admin)',
  })
  @ApiParam({ name: 'id', description: 'Incident UUID' })
  @ApiResponse({ status: 200, description: 'Incident resolved' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  async resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveIncidentDto,
    @CurrentUser() user: User,
  ) {
    return this.incidentsService.resolve(id, dto.resolutionNote, user);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete an incident',
    description: 'Delete an incident (owner or admin only)',
  })
  @ApiParam({ name: 'id', description: 'Incident UUID' })
  @ApiResponse({ status: 204, description: 'Incident deleted' })
  @ApiResponse({ status: 403, description: 'Not authorized' })
  @ApiResponse({ status: 404, description: 'Incident not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.incidentsService.remove(id, user);
  }
}
