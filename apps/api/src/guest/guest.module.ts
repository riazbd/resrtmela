import { Module } from "@nestjs/common";
import { BookingsModule } from "../bookings/bookings.module";
import { RoomsModule } from "../rooms/rooms.module";
import { GuestService } from "./guest.service";
import { GuestController } from "./guest.controller";

@Module({
  imports: [BookingsModule, RoomsModule],
  providers: [GuestService],
  controllers: [GuestController],
})
export class GuestModule {}
