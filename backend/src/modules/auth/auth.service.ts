import type { FastifyInstance } from 'fastify';
import Twilio from 'twilio';
import { prisma } from '../../config/database.js';
import { cache } from '../../config/redis.js';
import { config } from '../../config/index.js';
import { logger } from '../../utils/logger.js';
import { generateToken, hashToken, generateOTP } from '../../utils/crypto.js';
import {
  UnauthorizedError,
  BadRequestError,
  TooManyRequestsError,
} from '../../utils/errors.js';
import type { RequestOtpInput, VerifyOtpInput } from './auth.schema.js';
import type { JWTPayload } from '../../types/fastify.js';

// Initialize Twilio client
const twilioClient = config.twilio.accountSid
  ? Twilio(config.twilio.accountSid, config.twilio.authToken)
  : null;

export class AuthService {
  constructor(private readonly fastify: FastifyInstance) {}

  /**
   * Request OTP for phone verification
   */
  async requestOtp(data: RequestOtpInput): Promise<{ message: string }> {
    const { phoneNumber } = data;

    // Check rate limit (additional to global)
    const rateLimitKey = `otp_rate:${phoneNumber}`;
    const attempts = await cache.get<number>(rateLimitKey);
    if (attempts && attempts >= 3) {
      throw new TooManyRequestsError(
        'Too many OTP requests. Please wait 10 minutes before trying again.'
      );
    }

    // Use Twilio Verify if configured
    if (twilioClient && config.twilio.verifyServiceSid) {
      try {
        await twilioClient.verify.v2
          .services(config.twilio.verifyServiceSid)
          .verifications.create({
            to: phoneNumber,
            channel: 'sms',
          });

        logger.info({ phoneNumber: phoneNumber.slice(-4) }, 'OTP sent via Twilio');
      } catch (error) {
        logger.error({ error }, 'Twilio verification failed');
        throw new BadRequestError('Failed to send verification code');
      }
    } else {
      // Development fallback: generate and store OTP in Redis
      const otp = generateOTP();
      await cache.set(`otp:${phoneNumber}`, otp, 300); // 5 minutes expiry
      logger.info({ phoneNumber: phoneNumber.slice(-4), otp }, 'DEV OTP generated');
    }

    // Update rate limit
    const newAttempts = (attempts ?? 0) + 1;
    await cache.set(rateLimitKey, newAttempts, 600); // 10 minutes

    return { message: 'Verification code sent' };
  }

  /**
   * Verify OTP and issue tokens
   */
  async verifyOtp(
    data: VerifyOtpInput
  ): Promise<{ accessToken: string; refreshToken: string; user: object }> {
    const { phoneNumber, code, deviceToken, deviceType, deviceName } = data;

    // Verify OTP
    let isValid = false;

    if (twilioClient && config.twilio.verifyServiceSid) {
      try {
        const verification = await twilioClient.verify.v2
          .services(config.twilio.verifyServiceSid)
          .verificationChecks.create({
            to: phoneNumber,
            code,
          });

        isValid = verification.status === 'approved';
      } catch (error) {
        logger.error({ error }, 'Twilio verification check failed');
        throw new UnauthorizedError('Invalid verification code');
      }
    } else {
      // Development fallback: check Redis
      const storedOtp = await cache.get<string>(`otp:${phoneNumber}`);
      isValid = storedOtp === code;
      if (isValid) {
        await cache.del(`otp:${phoneNumber}`);
      }
    }

    if (!isValid) {
      throw new UnauthorizedError('Invalid verification code');
    }

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { phoneNumber },
      include: { settings: true },
    });

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          phoneNumber,
          phoneVerified: true,
          settings: {
            create: {
              notificationRadiusKm: config.geo.defaultSearchRadiusKm,
              notificationsEnabled: true,
            },
          },
        },
        include: { settings: true },
      });
      logger.info({ userId: user.id }, 'New user created');
    } else if (!user.phoneVerified) {
      // Mark phone as verified
      user = await prisma.user.update({
        where: { id: user.id },
        data: { phoneVerified: true },
        include: { settings: true },
      });
    }

    // Register device if provided
    let deviceId: string | null = null;
    if (deviceToken && deviceType) {
      const device = await prisma.userDevice.upsert({
        where: {
          userId_deviceToken: {
            userId: user.id,
            deviceToken,
          },
        },
        update: {
          deviceType,
          deviceName,
          isActive: true,
          lastUsedAt: new Date(),
        },
        create: {
          userId: user.id,
          deviceToken,
          deviceType,
          deviceName,
          isActive: true,
        },
      });
      deviceId = device.id;
    }

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.createRefreshToken(user.id, deviceId);

    // Update last active
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActiveAt: new Date() },
    });

    // Clear rate limit
    await cache.del(`otp_rate:${phoneNumber}`);

    return {
      accessToken,
      refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = hashToken(refreshToken);

    // Find valid refresh token
    const storedToken = await prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: true,
      },
    });

    if (!storedToken) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    if (storedToken.user.isBanned) {
      throw new UnauthorizedError('Account suspended');
    }

    // Revoke old token (token rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    const accessToken = this.generateAccessToken(storedToken.user);
    const newRefreshToken = await this.createRefreshToken(
      storedToken.userId,
      storedToken.deviceId
    );

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logout - revoke refresh token
   */
  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      await prisma.refreshToken.updateMany({
        where: {
          userId,
          tokenHash,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    }
  }

  /**
   * Logout from all devices
   */
  async logoutAll(userId: string): Promise<void> {
    await prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    // Deactivate all devices
    await prisma.userDevice.updateMany({
      where: { userId },
      data: { isActive: false },
    });
  }

  /**
   * Generate access token
   */
  private generateAccessToken(user: { id: string; phoneNumber: string; role: string }): string {
    const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
      sub: user.id,
      phone: user.phoneNumber,
      role: user.role as JWTPayload['role'],
    };

    return this.fastify.jwt.sign(payload);
  }

  /**
   * Create and store refresh token
   */
  private async createRefreshToken(
    userId: string,
    deviceId: string | null
  ): Promise<string> {
    const token = generateToken(48);
    const tokenHash = hashToken(token);

    // Parse refresh expiry (e.g., "7d" -> 7 days)
    const expiryMatch = config.jwt.refreshExpiry.match(/^(\d+)([dhms])$/);
    let expiresAt = new Date();
    if (expiryMatch) {
      const value = parseInt(expiryMatch[1] ?? '7', 10);
      const unit = expiryMatch[2];
      switch (unit) {
        case 'd':
          expiresAt.setDate(expiresAt.getDate() + value);
          break;
        case 'h':
          expiresAt.setHours(expiresAt.getHours() + value);
          break;
        case 'm':
          expiresAt.setMinutes(expiresAt.getMinutes() + value);
          break;
        case 's':
          expiresAt.setSeconds(expiresAt.getSeconds() + value);
          break;
      }
    } else {
      // Default to 7 days
      expiresAt.setDate(expiresAt.getDate() + 7);
    }

    await prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        deviceId,
        expiresAt,
      },
    });

    return token;
  }

  /**
   * Remove sensitive fields from user object
   */
  private sanitizeUser(user: {
    id: string;
    phoneNumber: string;
    email: string | null;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    role: string;
    reputationScore: number;
    createdAt: Date;
  }): object {
    return {
      id: user.id,
      phoneNumber: user.phoneNumber,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      reputationScore: user.reputationScore,
      createdAt: user.createdAt,
    };
  }
}
