import { prisma } from '../../config/database.js';
import { cache } from '../../config/redis.js';
import { NotFoundError } from '../../utils/errors.js';

const CACHE_KEY = 'categories:all';
const CACHE_TTL = 3600; // 1 hour

export class CategoryService {
  /**
   * Get all active categories
   */
  async getAllCategories() {
    // Try cache first
    const cached = await cache.get<object[]>(CACHE_KEY);
    if (cached) {
      return cached;
    }

    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    // Cache results
    await cache.set(CACHE_KEY, categories, CACHE_TTL);

    return categories;
  }

  /**
   * Get category by slug
   */
  async getCategoryBySlug(slug: string) {
    const category = await prisma.category.findUnique({
      where: { slug },
      include: {
        _count: {
          select: {
            incidents: {
              where: {
                status: { in: ['PENDING', 'VERIFIED'] },
              },
            },
          },
        },
      },
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    return category;
  }

  /**
   * Get category statistics
   */
  async getCategoryStats() {
    const stats = await prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        color: true,
        icon: true,
        _count: {
          select: {
            incidents: {
              where: {
                status: { in: ['PENDING', 'VERIFIED'] },
                createdAt: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
                },
              },
            },
          },
        },
      },
    });

    return stats.map((cat) => ({
      ...cat,
      activeIncidents: cat._count.incidents,
      _count: undefined,
    }));
  }

  /**
   * Invalidate category cache
   */
  async invalidateCache() {
    await cache.del(CACHE_KEY);
  }
}
