import { z } from 'zod';

export const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  displayName: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
});

export const updateSettingsSchema = z.object({
  notificationRadiusKm: z.number().min(0.5).max(50).optional(),
  notificationsEnabled: z.boolean().optional(),
  notifyCategories: z.array(z.string().uuid()).optional(),
  quietHoursStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)')
    .optional()
    .nullable(),
  quietHoursEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Invalid time format (HH:mm)')
    .optional()
    .nullable(),
  homeLocationLat: z.number().min(-90).max(90).optional().nullable(),
  homeLocationLng: z.number().min(-180).max(180).optional().nullable(),
});

export const registerDeviceSchema = z.object({
  deviceToken: z.string().min(1),
  deviceType: z.enum(['IOS', 'ANDROID', 'WEB']),
  deviceName: z.string().max(100).optional(),
});

export const reportUserSchema = z.object({
  reason: z.enum(['SPAM', 'HARASSMENT', 'FALSE_INFO', 'INAPPROPRIATE', 'OTHER']),
  description: z.string().max(1000).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type ReportUserInput = z.infer<typeof reportUserSchema>;
