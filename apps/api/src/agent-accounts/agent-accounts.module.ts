import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module";
import { AgentAccountsService } from "./agent-accounts.service";
import { MyAccountsService } from "./my-accounts.service";
import { SettleService } from "./settle.service";
import { AgentAccountsController, MyAccountsController } from "./agent-accounts.controller";

/**
 * The running account between a resort and an agent.
 *
 * `AgentModule` is imported for `AgencyContextService` — which agency is asking
 * and what they may do inside it, computed in exactly one place so the agency
 * side and the resort side cannot key the same account two ways.
 *
 * **Nothing here imports `BookingsModule`, deliberately.** `BookingsService`
 * injects `AgentAccountsService` to check a credit limit before a booking is
 * taken, so an import back the other way would be a cycle. `SettleService`
 * reaches `BookingsService.computeTotals`, which is static — a plain import of
 * the class, no provider, no cycle — and keeps `paymentState` honest itself
 * rather than calling `detail()` for it.
 */
@Module({
  imports: [AgentModule],
  providers: [AgentAccountsService, MyAccountsService, SettleService],
  controllers: [AgentAccountsController, MyAccountsController],
  exports: [AgentAccountsService],
})
export class AgentAccountsModule {}
