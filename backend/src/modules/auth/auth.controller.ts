import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './auth.service.js';
import {
  requestOtpSchema,
  verifyOtpSchema,
  refreshTokenSchema,
  type RequestOtpInput,
  type VerifyOtpInput,
  type RefreshTokenInput,
} from './auth.schema.js';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/request-otp
   * Request OTP for phone verification
   */
  async requestOtp(
    request: FastifyRequest<{ Body: RequestOtpInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const data = requestOtpSchema.parse(request.body);
    const result = await this.authService.requestOtp(data);

    reply.status(200).send({
      success: true,
      data: result,
    });
  }

  /**
   * POST /auth/verify-otp
   * Verify OTP and get tokens
   */
  async verifyOtp(
    request: FastifyRequest<{ Body: VerifyOtpInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const data = verifyOtpSchema.parse(request.body);
    const result = await this.authService.verifyOtp(data);

    reply.status(200).send({
      success: true,
      data: result,
    });
  }

  /**
   * POST /auth/refresh
   * Refresh access token
   */
  async refresh(
    request: FastifyRequest<{ Body: RefreshTokenInput }>,
    reply: FastifyReply
  ): Promise<void> {
    const { refreshToken } = refreshTokenSchema.parse(request.body);
    const result = await this.authService.refreshAccessToken(refreshToken);

    reply.status(200).send({
      success: true,
      data: result,
    });
  }

  /**
   * POST /auth/logout
   * Logout and revoke refresh token
   */
  async logout(
    request: FastifyRequest<{ Body: { refreshToken?: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const userId = request.user!.sub;
    const { refreshToken } = request.body ?? {};

    await this.authService.logout(userId, refreshToken);

    reply.status(200).send({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  }

  /**
   * DELETE /auth/logout-all
   * Logout from all devices
   */
  async logoutAll(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const userId = request.user!.sub;

    await this.authService.logoutAll(userId);

    reply.status(200).send({
      success: true,
      data: { message: 'Logged out from all devices' },
    });
  }
}
