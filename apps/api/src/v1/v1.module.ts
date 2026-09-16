import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { SiteModule } from "../site/site.module";
import { BookingsModule } from "../bookings/bookings.module";
import { ApiKeyService } from "./api-key.service";
import { V1Service } from "./v1.service";
import { V1Controller } from "./v1.controller";
import { WebhookModule } from "./webhook.module";
import { AgencyApiService } from "./agency-api.service";
import { AgencyKeysService } from "./agency-keys.service";
import { AgencyV1Controller, AgencyKeysController } from "./agency-v1.controller";

/**
 * The API a resort builds against (2026-09-15 design).
 *
 * It imports the site and bookings modules rather than reimplementing either:
 * reading is the published view the brochure renders, and writing is the
 * service the front desk uses. That is the whole design in two imports.
 */
@Module({
  imports: [CommonModule, SiteModule, BookingsModule, WebhookModule],
  providers: [ApiKeyService, V1Service, AgencyApiService, AgencyKeysService],
  controllers: [AgencyV1Controller, AgencyKeysController, V1Controller],
  exports: [ApiKeyService],
})
export class V1Module {}
