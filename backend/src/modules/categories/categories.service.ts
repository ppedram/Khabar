import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/categories.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all active categories
   */
  async findAll(includeInactive = false) {
    return this.prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        color: true,
        severityLevel: true,
        isActive: true,
        sortOrder: true,
        _count: {
          select: { incidents: true },
        },
      },
    });
  }

  /**
   * Get a single category by ID or slug
   */
  async findOne(idOrSlug: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        OR: [{ id: idOrSlug }, { slug: idOrSlug }],
      },
      include: {
        _count: {
          select: { incidents: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  /**
   * Create a new category (admin only)
   */
  async create(dto: CreateCategoryDto) {
    // Check if slug already exists
    const existing = await this.prisma.category.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException('Category with this slug already exists');
    }

    return this.prisma.category.create({
      data: dto,
    });
  }

  /**
   * Update a category (admin only)
   */
  async update(id: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check slug uniqueness if being changed
    if (dto.slug && dto.slug !== category.slug) {
      const existing = await this.prisma.category.findUnique({
        where: { slug: dto.slug },
      });
      if (existing) {
        throw new ConflictException('Category with this slug already exists');
      }
    }

    return this.prisma.category.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Delete a category (admin only)
   */
  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { incidents: true } } },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category._count.incidents > 0) {
      throw new ConflictException(
        'Cannot delete category with existing incidents. Deactivate it instead.',
      );
    }

    await this.prisma.category.delete({ where: { id } });
  }

  /**
   * Get incident statistics by category
   */
  async getStatistics() {
    const stats = await this.prisma.category.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        icon: true,
        color: true,
        _count: {
          select: { incidents: true },
        },
        incidents: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            },
          },
          select: { id: true },
        },
      },
    });

    return stats.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      icon: cat.icon,
      color: cat.color,
      totalIncidents: cat._count.incidents,
      recentIncidents: cat.incidents.length,
    }));
  }

  /**
   * Seed default categories
   */
  async seedDefaults() {
    const defaultCategories = [
      {
        name: 'Crime',
        slug: 'crime',
        description: 'General criminal activity',
        icon: 'exclamation-triangle',
        color: '#FF4444',
        severityLevel: 4,
        sortOrder: 1,
      },
      {
        name: 'Suspicious Activity',
        slug: 'suspicious',
        description: 'Suspicious persons or behavior',
        icon: 'eye',
        color: '#FFA500',
        severityLevel: 2,
        sortOrder: 2,
      },
      {
        name: 'Theft',
        slug: 'theft',
        description: 'Burglary, robbery, or larceny',
        icon: 'hand-holding',
        color: '#FF6B6B',
        severityLevel: 3,
        sortOrder: 3,
      },
      {
        name: 'Assault',
        slug: 'assault',
        description: 'Physical assault or violence',
        icon: 'fist-raised',
        color: '#DC143C',
        severityLevel: 5,
        sortOrder: 4,
      },
      {
        name: 'Vehicle Incident',
        slug: 'vehicle',
        description: 'Car break-ins, accidents, or violations',
        icon: 'car',
        color: '#4169E1',
        severityLevel: 2,
        sortOrder: 5,
      },
      {
        name: 'Fire/Hazard',
        slug: 'fire',
        description: 'Fire or environmental hazard',
        icon: 'fire',
        color: '#FF4500',
        severityLevel: 5,
        sortOrder: 6,
      },
      {
        name: 'Medical Emergency',
        slug: 'medical',
        description: 'Medical emergency or health issue',
        icon: 'heartbeat',
        color: '#FF1493',
        severityLevel: 5,
        sortOrder: 7,
      },
      {
        name: 'Noise/Disturbance',
        slug: 'noise',
        description: 'Noise complaints or public disturbance',
        icon: 'volume-up',
        color: '#9370DB',
        severityLevel: 1,
        sortOrder: 8,
      },
      {
        name: 'Other',
        slug: 'other',
        description: 'Other safety concerns',
        icon: 'question-circle',
        color: '#808080',
        severityLevel: 1,
        sortOrder: 99,
      },
    ];

    for (const category of defaultCategories) {
      await this.prisma.category.upsert({
        where: { slug: category.slug },
        create: category,
        update: category,
      });
    }

    return { message: 'Default categories seeded', count: defaultCategories.length };
  }
}
