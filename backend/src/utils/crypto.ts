import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config } from '../config/index.js';

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, config.bcryptRounds);
}

/**
 * Compare a password with its hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a cryptographically secure random token
 */
export function generateToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash a token for storage (for refresh tokens)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a random OTP (for phone verification fallback)
 */
export function generateOTP(length = 6): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[crypto.randomInt(0, 10)];
  }
  return otp;
}

/**
 * Generate a secure random ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Sanitize a string to prevent XSS
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Mask phone number for display (show last 4 digits)
 */
export function maskPhoneNumber(phone: string): string {
  if (phone.length <= 4) return phone;
  return '*'.repeat(phone.length - 4) + phone.slice(-4);
}

/**
 * Mask email for display
 */
export function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!localPart || !domain) return email;

  const maskedLocal =
    localPart.length <= 2
      ? '*'.repeat(localPart.length)
      : localPart[0] + '*'.repeat(localPart.length - 2) + localPart.slice(-1);

  return `${maskedLocal}@${domain}`;
}
