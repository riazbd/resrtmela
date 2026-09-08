import { Module } from "@nestjs/common";
import { PlatformService } from "./platform.service";
import { PlatformController } from "./platform.controller";
import { PublicApiController, PublicCmsController } from "./public-api.controller";
import { CommonModule } from "../common/common.module";
import { BookingsModule } from "../bookings/bookings.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [CommonModule, BookingsModule, NotificationsModule],
  providers: [PlatformService],
  controllers: [PlatformController, PublicApiController, PublicCmsController],
  exports: [PlatformService],
})
export class PlatformModule {}
