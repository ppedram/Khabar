import { z } from 'zod';

// Phone number validation (E.164 format)
const phoneNumberSchema = z
  .string()
  .min(10)
  .max(15)
  .regex(/^\+?[1-9]\d{9,14}$/, 'Invalid phone number format');

export const requestOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
});

export const verifyOtpSchema = z.object({
  phoneNumber: phoneNumberSchema,
  code: z.string().length(6, 'OTP must be 6 digits'),
  deviceToken: z.string().optional(),
  deviceType: z.enum(['IOS', 'ANDROID', 'WEB']).optional(),
  deviceName: z.string().max(100).optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
