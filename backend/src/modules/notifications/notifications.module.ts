import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ApnsService } from './apns.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, ApnsService],
  exports: [NotificationsService, ApnsService],
})
export class NotificationsModule {}
