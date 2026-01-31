import { Queue, Worker, Job } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../config/database.js';

// Parse Redis URL for BullMQ connection
function getRedisConfig() {
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port) || 6379,
    password: url.password || undefined,
  };
}

const connection = getRedisConfig();

// Define queues
export const notificationQueue = new Queue('notifications', { connection });
export const mediaProcessingQueue = new Queue('media-processing', { connection });
export const cleanupQueue = new Queue('cleanup', { connection });

// Workers
let notificationWorker: Worker | null = null;
let mediaWorker: Worker | null = null;
let cleanupWorker: Worker | null = null;

/**
 * Start all job workers
 */
export async function startJobWorkers(): Promise<void> {
  // Notification worker
  notificationWorker = new Worker(
    'notifications',
    async (job: Job) => {
      const { type, data } = job.data;

      switch (type) {
        case 'nearby_incident':
          await processNearbyIncidentNotification(data);
          break;
        case 'push':
          await sendPushNotification(data);
          break;
        default:
          logger.warn({ type }, 'Unknown notification job type');
      }
    },
    {
      connection,
      concurrency: 5,
    }
  );

  notificationWorker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Notification job completed');
  });

  notificationWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Notification job failed');
  });

  // Media processing worker
  mediaWorker = new Worker(
    'media-processing',
    async (job: Job) => {
      const { type, data } = job.data;

      switch (type) {
        case 'generate_thumbnail':
          await generateThumbnail(data);
          break;
        case 'moderate_content':
          await moderateContent(data);
          break;
        default:
          logger.warn({ type }, 'Unknown media job type');
      }
    },
    {
      connection,
      concurrency: 2,
    }
  );

  mediaWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Media processing job failed');
  });

  // Cleanup worker
  cleanupWorker = new Worker(
    'cleanup',
    async (job: Job) => {
      const { type } = job.data;

      switch (type) {
        case 'expire_incidents':
          await expireOldIncidents();
          break;
        case 'cleanup_tokens':
          await cleanupExpiredTokens();
          break;
        case 'cleanup_notifications':
          await cleanupOldNotifications();
          break;
        default:
          logger.warn({ type }, 'Unknown cleanup job type');
      }
    },
    {
      connection,
      concurrency: 1,
    }
  );

  cleanupWorker.on('completed', (job) => {
    logger.debug({ jobId: job.id }, 'Cleanup job completed');
  });

  // Schedule recurring cleanup jobs
  await scheduleRecurringJobs();

  logger.info('Job workers started');
}

/**
 * Stop all job workers
 */
export async function stopJobWorkers(): Promise<void> {
  if (notificationWorker) {
    await notificationWorker.close();
  }
  if (mediaWorker) {
    await mediaWorker.close();
  }
  if (cleanupWorker) {
    await cleanupWorker.close();
  }

  logger.info('Job workers stopped');
}

/**
 * Schedule recurring cleanup jobs
 */
async function scheduleRecurringJobs(): Promise<void> {
  // Expire old incidents every hour
  await cleanupQueue.add(
    'expire_incidents',
    { type: 'expire_incidents' },
    {
      repeat: { pattern: '0 * * * *' }, // Every hour
      removeOnComplete: true,
    }
  );

  // Cleanup expired tokens every day at midnight
  await cleanupQueue.add(
    'cleanup_tokens',
    { type: 'cleanup_tokens' },
    {
      repeat: { pattern: '0 0 * * *' }, // Daily at midnight
      removeOnComplete: true,
    }
  );

  // Cleanup old notifications weekly
  await cleanupQueue.add(
    'cleanup_notifications',
    { type: 'cleanup_notifications' },
    {
      repeat: { pattern: '0 0 * * 0' }, // Weekly on Sunday
      removeOnComplete: true,
    }
  );

  logger.info('Recurring jobs scheduled');
}

// Job processors
async function processNearbyIncidentNotification(data: {
  incidentId: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  excludeUserId?: string;
}) {
  const { incidentId, latitude, longitude, radiusKm, excludeUserId } = data;

  // Find users near the incident
  const usersSettings = await prisma.userSettings.findMany({
    where: {
      notificationsEnabled: true,
      homeLocationLat: { not: null },
      homeLocationLng: { not: null },
    },
    include: {
      user: {
        include: {
          devices: { where: { isActive: true } },
        },
      },
    },
  });

  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { category: true },
  });

  if (!incident) return;

  for (const settings of usersSettings) {
    if (settings.user.isBanned) continue;
    if (excludeUserId && settings.userId === excludeUserId) continue;

    const distance = calculateDistance(
      latitude,
      longitude,
      Number(settings.homeLocationLat),
      Number(settings.homeLocationLng)
    );

    if (distance <= Number(settings.notificationRadiusKm)) {
      // Create in-app notification
      await prisma.notification.create({
        data: {
          userId: settings.userId,
          incidentId,
          type: 'NEARBY_INCIDENT',
          title: `${incident.category.name} reported nearby`,
          body: incident.title,
          data: { distance: Math.round(distance * 10) / 10 },
        },
      });

      // Queue push notifications for each device
      for (const device of settings.user.devices) {
        await notificationQueue.add(
          'push',
          {
            type: 'push',
            data: {
              token: device.deviceToken,
              title: `${incident.category.name} reported nearby`,
              body: incident.title,
              data: {
                incidentId,
                type: 'nearby_incident',
              },
            },
          },
          { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
        );
      }
    }
  }
}

async function sendPushNotification(data: {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  // This would use Firebase Admin SDK in production
  // For now, just log it
  logger.info({ data }, 'Would send push notification');

  // Example with Firebase:
  // const admin = require('firebase-admin');
  // await admin.messaging().send({
  //   token: data.token,
  //   notification: { title: data.title, body: data.body },
  //   data: data.data,
  // });
}

async function generateThumbnail(data: { mediaId: string; url: string }) {
  // Thumbnail generation would be implemented here
  // Using sharp or similar library
  logger.info({ data }, 'Would generate thumbnail');
}

async function moderateContent(data: { mediaId: string; url: string }) {
  // Content moderation would be implemented here
  // Using AI service or manual queue
  logger.info({ data }, 'Would moderate content');
}

async function expireOldIncidents() {
  const expiredCount = await prisma.incident.updateMany({
    where: {
      status: { in: ['PENDING', 'VERIFIED'] },
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  });

  logger.info({ count: expiredCount.count }, 'Expired old incidents');
}

async function cleanupExpiredTokens() {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { revokedAt: { not: null } },
      ],
    },
  });

  logger.info({ count: result.count }, 'Cleaned up expired tokens');
}

async function cleanupOldNotifications() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await prisma.notification.deleteMany({
    where: {
      isRead: true,
      createdAt: { lt: thirtyDaysAgo },
    },
  });

  logger.info({ count: result.count }, 'Cleaned up old notifications');
}

function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Export job queueing functions
export async function queueNearbyNotification(
  incidentId: string,
  latitude: number,
  longitude: number,
  excludeUserId?: string
) {
  await notificationQueue.add(
    'nearby_incident',
    {
      type: 'nearby_incident',
      data: {
        incidentId,
        latitude,
        longitude,
        radiusKm: config.geo.maxSearchRadiusKm,
        excludeUserId,
      },
    },
    { attempts: 3, backoff: { type: 'exponential', delay: 1000 } }
  );
}

export async function queueMediaProcessing(mediaId: string, url: string) {
  await mediaProcessingQueue.add(
    'generate_thumbnail',
    { type: 'generate_thumbnail', data: { mediaId, url } },
    { attempts: 3 }
  );
}
