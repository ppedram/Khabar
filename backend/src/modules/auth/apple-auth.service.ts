import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as jwksClient from 'jwks-rsa';

interface AppleIdTokenPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string; // Apple's unique user identifier
  email?: string;
  email_verified?: string | boolean;
  is_private_email?: string | boolean;
  auth_time: number;
  nonce_supported: boolean;
}

interface AppleUserInfo {
  appleId: string;
  email?: string;
  emailVerified: boolean;
  isPrivateEmail: boolean;
}

@Injectable()
export class AppleAuthService {
  private readonly logger = new Logger(AppleAuthService.name);
  private readonly jwksClient: jwksClient.JwksClient;
  private readonly clientId: string;

  constructor(private readonly configService: ConfigService) {
    this.clientId = this.configService.get<string>('apple.clientId') || '';

    // Apple's JWKS endpoint for public keys
    this.jwksClient = jwksClient({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      cacheMaxAge: 86400000, // 24 hours
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  /**
   * Verify Apple identity token and extract user info
   * @param identityToken - The identity token from Sign in with Apple
   * @returns User information from the token
   */
  async verifyIdentityToken(identityToken: string): Promise<AppleUserInfo> {
    try {
      // Decode the token header to get the key ID
      const decodedHeader = jwt.decode(identityToken, { complete: true });

      if (!decodedHeader || typeof decodedHeader === 'string') {
        throw new UnauthorizedException('Invalid Apple identity token format');
      }

      const keyId = decodedHeader.header.kid;

      // Get the public key from Apple's JWKS
      const publicKey = await this.getApplePublicKey(keyId);

      // Verify the token
      const payload = jwt.verify(identityToken, publicKey, {
        algorithms: ['RS256'],
        issuer: 'https://appleid.apple.com',
        audience: this.clientId,
      }) as AppleIdTokenPayload;

      // Validate the token payload
      this.validateTokenPayload(payload);

      return {
        appleId: payload.sub,
        email: payload.email,
        emailVerified:
          payload.email_verified === 'true' || payload.email_verified === true,
        isPrivateEmail:
          payload.is_private_email === 'true' ||
          payload.is_private_email === true,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error('Apple token verification failed:', error);

      if (error instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('Apple identity token has expired');
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedException('Invalid Apple identity token');
      }

      throw new UnauthorizedException('Failed to verify Apple identity token');
    }
  }

  /**
   * Get Apple's public key for token verification
   */
  private async getApplePublicKey(keyId: string): Promise<string> {
    try {
      const key = await this.jwksClient.getSigningKey(keyId);
      return key.getPublicKey();
    } catch (error) {
      this.logger.error('Failed to get Apple public key:', error);
      throw new UnauthorizedException('Unable to verify Apple identity token');
    }
  }

  /**
   * Validate the decoded token payload
   */
  private validateTokenPayload(payload: AppleIdTokenPayload): void {
    // Verify issuer
    if (payload.iss !== 'https://appleid.apple.com') {
      throw new UnauthorizedException('Invalid token issuer');
    }

    // Verify audience (should be your app's bundle identifier)
    if (payload.aud !== this.clientId) {
      throw new UnauthorizedException('Invalid token audience');
    }

    // Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      throw new UnauthorizedException('Token has expired');
    }

    // Verify the token was issued recently (within 10 minutes is reasonable)
    const tenMinutesAgo = now - 600;
    if (payload.iat < tenMinutesAgo) {
      this.logger.warn('Token was issued more than 10 minutes ago');
    }
  }

  /**
   * Generate a client secret for Apple (required for some flows)
   * This is used for web-based Sign in with Apple
   */
  generateClientSecret(): string {
    const teamId = this.configService.get<string>('apple.teamId');
    const keyId = this.configService.get<string>('apple.keyId');
    const privateKey = this.configService.get<string>('apple.privateKey');

    if (!teamId || !keyId || !privateKey) {
      throw new Error('Apple Sign-in configuration is incomplete');
    }

    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: teamId,
      iat: now,
      exp: now + 15777000, // 6 months
      aud: 'https://appleid.apple.com',
      sub: this.clientId,
    };

    return jwt.sign(payload, privateKey, {
      algorithm: 'ES256',
      keyid: keyId,
    });
  }
}
