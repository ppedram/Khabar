import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'error'>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'stdout', level: 'info' },
        { emit: 'stdout', level: 'warn' },
      ],
    });

    // Log slow queries in development
    if (process.env.NODE_ENV === 'development') {
      this.$on('query', (e) => {
        if (e.duration > 100) {
          this.logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
        }
      });
    }

    this.$on('error', (e) => {
      this.logger.error(`Prisma error: ${e.message}`);
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connection established');

    // Initialize PostGIS geography column if not exists
    await this.initializePostGIS();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Initialize PostGIS geography column and GIST index for incidents
   */
  private async initializePostGIS() {
    try {
      // Add geography column if not exists
      await this.$executeRaw`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'incidents' AND column_name = 'location'
          ) THEN
            ALTER TABLE incidents ADD COLUMN location geography(Point, 4326);
          END IF;
        END $$;
      `;

      // Create GIST index if not exists
      await this.$executeRaw`
        CREATE INDEX IF NOT EXISTS incidents_location_gist_idx
        ON incidents USING GIST (location);
      `;

      // Create trigger to auto-update location from lat/lng
      await this.$executeRaw`
        CREATE OR REPLACE FUNCTION update_incident_location()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude::float, NEW.latitude::float), 4326)::geography;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `;

      await this.$executeRaw`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'incident_location_trigger'
          ) THEN
            CREATE TRIGGER incident_location_trigger
            BEFORE INSERT OR UPDATE OF latitude, longitude ON incidents
            FOR EACH ROW EXECUTE FUNCTION update_incident_location();
          END IF;
        END $$;
      `;

      this.logger.log('PostGIS geography column and GIST index initialized');
    } catch (error) {
      this.logger.error('Failed to initialize PostGIS:', error);
    }
  }

  /**
   * Find incidents within a radius using PostGIS ST_DWithin
   */
  async findIncidentsWithinRadius(
    latitude: number,
    longitude: number,
    radiusKm: number,
    options: {
      status?: string[];
      categoryId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const radiusMeters = radiusKm * 1000;
    const { status, categoryId, limit = 50, offset = 0 } = options;

    const statusFilter = status?.length
      ? Prisma.sql`AND status = ANY(ARRAY[${Prisma.join(status)}]::text[])`
      : Prisma.empty;

    const categoryFilter = categoryId
      ? Prisma.sql`AND category_id = ${categoryId}::uuid`
      : Prisma.empty;

    return this.$queryRaw`
      SELECT
        i.*,
        ST_Distance(location, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography) as distance_meters,
        c.name as category_name,
        c.icon as category_icon,
        c.color as category_color
      FROM incidents i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE ST_DWithin(
        location,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${radiusMeters}
      )
      ${statusFilter}
      ${categoryFilter}
      ORDER BY distance_meters ASC, created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;
  }

  /**
   * Find incidents within a bounding box
   */
  async findIncidentsInBoundingBox(
    minLat: number,
    minLng: number,
    maxLat: number,
    maxLng: number,
    options: {
      status?: string[];
      limit?: number;
    } = {},
  ) {
    const { status, limit = 100 } = options;

    const statusFilter = status?.length
      ? Prisma.sql`AND status = ANY(ARRAY[${Prisma.join(status)}]::text[])`
      : Prisma.empty;

    return this.$queryRaw`
      SELECT
        i.*,
        c.name as category_name,
        c.icon as category_icon,
        c.color as category_color
      FROM incidents i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE ST_Within(
        location::geometry,
        ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
      )
      ${statusFilter}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }

  /**
   * Find users within radius for notifications
   */
  async findUsersWithinRadius(
    latitude: number,
    longitude: number,
    radiusKm: number,
  ): Promise<{ userId: string; distance: number; apnsToken: string | null }[]> {
    const radiusMeters = radiusKm * 1000;

    return this.$queryRaw`
      SELECT
        us.user_id as "userId",
        ST_Distance(
          ST_SetSRID(ST_MakePoint(us.home_location_lng::float, us.home_location_lat::float), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
        ) as distance,
        ud.apns_token as "apnsToken"
      FROM user_settings us
      JOIN users u ON us.user_id = u.id
      LEFT JOIN user_devices ud ON u.id = ud.user_id AND ud.is_active = true AND ud.device_type = 'IOS'
      WHERE us.home_location_lat IS NOT NULL
        AND us.home_location_lng IS NOT NULL
        AND us.notifications_enabled = true
        AND u.is_banned = false
        AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(us.home_location_lng::float, us.home_location_lat::float), 4326)::geography,
          ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
          ${radiusMeters}
        )
    `;
  }
}
