import { Module } from "@nestjs/common";
import { ExpensesService } from "./expenses.service";
import { ExpensesController } from "./expenses.controller";
import { AuditService } from "../common/audit.service";

@Module({
  providers: [ExpensesService, AuditService],
  controllers: [ExpensesController],
  exports: [ExpensesService],
})
export class ExpensesModule {}
