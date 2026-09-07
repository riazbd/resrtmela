import { Global, Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { EmailService } from "./email.service";
import { SmsService } from "./sms.service";

@Global()
@Module({
  providers: [NotificationsService, EmailService, SmsService],
  controllers: [NotificationsController],
  exports: [NotificationsService, EmailService, SmsService],
})
export class NotificationsModule {}
