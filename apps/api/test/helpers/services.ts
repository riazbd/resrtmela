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
import { CommissionService } from "../../src/common/commission.service";
import { TenantStateService } from "../../src/common/tenant-state.service";
import { PlatformSettingsService } from "../../src/common/platform-settings.service";
import { BillingService } from "../../src/platform/billing.service";
import { PlatformService } from "../../src/platform/platform.service";
import { SubscriptionService } from "../../src/platform/subscription.service";
import { ExportService } from "../../src/export/export.service";
import { PaymentsService } from "../../src/payments/payments.service";
import { TemplatesService } from "../../src/notifications/templates.service";
import { AgentService } from "../../src/agent/agent.service";
import { AgencyContextService } from "../../src/agent/agency-context.service";
import { ToursService } from "../../src/agent/tours.service";
import { BooksService } from "../../src/agent/books.service";
import { SalesService } from "../../src/agent/sales.service";
import { AgencyGuestsService } from "../../src/agent/agency-guests.service";
import { AgencyCalendarService } from "../../src/agent/agency-calendar.service";
import { EngageService } from "../../src/engage/engage.service";
import { GuestService } from "../../src/guest/guest.service";
import { TenancyService } from "../../src/tenancy/tenancy.service";
import { ImportService } from "../../src/import/import.service";
import { ExpensesService } from "../../src/expenses/expenses.service";
import { PayrollService } from "../../src/payroll/payroll.service";
import { FbService } from "../../src/fb/fb.service";
import { ReportsService } from "../../src/reports/reports.service";
import { IntentsService } from "../../src/payments/intents.service";
import { OptionsService } from "../../src/options/options.service";
import { TaxService } from "../../src/common/tax.service";
import { MockGateway, type PaymentGateway } from "../../src/payments/gateway";

export function makeBookingsService(prisma: PrismaService): BookingsService {
  const audit = new AuditService(prisma);
  return new BookingsService(
    prisma,
    new AvailabilityService(prisma, makeCommissionService(prisma)),
    makeRoomsService(prisma),
    new ActivitiesService(prisma, audit, new PermissionsService(prisma)),
    // EmailService/SmsService fall back to console logging when unconfigured,
    // so nothing leaves the machine during a test run.
    makeNotificationsService(prisma),
    new DiscountService(prisma),
    audit,
    new EmailService(),
    new PermissionsService(prisma),
    new TenantStateService(prisma),
    makeOptionsService(prisma),
    makeTaxService(prisma),
    makeCommissionService(prisma),
  );
}

/** Constructing this by hand in a spec is how helpers go stale; go through here. */
export function makeNotificationsService(prisma: PrismaService): NotificationsService {
  // EmailService/SmsService fall back to console logging when unconfigured,
  // so nothing leaves the machine during a test run.
  return new NotificationsService(
    prisma,
    new EmailService(),
    new SmsService(),
    new PlatformSettingsService(prisma),
    makeTemplatesService(prisma),
    makeTaxService(prisma),
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
    makeNotificationsService(prisma),
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

/** Constructing this by hand in a spec is how helpers go stale; go through here. */
export function makeAvailabilityService(prisma: PrismaService): AvailabilityService {
  return new AvailabilityService(prisma, makeCommissionService(prisma));
}

export function makeCommissionService(prisma: PrismaService): CommissionService {
  return new CommissionService(prisma, new PermissionsService(prisma), new AuditService(prisma));
}

export function makeSubscriptionService(prisma: PrismaService): SubscriptionService {
  return new SubscriptionService(
    prisma,
    new PermissionsService(prisma),
    new PlanLimitsService(prisma),
    new AuditService(prisma),
  );
}

export function makeExportService(prisma: PrismaService): ExportService {
  return new ExportService(prisma, new PermissionsService(prisma), makeTaxService(prisma));
}

export function makePaymentsService(prisma: PrismaService): PaymentsService {
  return new PaymentsService(
    prisma,
    new AuditService(prisma),
    makeBookingsService(prisma),
    makeNotificationsService(prisma),
    new PermissionsService(prisma),
    makeOptionsService(prisma),
    makeTaxService(prisma),
  );
}

export function makeTaxService(prisma: PrismaService): TaxService {
  return new TaxService(prisma, new PermissionsService(prisma), new AuditService(prisma));
}

export function makeOptionsService(prisma: PrismaService): OptionsService {
  return new OptionsService(
    prisma,
    new PlatformSettingsService(prisma),
    new PermissionsService(prisma),
    new AuditService(prisma),
  );
}

export function makeTemplatesService(prisma: PrismaService): TemplatesService {
  return new TemplatesService(prisma, new PermissionsService(prisma));
}

export function makeFbService(prisma: PrismaService): FbService {
  return new FbService(prisma, new AuditService(prisma), new PermissionsService(prisma), makeTaxService(prisma));
}

export function makeReportsService(prisma: PrismaService): ReportsService {
  return new ReportsService(prisma, new PermissionsService(prisma), makeTaxService(prisma), makeCommissionService(prisma));
}

export function makeIntentsService(prisma: PrismaService, gateway?: PaymentGateway): IntentsService {
  return new IntentsService(
    prisma,
    makeBookingsService(prisma),
    makeNotificationsService(prisma),
    gateway ?? new MockGateway(),
  );
}

export function makeAgentService(prisma: PrismaService): AgentService {
  return new AgentService(prisma, new AgencyContextService(prisma));
}

export function makeToursService(prisma: PrismaService): ToursService {
  return new ToursService(prisma, new AgencyContextService(prisma), new AuditService(prisma));
}

export function makeBooksService(prisma: PrismaService): BooksService {
  return new BooksService(prisma, new AgencyContextService(prisma), new AuditService(prisma));
}

export function makeExpensesService(prisma: PrismaService): ExpensesService {
  return new ExpensesService(
    prisma,
    new AuditService(prisma),
    new PermissionsService(prisma),
    new TenantStateService(prisma),
  );
}

export function makePayrollService(prisma: PrismaService): PayrollService {
  return new PayrollService(prisma, new PermissionsService(prisma), new AuditService(prisma));
}

export function makeSalesService(prisma: PrismaService, email?: EmailService): SalesService {
  return new SalesService(
    prisma,
    new AgencyContextService(prisma),
    new AuditService(prisma),
    email ?? new EmailService(),
  );
}

export function makeGuestsService(prisma: PrismaService): AgencyGuestsService {
  return new AgencyGuestsService(
    prisma,
    new AgencyContextService(prisma),
    new AvailabilityService(prisma, makeCommissionService(prisma)),
    makeTaxService(prisma),
  );
}

export function makeCalendarService(prisma: PrismaService): AgencyCalendarService {
  return new AgencyCalendarService(prisma, new AgencyContextService(prisma));
}

export function makePlatformSettings(prisma: PrismaService): PlatformSettingsService {
  return new PlatformSettingsService(prisma);
}

export function makeEngageService(prisma: PrismaService): EngageService {
  return new EngageService(
    prisma,
    new AuditService(prisma),
    new EmailService(),
    new PermissionsService(prisma),
    makePlatformSettings(prisma),
  );
}

export function makeGuestService(prisma: PrismaService): GuestService {
  const audit = new AuditService(prisma);
  return new GuestService(
    prisma,
    makeBookingsService(prisma),
    makeRoomsService(prisma),
    new ActivitiesService(prisma, audit, new PermissionsService(prisma)),
    makeNotificationsService(prisma),
    audit,
    makeTaxService(prisma),
  );
}

export function makePlanLimits(prisma: PrismaService): PlanLimitsService {
  return new PlanLimitsService(prisma);
}

export function makeTenancyService(prisma: PrismaService): TenancyService {
  return new TenancyService(
    prisma,
    new AuditService(prisma),
    new PlanLimitsService(prisma),
    new PermissionsService(prisma),
  );
}

export function makeImportService(prisma: PrismaService): ImportService {
  return new ImportService(
    prisma,
    new AuditService(prisma),
    makeBookingsService(prisma),
    new PermissionsService(prisma),
    makeOptionsService(prisma),
    makeTaxService(prisma),
  );
}
