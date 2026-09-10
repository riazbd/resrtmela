import { Global, Module } from "@nestjs/common";
import { TaxService } from "./tax.service";
import { TaxController } from "./tax.controller";

/**
 * Global because every total anyone sees goes through it — bookings, the desk,
 * dues, reports, the guest app, exports and the invoice — and threading the
 * import through seven modules buys nothing.
 */
@Global()
@Module({
  providers: [TaxService],
  controllers: [TaxController],
  exports: [TaxService],
})
export class TaxModule {}
