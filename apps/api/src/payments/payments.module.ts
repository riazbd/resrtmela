import { Module } from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { IntentsService } from "./intents.service";
import { IntentsController } from "./intents.controller";
import { BookingsModule } from "../bookings/bookings.module";
import { PAYMENT_GATEWAY, gatewayFromEnv } from "./gateway";

@Module({
  imports: [BookingsModule],
  providers: [
    PaymentsService,
    IntentsService,
    // which gateway takes the money is configuration, read once at boot
    { provide: PAYMENT_GATEWAY, useFactory: () => gatewayFromEnv() },
  ],
  controllers: [PaymentsController, IntentsController],
})
export class PaymentsModule {}
