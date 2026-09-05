import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { IntentsService } from "./intents.service";
import { IntentsController } from "./intents.controller";
import { BookingsModule } from "../bookings/bookings.module";

@Module({
  imports: [BookingsModule],
  providers: [PaymentsService, IntentsService],
  controllers: [PaymentsController, IntentsController],
})
export class PaymentsModule {}
