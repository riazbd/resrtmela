import { Global, Module } from "@nestjs/common";
import { OptionsService } from "./options.service";
import { OptionsController } from "./options.controller";

/**
 * Global because the lists are read from wherever a value is written —
 * payments, the restaurant, payroll, bookings, activities — and threading the
 * import through five modules buys nothing.
 */
@Global()
@Module({
  providers: [OptionsService],
  controllers: [OptionsController],
  exports: [OptionsService],
})
export class OptionsModule {}
