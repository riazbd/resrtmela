import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module";
import { BookingsService } from "./bookings.service";
import { BookingsController } from "./bookings.controller";
import { AvailabilityService } from "./availability.service";

@Module({
  imports: [RoomsModule],
  providers: [BookingsService, AvailabilityService],
  controllers: [BookingsController],
  exports: [BookingsService, AvailabilityService],
})
export class BookingsModule {}
