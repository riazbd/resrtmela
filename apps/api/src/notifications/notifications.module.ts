import { Global, Module } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { NotificationsController } from "./notifications.controller";
import { EmailService } from "./email.service";
import { SmsService } from "./sms.service";
import { TemplatesService } from "./templates.service";
import { TemplatesController } from "./templates.controller";

@Global()
@Module({
  providers: [NotificationsService, EmailService, SmsService, TemplatesService],
  controllers: [NotificationsController, TemplatesController],
  exports: [NotificationsService, EmailService, SmsService, TemplatesService],
})
export class NotificationsModule {}
