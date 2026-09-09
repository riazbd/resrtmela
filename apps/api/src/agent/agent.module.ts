import { Module } from "@nestjs/common";
import { AgentService } from "./agent.service";
import { AgentController } from "./agent.controller";
import { AgencyContextService } from "./agency-context.service";
import { ToursService } from "./tours.service";
import { ToursController } from "./tours.controller";
import { BooksService } from "./books.service";
import { BooksController } from "./books.controller";
import { SalesService } from "./sales.service";
import { SalesController } from "./sales.controller";
import { AgencyGuestsService } from "./agency-guests.service";
import { AgencyCalendarService } from "./agency-calendar.service";
import { AgencyGuestsController } from "./agency-guests.controller";
import { AvailabilityService } from "../bookings/availability.service";
import { EmailService } from "../notifications/email.service";

/**
 * Everything an agency does for itself: its people, its money, its tours, its
 * documents and its clients. Nothing here reaches a resort's own settings — an
 * agency is a customer of the platform, not an administrator of it.
 */
@Module({
  providers: [
    AgencyContextService,
    AgentService,
    ToursService,
    BooksService,
    SalesService,
    AgencyGuestsService,
    AgencyCalendarService,
    AvailabilityService,
    EmailService,
  ],
  controllers: [
    AgentController,
    ToursController,
    BooksController,
    SalesController,
    AgencyGuestsController,
  ],
  exports: [AgentService, AgencyContextService],
})
export class AgentModule {}
