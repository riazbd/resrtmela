import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { PublishedSiteService } from "./published-site.service";
import { PublishedSiteController } from "./published-site.controller";
import { SiteEditorService } from "./site-editor.service";
import { SiteEditorController } from "./site-editor.controller";
import { UploadService } from "./upload.service";
import { DiskStore } from "./disk-store";
import { SiteCacheService } from "./site-cache.service";
import { ResortDomainService } from "./resort-domain.service";
import { ResortDomainController, DomainLookupController } from "./resort-domain.controller";

/**
 * What a resort publishes about itself (2026-09-14 design).
 *
 * Two controllers because there are two audiences: a stranger reading a
 * shopfront, and an owner writing one. The published service is exported
 * because `/v1` will want the same answers — the whole point of the published
 * view is that the website and the API cannot disagree.
 *
 * `UPLOAD_ROOT` is deployment configuration and is read once, here. Nothing
 * downstream knows a directory, and no row records one: a database restored
 * onto another machine must not carry this machine's paths with it.
 */
@Module({
  imports: [CommonModule],
  providers: [
    PublishedSiteService,
    SiteEditorService,
    UploadService,
    SiteCacheService,
    ResortDomainService,
    {
      provide: DiskStore,
      useFactory: () => new DiskStore(process.env.UPLOAD_ROOT ?? "./var/uploads"),
    },
  ],
  controllers: [PublishedSiteController, SiteEditorController, ResortDomainController, DomainLookupController],
  exports: [PublishedSiteService, ResortDomainService],
})
export class SiteModule {}
