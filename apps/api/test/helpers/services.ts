/**
 * Real service instances wired against the test database. The services are
 * plain classes with constructor injection, so Nest is not needed to build
 * them — which keeps these tests exercising production wiring, not a mock of it.
 */
import type { PrismaService } from "../../src/prisma/prisma.service";
import { BookingsService } from "../../src/bookings/bookings.service";
import { AvailabilityService } from "../../src/bookings/availability.service";
import { RoomsService } from "../../src/rooms/rooms.service";
import { ActivitiesService } from "../../src/activities/activities.service";
import { NotificationsService } from "../../src/notifications/notifications.service";
import { EmailService } from "../../src/notifications/email.service";
import { SmsService } from "../../src/notifications/sms.service";
import { DiscountService } from "../../src/common/discount.service";
import { AuditService } from "../../src/common/audit.service";
import { PermissionsService } from "../../src/common/permissions";

export function makeBookingsService(prisma: PrismaService): BookingsService {
  const audit = new AuditService(prisma);
  return new BookingsService(
    prisma,
    new AvailabilityService(prisma),
    new RoomsService(prisma, audit),
    new ActivitiesService(prisma, audit),
    // EmailService/SmsService fall back to console logging when unconfigured,
    // so nothing leaves the machine during a test run.
    new NotificationsService(prisma, new EmailService(), new SmsService()),
    new DiscountService(prisma),
    audit,
    new EmailService(),
    new PermissionsService(prisma),
  );
}
