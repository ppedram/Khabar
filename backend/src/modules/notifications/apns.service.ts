import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as apn from 'apn';

// APNs notification categories for iOS
export enum APNsCategory {
  NEARBY_INCIDENT = 'NEARBY_INCIDENT',
  INCIDENT_UPDATE = 'INCIDENT_UPDATE',
  INCIDENT_VERIFIED = 'INCIDENT_VERIFIED',
  COMMENT = 'COMMENT',
  SYSTEM = 'SYSTEM',
}

// APNs alert sounds
export enum APNsSound {
  DEFAULT = 'default',
  ALERT = 'alert.caf',
  CRITICAL = 'critical.caf',
}

interface APNsNotificationOptions {
  title: string;
  body: string;
  subtitle?: string;
  category?: APNsCategory;
  sound?: APNsSound | string;
  badge?: number;
  data?: Record<string, unknown>;
  threadId?: string;
  collapseId?: string;
  priority?: number;
  expiry?: number;
  mutableContent?: boolean;
  contentAvailable?: boolean;
}

interface APNsSendResult {
  success: boolean;
  apnsId?: string;
  error?: string;
}

@Injectable()
export class ApnsService {
  private readonly logger = new Logger(ApnsService.name);
  private provider: apn.Provider | null = null;
  private readonly bundleId: string;
  private readonly isProduction: boolean;

  constructor(private readonly configService: ConfigService) {
    this.bundleId = this.configService.get<string>('apns.bundleId') || '';
    this.isProduction = this.configService.get<boolean>('apns.production') || false;

    this.initializeProvider();
  }

  private initializeProvider() {
    const keyId = this.configService.get<string>('apns.keyId');
    const teamId = this.configService.get<string>('apns.teamId');
    const privateKey = this.configService.get<string>('apns.privateKey');

    if (!keyId || !teamId || !privateKey) {
      this.logger.warn(
        'APNs configuration incomplete. Push notifications will be disabled.',
      );
      return;
    }

    try {
      this.provider = new apn.Provider({
        token: {
          key: privateKey,
          keyId,
          teamId,
        },
        production: this.isProduction,
      });

      this.logger.log(
        `APNs provider initialized (${this.isProduction ? 'production' : 'sandbox'})`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize APNs provider:', error);
    }
  }

  /**
   * Send a push notification to a single device
   */
  async send(
    deviceToken: string,
    options: APNsNotificationOptions,
  ): Promise<APNsSendResult> {
    if (!this.provider) {
      this.logger.warn('APNs provider not initialized');
      return { success: false, error: 'APNs not configured' };
    }

    const notification = this.buildNotification(options);

    try {
      const result = await this.provider.send(notification, deviceToken);

      if (result.failed.length > 0) {
        const failure = result.failed[0];
        const error = failure.response?.reason || 'Unknown error';
        this.logger.warn(`APNs send failed: ${error}`);

        // Handle specific APNs errors
        if (error === 'BadDeviceToken' || error === 'Unregistered') {
          // Device token is invalid - should be removed from database
          return { success: false, error: 'INVALID_TOKEN' };
        }

        return { success: false, error };
      }

      if (result.sent.length > 0) {
        const sent = result.sent[0];
        return {
          success: true,
          apnsId: sent.device, // APNs-assigned ID
        };
      }

      return { success: false, error: 'No result' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('APNs send error:', error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send push notifications to multiple devices
   */
  async sendBatch(
    deviceTokens: string[],
    options: APNsNotificationOptions,
  ): Promise<Map<string, APNsSendResult>> {
    const results = new Map<string, APNsSendResult>();

    if (!this.provider || deviceTokens.length === 0) {
      return results;
    }

    const notification = this.buildNotification(options);

    try {
      const result = await this.provider.send(notification, deviceTokens);

      // Process successful sends
      for (const sent of result.sent) {
        results.set(sent.device, { success: true, apnsId: sent.device });
      }

      // Process failures
      for (const failed of result.failed) {
        const error = failed.response?.reason || 'Unknown error';
        results.set(failed.device, { success: false, error });
      }
    } catch (error) {
      this.logger.error('APNs batch send error:', error);
      // Mark all as failed
      for (const token of deviceTokens) {
        results.set(token, {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Send a silent notification (for background refresh)
   */
  async sendSilent(
    deviceToken: string,
    data: Record<string, unknown>,
  ): Promise<APNsSendResult> {
    return this.send(deviceToken, {
      title: '',
      body: '',
      contentAvailable: true,
      data,
      priority: 5, // Low priority for silent notifications
    });
  }

  /**
   * Build APNs notification object
   */
  private buildNotification(options: APNsNotificationOptions): apn.Notification {
    const notification = new apn.Notification();

    // Set topic (bundle ID)
    notification.topic = this.bundleId;

    // Alert content
    if (options.title || options.body) {
      notification.alert = {
        title: options.title,
        body: options.body,
        subtitle: options.subtitle,
      };
    }

    // Sound
    if (options.sound) {
      notification.sound = options.sound;
    }

    // Badge
    if (options.badge !== undefined) {
      notification.badge = options.badge;
    }

    // Category for actionable notifications
    if (options.category) {
      notification.category = options.category;
    }

    // Custom data payload
    if (options.data) {
      notification.payload = options.data;
    }

    // Thread ID for notification grouping
    if (options.threadId) {
      notification.threadId = options.threadId;
    }

    // Collapse ID for replacing notifications
    if (options.collapseId) {
      notification.collapseId = options.collapseId;
    }

    // Priority (10 = immediate, 5 = consider power)
    notification.priority = options.priority || 10;

    // Expiry (seconds from now)
    if (options.expiry) {
      notification.expiry = Math.floor(Date.now() / 1000) + options.expiry;
    }

    // Mutable content (for notification service extensions)
    if (options.mutableContent) {
      notification.mutableContent = true;
    }

    // Content available (for silent/background notifications)
    if (options.contentAvailable) {
      notification.contentAvailable = true;
    }

    return notification;
  }

  /**
   * Shutdown the APNs provider
   */
  async shutdown() {
    if (this.provider) {
      await this.provider.shutdown();
      this.logger.log('APNs provider shutdown');
    }
  }
}
