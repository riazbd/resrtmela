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
import { PlanLimitsService } from "../../src/common/plan-limits.service";
import { TenantStateService } from "../../src/common/tenant-state.service";
import { PlatformSettingsService } from "../../src/common/platform-settings.service";
import { BillingService } from "../../src/platform/billing.service";
import { PlatformService } from "../../src/platform/platform.service";
import { ExportService } from "../../src/export/export.service";

export function makeBookingsService(prisma: PrismaService): BookingsService {
  const audit = new AuditService(prisma);
  return new BookingsService(
    prisma,
    new AvailabilityService(prisma),
    makeRoomsService(prisma),
    new ActivitiesService(prisma, audit, new PermissionsService(prisma)),
    // EmailService/SmsService fall back to console logging when unconfigured,
    // so nothing leaves the machine during a test run.
    new NotificationsService(prisma, new EmailService(), new SmsService()),
    new DiscountService(prisma),
    audit,
    new EmailService(),
    new PermissionsService(prisma),
    new TenantStateService(prisma),
  );
}

export function makeRoomsService(prisma: PrismaService): RoomsService {
  return new RoomsService(
    prisma,
    new AuditService(prisma),
    new PlanLimitsService(prisma),
    new PermissionsService(prisma),
  );
}

export function makeBillingService(prisma: PrismaService): BillingService {
  return new BillingService(
    prisma,
    new NotificationsService(prisma, new EmailService(), new SmsService()),
    new PlatformSettingsService(prisma),
    new AuditService(prisma),
  );
}

export function makePlatformService(prisma: PrismaService): PlatformService {
  return new PlatformService(
    prisma,
    new AuditService(prisma),
    new EmailService(),
    new DiscountService(prisma),
    new PermissionsService(prisma),
    new PlanLimitsService(prisma),
    makeBillingService(prisma),
  );
}

export function makeExportService(prisma: PrismaService): ExportService {
  return new ExportService(prisma, new PermissionsService(prisma));
}
