import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { DiscountService } from "./discount.service";
import { PermissionsService } from "./permissions";
import { PlanLimitsService } from "./plan-limits.service";
import { CommissionService } from "./commission.service";
import { TenantStateService } from "./tenant-state.service";
import { PlatformSettingsService } from "./platform-settings.service";

@Global()
@Module({
  providers: [AuditService, DiscountService, PermissionsService, PlanLimitsService, TenantStateService, PlatformSettingsService, CommissionService],
  exports: [AuditService, DiscountService, PermissionsService, PlanLimitsService, TenantStateService, PlatformSettingsService, CommissionService],
})
export class CommonModule {}
