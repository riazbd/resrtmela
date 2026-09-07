import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { DiscountService } from "./discount.service";

@Global()
@Module({
  providers: [AuditService, DiscountService],
  exports: [AuditService, DiscountService],
})
export class CommonModule {}
