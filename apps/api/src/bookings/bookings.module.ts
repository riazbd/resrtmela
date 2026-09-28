import { Module } from "@nestjs/common";
import { RoomsModule } from "../rooms/rooms.module";
import { CommonModule } from "../common/common.module";
import { BookingsService } from "./bookings.service";
import { BookingsController } from "./bookings.controller";
import { AvailabilityService } from "./availability.service";
import { WebhookModule } from "../v1/webhook.module";
import { AgentAccountsModule } from "../agent-accounts/agent-accounts.module";

@Module({
  /**
   * `AgentAccountsModule` is here for one call: a booking an agent makes is
   * refused when the agency is already holding more of the resort's money than
   * its credit limit allows. The dependency runs this way only — nothing in
   * that module imports this one, which is why the check could be added without
   * a `forwardRef`.
   */
  imports: [RoomsModule, CommonModule, WebhookModule, AgentAccountsModule],
  providers: [BookingsService, AvailabilityService],
  controllers: [BookingsController],
  exports: [BookingsService, AvailabilityService],
})
export class BookingsModule {}
