import { z } from 'zod';

export const createIncidentSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().min(5).max(200),
  description: z.string().max(2000).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  neighborhood: z.string().max(100).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  isAnonymous: z.boolean().default(false),
});

export const updateIncidentSchema = z.object({
  title: z.string().min(5).max(200).optional(),
  description: z.string().max(2000).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
});

export const nearbyIncidentsSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(0.1).max(50).default(5), // km
  category: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'VERIFIED', 'RESOLVED', 'REJECTED', 'EXPIRED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  since: z.coerce.date().optional(), // Only incidents since this date
});

export const mapIncidentsSchema = z.object({
  minLat: z.coerce.number().min(-90).max(90),
  maxLat: z.coerce.number().min(-90).max(90),
  minLng: z.coerce.number().min(-180).max(180),
  maxLng: z.coerce.number().min(-180).max(180),
  categories: z.string().optional(), // comma-separated UUIDs
  status: z.enum(['PENDING', 'VERIFIED', 'RESOLVED', 'REJECTED', 'EXPIRED']).optional(),
});

export const listIncidentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'VERIFIED', 'RESOLVED', 'REJECTED', 'EXPIRED']).optional(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  userId: z.string().uuid().optional(),
  sortBy: z.enum(['createdAt', 'severity', 'upvotesCount']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const addUpdateSchema = z.object({
  content: z.string().min(1).max(1000),
  updateType: z.enum(['STATUS_CHANGE', 'INFO_UPDATE', 'RESOLUTION']).default('INFO_UPDATE'),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;
export type NearbyIncidentsQuery = z.infer<typeof nearbyIncidentsSchema>;
export type MapIncidentsQuery = z.infer<typeof mapIncidentsSchema>;
export type ListIncidentsQuery = z.infer<typeof listIncidentsSchema>;
export type AddUpdateInput = z.infer<typeof addUpdateSchema>;
