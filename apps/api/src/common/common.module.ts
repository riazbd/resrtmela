import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { DiscountService } from "./discount.service";
import { PermissionsService } from "./permissions";

@Global()
@Module({
  providers: [AuditService, DiscountService, PermissionsService],
  exports: [AuditService, DiscountService, PermissionsService],
})
export class CommonModule {}
