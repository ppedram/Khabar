import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AppleAuthService } from './apple-auth.service';
import {
  AppleSignInDto,
  RefreshTokenDto,
  RegisterDeviceDto,
} from './dto/auth.dto';
import { User, AuthProvider } from '@prisma/client';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface AuthResponse extends TokenPair {
  user: Partial<User>;
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly appleAuthService: AppleAuthService,
  ) {}

  /**
   * Sign in with Apple
   */
  async signInWithApple(dto: AppleSignInDto): Promise<AuthResponse> {
    // Verify the Apple identity token
    const appleUser = await this.appleAuthService.verifyIdentityToken(
      dto.identityToken,
    );

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { appleId: appleUser.appleId },
    });

    const isNewUser = !user;

    if (!user) {
      // Create new user
      user = await this.prisma.user.create({
        data: {
          appleId: appleUser.appleId,
          appleEmail: appleUser.email,
          email: appleUser.isPrivateEmail ? undefined : appleUser.email,
          emailVerified: appleUser.emailVerified,
          authProvider: AuthProvider.APPLE,
          displayName: dto.fullName || undefined,
          settings: {
            create: {
              notificationRadiusKm: 5.0,
              notificationsEnabled: true,
            },
          },
        },
      });

      this.logger.log(`New user created via Apple Sign-in: ${user.id}`);
    } else {
      // Update last active
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastActiveAt: new Date(),
          // Update email if it changed and was previously private
          appleEmail: appleUser.email || user.appleEmail,
        },
      });
    }

    // Check if user is banned
    if (user.isBanned) {
      throw new UnauthorizedException(
        user.banReason || 'Your account has been suspended',
      );
    }

    // Register device if provided
    if (dto.deviceToken && dto.deviceType) {
      await this.registerDevice({
        deviceToken: dto.deviceToken,
        deviceType: dto.deviceType,
        deviceName: dto.deviceName,
        deviceModel: dto.deviceModel,
        osVersion: dto.osVersion,
        appVersion: dto.appVersion,
        apnsToken: dto.apnsToken,
      }, user.id);
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    return {
      ...tokens,
      user: this.sanitizeUser(user),
      isNewUser,
    };
  }

  /**
   * Refresh access token
   */
  async refreshToken(dto: RefreshTokenDto): Promise<TokenPair> {
    // Hash the refresh token to compare with stored hash
    const tokenHash = await this.hashToken(dto.refreshToken);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Check if user is banned
    if (storedToken.user.isBanned) {
      // Revoke all tokens for banned user
      await this.revokeAllUserTokens(storedToken.user.id);
      throw new UnauthorizedException('Your account has been suspended');
    }

    // Revoke the old refresh token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    return this.generateTokens(storedToken.user, storedToken.deviceId || undefined);
  }

  /**
   * Register or update device for push notifications
   */
  async registerDevice(
    dto: RegisterDeviceDto,
    userId: string,
  ): Promise<void> {
    await this.prisma.userDevice.upsert({
      where: {
        userId_deviceToken: {
          userId,
          deviceToken: dto.deviceToken,
        },
      },
      create: {
        userId,
        deviceToken: dto.deviceToken,
        deviceType: dto.deviceType,
        deviceName: dto.deviceName,
        deviceModel: dto.deviceModel,
        osVersion: dto.osVersion,
        appVersion: dto.appVersion,
        apnsToken: dto.apnsToken,
        apnsEnvironment: dto.apnsToken ? 'production' : undefined,
        lastUsedAt: new Date(),
      },
      update: {
        deviceName: dto.deviceName,
        deviceModel: dto.deviceModel,
        osVersion: dto.osVersion,
        appVersion: dto.appVersion,
        apnsToken: dto.apnsToken,
        isActive: true,
        lastUsedAt: new Date(),
      },
    });
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(refreshToken: string, userId: string): Promise<void> {
    const tokenHash = await this.hashToken(refreshToken);

    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        tokenHash,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Logout from all devices
   */
  async logoutAll(userId: string): Promise<void> {
    await this.revokeAllUserTokens(userId);
  }

  /**
   * Validate user for JWT strategy
   */
  async validateUser(userId: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.isBanned) {
      return null;
    }

    return user;
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(
    user: User,
    deviceId?: string,
  ): Promise<TokenPair> {
    const payload = {
      sub: user.id,
      email: user.email,
      appleId: user.appleId,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    // Generate refresh token
    const refreshToken = this.generateRefreshToken();
    const tokenHash = await this.hashToken(refreshToken);

    // Calculate expiry
    const refreshExpiresIn = this.configService.get<string>(
      'jwt.refreshExpiresIn',
    ) || '7d';
    const expiresAt = this.calculateExpiry(refreshExpiresIn);

    // Store refresh token
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        deviceId,
        expiresAt,
      },
    });

    // Get access token expiry in seconds
    const accessExpiresIn = this.configService.get<string>(
      'jwt.accessExpiresIn',
    ) || '15m';
    const expiresIn = this.parseExpiryToSeconds(accessExpiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * Generate a secure refresh token
   */
  private generateRefreshToken(): string {
    const { randomBytes } = require('crypto');
    return randomBytes(64).toString('base64url');
  }

  /**
   * Hash a token for storage
   */
  private async hashToken(token: string): Promise<string> {
    const { createHash } = require('crypto');
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Calculate expiry date from duration string
   */
  private calculateExpiry(duration: string): Date {
    const seconds = this.parseExpiryToSeconds(duration);
    return new Date(Date.now() + seconds * 1000);
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default 15 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }

  /**
   * Revoke all tokens for a user
   */
  private async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Remove sensitive fields from user object
   */
  private sanitizeUser(user: User): Partial<User> {
    const { appleRefreshToken, ...sanitized } = user;
    return sanitized;
  }
}
