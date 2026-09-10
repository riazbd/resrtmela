import { Module } from "@nestjs/common";
import { PlatformService } from "./platform.service";
import { BillingService } from "./billing.service";
import { SubscriptionService } from "./subscription.service";
import { PlatformController } from "./platform.controller";
import { MarketingController } from "./marketing.controller";
import { CommonModule } from "../common/common.module";
import { BookingsModule } from "../bookings/bookings.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [CommonModule, BookingsModule, NotificationsModule],
  providers: [PlatformService, BillingService, SubscriptionService],
  controllers: [PlatformController, MarketingController],
  exports: [PlatformService, BillingService, SubscriptionService],
})
export class PlatformModule {}
