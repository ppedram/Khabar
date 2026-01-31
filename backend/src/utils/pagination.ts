import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export function paginate<T>(
  data: T[],
  total: number,
  params: PaginationParams
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / params.limit);

  return {
    data,
    meta: {
      page: params.page,
      limit: params.limit,
      total,
      totalPages,
      hasMore: params.page < totalPages,
    },
  };
}

export function getSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function buildOrderBy(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc',
  allowedFields: string[],
  defaultField = 'createdAt'
): Record<string, 'asc' | 'desc'> {
  const field = sortBy && allowedFields.includes(sortBy) ? sortBy : defaultField;
  return { [field]: sortOrder };
}

// Cursor-based pagination for real-time feeds
export const cursorPaginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CursorPaginationParams = z.infer<typeof cursorPaginationSchema>;

export interface CursorPaginatedResult<T> {
  data: T[];
  meta: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export function cursorPaginate<T extends { id: string }>(
  data: T[],
  limit: number
): CursorPaginatedResult<T> {
  const hasMore = data.length > limit;
  const items = hasMore ? data.slice(0, limit) : data;
  const lastItem = items[items.length - 1];

  return {
    data: items,
    meta: {
      nextCursor: hasMore && lastItem ? lastItem.id : null,
      hasMore,
    },
  };
}
