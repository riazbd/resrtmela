import { Body, Controller, Delete, Get, Headers, Inject, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength } from "class-validator";
import { AuthGuard, type AuthedRequest } from "../common/auth.guard";
import { badRequest } from "../common/rbac";
import { AgencySiteEditorService } from "./agency-site-editor.service";
import { AgencyPublicSiteService } from "./agency-public-site.service";

class AgencySiteEditDto {
  @IsOptional() @IsString() @MaxLength(160) headline?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) intro?: string | null;
  @IsOptional() @IsString() @MaxLength(16) themeColor?: string | null;
  @IsOptional() @IsString() @MaxLength(32) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(191) email?: string | null;
  @IsOptional() @IsString() @MaxLength(32) whatsapp?: string | null;
  @IsOptional() @IsString() @MaxLength(255) address?: string | null;
  @IsOptional() @IsString() @MaxLength(191) facebook?: string | null;
  @IsOptional() @IsString() @MaxLength(191) instagram?: string | null;
  @IsOptional() @IsArray() @IsInt({ each: true }) hiddenResortIds?: number[];
}

class PublishDto {
  @IsBoolean() published!: boolean;
}

class SlugDto {
  @IsString() @MaxLength(80) slug!: string;
}

class MoveDto {
  @IsInt() sortOrder!: number;
}

/**
 * The agency's side of its own page (2026-09-17 design).
 *
 * A picture arrives as raw bytes with its own `Content-Type`, as a resort's
 * does — `main.ts` gives `image/*` its own parser and limit.
 */
@UseGuards(AuthGuard)
@Controller("agent/site")
export class AgencySiteEditorController {
  constructor(@Inject(AgencySiteEditorService) private readonly editor: AgencySiteEditorService) {}

  @Get()
  get(@Req() req: AuthedRequest) {
    return this.editor.get(req.user);
  }

  @Patch()
  save(@Req() req: AuthedRequest, @Body() dto: AgencySiteEditDto) {
    return this.editor.save(req.user, dto);
  }

  @Post("publish")
  publish(@Req() req: AuthedRequest, @Body() dto: PublishDto) {
    return this.editor.publish(req.user, dto.published);
  }

  @Post("address")
  address(@Req() req: AuthedRequest, @Body() dto: SlugDto) {
    return this.editor.setSlug(req.user, dto.slug);
  }

  @Post("photos")
  photo(@Req() req: AuthedRequest, @Headers("content-type") contentType: string, @Headers("x-alt") alt?: string) {
    const bytes = (req as unknown as { body?: unknown }).body;
    if (!Buffer.isBuffer(bytes)) throw badRequest("Send the picture itself as the body.");
    return this.editor.addPhoto(req.user, bytes, (contentType ?? "").split(";")[0]!.trim(), {
      // headers are latin-1 on the wire, so the caller encodes anything else
      alt: alt ? decodeURIComponent(alt) : null,
    });
  }

  @Patch("photos/:photoId")
  move(@Req() req: AuthedRequest, @Param("photoId", ParseIntPipe) photoId: number, @Body() dto: MoveDto) {
    return this.editor.movePhoto(req.user, photoId, dto.sortOrder);
  }

  @Delete("photos/:photoId")
  remove(@Req() req: AuthedRequest, @Param("photoId", ParseIntPipe) photoId: number) {
    return this.editor.removePhoto(req.user, photoId);
  }
}

/**
 * An agency's page, open to the world. No token and no session. Under `site`
 * so it shares the public rate limit a resort's page has.
 */
@Controller("site/agency")
export class AgencyPublicSiteController {
  constructor(@Inject(AgencyPublicSiteService) private readonly site: AgencyPublicSiteService) {}

  @Get(":slug")
  async page(@Param("slug") slug: string) {
    const page = await this.site.page(slug);
    if (!page) throw Object.assign(new Error("No such site"), { status: 404 });
    return page;
  }

  @Get(":slug/resorts/:resort/vacancy")
  vacancy(
    @Param("slug") slug: string,
    @Param("resort") resort: string,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.site.vacancy(slug, resort, from, to);
  }
}
