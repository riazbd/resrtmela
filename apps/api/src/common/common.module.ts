import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { DiscountService } from "./discount.service";
import { PermissionsService } from "./permissions";
import { PlanLimitsService } from "./plan-limits.service";

@Global()
@Module({
  providers: [AuditService, DiscountService, PermissionsService, PlanLimitsService],
  exports: [AuditService, DiscountService, PermissionsService, PlanLimitsService],
})
export class CommonModule {}
