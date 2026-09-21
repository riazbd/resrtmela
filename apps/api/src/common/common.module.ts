import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AppReleaseService, AppVersionGuard } from "./app-release";
import { AppReleaseController } from "./app-release.controller";
import { AuditService } from "./audit.service";
import { DiscountService } from "./discount.service";
import { PermissionsService } from "./permissions";
import { PlanLimitsService } from "./plan-limits.service";
import { CommissionService } from "./commission.service";
import { TenantStateService } from "./tenant-state.service";
import { PlatformSettingsService } from "./platform-settings.service";

@Global()
@Module({
  controllers: [AppReleaseController],
  /*
   * `APP_GUARD` rather than `@UseGuards` on twenty controllers: "this
   * build is too old" is not a fact about one screen, and a floor with
   * nineteen of twenty doors bolted is a floor with a door in it. The
   * guard lets through anything that sends no version, so the console
   * and the smoke scripts never meet it.
   */
  providers: [{ provide: APP_GUARD, useClass: AppVersionGuard }, AppReleaseService, AuditService, DiscountService, PermissionsService, PlanLimitsService, TenantStateService, PlatformSettingsService, CommissionService],
  exports: [AppReleaseService, AuditService, DiscountService, PermissionsService, PlanLimitsService, TenantStateService, PlatformSettingsService, CommissionService],
})
export class CommonModule {}
