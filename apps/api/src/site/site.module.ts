import { Module } from "@nestjs/common";
import { CommonModule } from "../common/common.module";
import { PublishedSiteService } from "./published-site.service";
import { AgencyPublishedService } from "./agency-published.service";
import { AgencySiteEditorService } from "./agency-site-editor.service";
import { AgencyPublicSiteService } from "./agency-public-site.service";
import { AgencySiteEditorController, AgencyPublicSiteController, SitePreviewController } from "./agency-site.controller";
import { SitePreviewService } from "./site-preview.service";
import { PublishedSiteController } from "./published-site.controller";
import { SiteEditorService } from "./site-editor.service";
import { SiteEditorController } from "./site-editor.controller";
import { UploadService } from "./upload.service";
import { DiskStore } from "./disk-store";
import { SiteCacheService } from "./site-cache.service";
import { ResortDomainService } from "./resort-domain.service";
import { ResortDomainController, DomainLookupController, AgencyDomainController } from "./resort-domain.controller";

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
    AgencyPublishedService,
    AgencySiteEditorService,
    AgencyPublicSiteService,
    SitePreviewService,
    SiteEditorService,
    UploadService,
    SiteCacheService,
    ResortDomainService,
    {
      provide: DiskStore,
      useFactory: () => new DiskStore(process.env.UPLOAD_ROOT ?? "./var/uploads"),
    },
  ],
  // the agency's public controller first: `site/agency/x` must not be read as a resort called "agency"
  controllers: [SitePreviewController, AgencyPublicSiteController, AgencySiteEditorController, PublishedSiteController, SiteEditorController, ResortDomainController, DomainLookupController, AgencyDomainController],
  exports: [PublishedSiteService, AgencyPublishedService, ResortDomainService],
})
export class SiteModule {}
