import { ConfigModule } from "@nestjs/config";
import { resolve } from "node:path";
import { APP_FILTER } from "@nestjs/core";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { RateLimitMiddleware } from "./common/rate-limit.middleware";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthController } from "./modules/health/health.controller";
import { RequestLogMiddleware } from "./common/request-log.middleware";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { AuthModule } from "./auth/auth.module";
import { CommonModule } from "./common/common.module";
import { TenancyModule } from "./tenancy/tenancy.module";
import { RoomsModule } from "./rooms/rooms.module";
import { BookingsModule } from "./bookings/bookings.module";
import { PaymentsModule } from "./payments/payments.module";
import { ImportModule } from "./import/import.module";
import { ExportModule } from "./export/export.module";
import { AgentModule } from "./agent/agent.module";
import { GuestModule } from "./guest/guest.module";
import { ActivitiesModule } from "./activities/activities.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ReportsModule } from "./reports/reports.module";
import { ExpensesModule } from "./expenses/expenses.module";
import { FbModule } from "./fb/fb.module";
import { PlatformModule } from "./platform/platform.module";
import { EngageModule } from "./engage/engage.module";
import { PayrollModule } from "./payroll/payroll.module";

const ROOT_ENV = resolve(process.cwd(), "..", "..", ".env");

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [ROOT_ENV] }),
    PrismaModule,
    CommonModule,
    AuthModule,
    TenancyModule,
    RoomsModule,
    BookingsModule,
    PaymentsModule,
    ImportModule,
    ExportModule,
    AgentModule,
    GuestModule,
    ActivitiesModule,
    NotificationsModule,
    ReportsModule,
    ExpensesModule,
    FbModule,
    PlatformModule,
    EngageModule,
    PayrollModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // one structured line per request, with an id the caller can quote
    consumer.apply(RequestLogMiddleware).forRoutes("*");
    // hardened auth surface: 30 req/min per IP (login, OTP, signup)
    consumer.apply(RateLimitMiddleware).forRoutes("auth");
  }
}
