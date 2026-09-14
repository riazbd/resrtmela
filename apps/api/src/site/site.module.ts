import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { PublishedSiteService } from "./published-site.service";
import { PublishedSiteController } from "./published-site.controller";

/**
 * What a resort publishes about itself (2026-09-14 design).
 *
 * The service is exported because `/v1` will want the same answers: the whole
 * point of the published view is that the website and the API cannot disagree.
 */
@Module({
  imports: [CommonModule],
  providers: [PublishedSiteService],
  controllers: [PublishedSiteController],
  exports: [PublishedSiteService],
})
export class SiteModule {}
