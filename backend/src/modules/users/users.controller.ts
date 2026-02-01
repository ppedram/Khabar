import {
  Controller,
  Get,
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
import { UsersService } from './users.service';
import { UpdateProfileDto, UpdateSettingsDto } from './dto/users.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { User } from '@prisma/client';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get my profile',
    description: 'Get the authenticated user\'s full profile with settings',
  })
  @ApiResponse({ status: 200, description: 'User profile' })
  async getMyProfile(@CurrentUser() user: User) {
    return this.usersService.getMyProfile(user.id);
  }

  @Put('me')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update my profile',
    description: 'Update the authenticated user\'s profile',
  })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @ApiResponse({ status: 409, description: 'Username already taken' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Get('me/settings')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get my settings',
    description: 'Get the authenticated user\'s notification and app settings',
  })
  async getSettings(@CurrentUser() user: User) {
    return this.usersService.getSettings(user.id);
  }

  @Put('me/settings')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update my settings',
    description: 'Update notification radius, quiet hours, and other settings',
  })
  async updateSettings(
    @CurrentUser() user: User,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.usersService.updateSettings(user.id, dto);
  }

  @Get('me/incidents')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get my incidents',
    description: 'Get incidents created by the authenticated user',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getMyIncidents(
    @CurrentUser() user: User,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.usersService.getUserIncidents(user.id, limit, offset);
  }

  @Get('me/reputation')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get my reputation history',
    description: 'Get reputation change history for the authenticated user',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getMyReputationHistory(
    @CurrentUser() user: User,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.usersService.getReputationHistory(user.id, limit, offset);
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Delete my account',
    description: 'Permanently delete the authenticated user\'s account',
  })
  @ApiResponse({ status: 204, description: 'Account deleted' })
  async deleteAccount(@CurrentUser() user: User) {
    await this.usersService.deleteAccount(user.id);
  }

  @Get('leaderboard')
  @Public()
  @ApiOperation({
    summary: 'Get reputation leaderboard',
    description: 'Get top users by reputation score',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  async getLeaderboard(@Query('limit') limit?: number) {
    return this.usersService.getLeaderboard(limit || 10);
  }

  @Get('check-username/:username')
  @Public()
  @ApiOperation({
    summary: 'Check username availability',
    description: 'Check if a username is available',
  })
  @ApiParam({ name: 'username', description: 'Username to check' })
  async checkUsername(@Param('username') username: string) {
    const available = await this.usersService.checkUsernameAvailability(username);
    return { available };
  }

  @Get(':id')
  @Public()
  @ApiOperation({
    summary: 'Get public user profile',
    description: 'Get a user\'s public profile by ID',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({ status: 200, description: 'Public user profile' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getPublicProfile(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getPublicProfile(id);
  }

  @Get(':id/incidents')
  @Public()
  @ApiOperation({
    summary: 'Get user incidents',
    description: 'Get public incidents by a specific user',
  })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async getUserIncidents(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    return this.usersService.getUserIncidents(id, limit, offset);
  }
}
