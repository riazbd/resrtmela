import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module";
import { CommonModule } from "../common/common.module";
import { BookingsService } from "./bookings.service";
import { BookingsController } from "./bookings.controller";
import { AvailabilityService } from "./availability.service";
import { WebhookModule } from "../v1/webhook.module";

@Module({
  imports: [RoomsModule, CommonModule, WebhookModule],
  providers: [BookingsService, AvailabilityService],
  controllers: [BookingsController],
  exports: [BookingsService, AvailabilityService],
})
export class BookingsModule {}
