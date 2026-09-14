import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { WebhookService } from "./webhook.service";
import { WebhookController } from "./webhook.controller";

/**
 * Its own module, small on purpose.
 *
 * Both `BookingsModule` (which emits) and `V1Module` (which manages endpoints
 * and is where the rest of the API lives) need this. Putting it in either one
 * would make the two import each other, and Nest resolves a cycle by handing
 * somebody `undefined` at a moment nothing explains.
 */
@Module({
  imports: [CommonModule],
  providers: [WebhookService],
  controllers: [WebhookController],
  exports: [WebhookService],
})
export class WebhookModule {}
