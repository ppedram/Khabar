import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  AppleSignInDto,
  RefreshTokenDto,
  RegisterDeviceDto,
  LogoutDto,
} from './dto/auth.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User } from '@prisma/client';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @ApiOperation({
    summary: 'Sign in with Apple',
    description:
      'Authenticate using Apple identity token. Creates a new user if first time.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        expiresIn: { type: 'number' },
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            appleId: { type: 'string' },
            email: { type: 'string' },
            displayName: { type: 'string' },
            role: { type: 'string' },
            reputationScore: { type: 'number' },
          },
        },
        isNewUser: { type: 'boolean' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid Apple identity token' })
  async signInWithApple(@Body() dto: AppleSignInDto) {
    return this.authService.signInWithApple(dto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Exchange a refresh token for a new access token',
  })
  @ApiResponse({
    status: 200,
    description: 'New tokens generated',
    schema: {
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        expiresIn: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('device')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Register device for push notifications',
    description: 'Register or update device token for APNs',
  })
  @ApiResponse({ status: 200, description: 'Device registered successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async registerDevice(
    @Body() dto: RegisterDeviceDto,
    @CurrentUser() user: User,
  ) {
    await this.authService.registerDevice(dto, user.id);
    return { message: 'Device registered successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Logout',
    description: 'Revoke the current refresh token',
  })
  @ApiResponse({ status: 200, description: 'Successfully logged out' })
  async logout(@Body() dto: LogoutDto, @CurrentUser() user: User) {
    await this.authService.logout(dto.refreshToken, user.id);
    return { message: 'Successfully logged out' };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Logout from all devices',
    description: 'Revoke all refresh tokens for the user',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully logged out from all devices',
  })
  async logoutAll(@CurrentUser() user: User) {
    await this.authService.logoutAll(user.id);
    return { message: 'Successfully logged out from all devices' };
  }
}
