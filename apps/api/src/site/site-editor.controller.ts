import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength } from "class-validator";
import { AuthGuard, type AuthedRequest } from "../common/auth.guard";
import { badRequest } from "../common/rbac";
import { SiteEditorService } from "./site-editor.service";

class SiteEditDto {
  @IsOptional() @IsString() @MaxLength(24) template?: string;
  @IsOptional() @IsString() @MaxLength(160) headline?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) intro?: string | null;
  @IsOptional() @IsArray() amenities?: string[];
  @IsOptional() @IsString() @MaxLength(16) themeColor?: string | null;
  @IsOptional() @IsNumber() mapLat?: number | null;
  @IsOptional() @IsNumber() mapLng?: number | null;
  @IsOptional() @IsString() @MaxLength(32) whatsapp?: string | null;
  @IsOptional() @IsString() @MaxLength(191) facebook?: string | null;
  @IsOptional() @IsString() @MaxLength(191) instagram?: string | null;
}

class PublishDto {
  @IsBoolean() published!: boolean;
}

class SlugDto {
  @IsString() @MaxLength(120) slug!: string;
}

class PhotoDto {
  @IsOptional() @IsInt() roomTypeId?: number | null;
  @IsOptional() @IsString() @MaxLength(191) alt?: string | null;
  @IsOptional() @IsInt() sortOrder?: number;
}

/**
 * The owner's side of their own site.
 *
 * A picture arrives as raw bytes with its own `Content-Type`, not as multipart
 * and not as a `data:` URL inside JSON. Multipart would be a parser to add and
 * a class of bug to inherit for one endpoint; base64 in JSON is what the
 * platform's own logo does and it makes every upload a third larger, which is
 * tolerable for a 96KB icon and not for a gallery. `main.ts` gives `image/*`
 * its own body parser and its own limit.
 */
@UseGuards(AuthGuard)
@Controller("resorts/:id/site")
export class SiteEditorController {
  constructor(@Inject(SiteEditorService) private readonly editor: SiteEditorService) {}

  @Get()
  get(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.editor.get(req.user, id);
  }

  @Patch()
  save(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: SiteEditDto) {
    return this.editor.save(req.user, id, dto);
  }

  @Post("publish")
  publish(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: PublishDto) {
    return this.editor.publish(req.user, id, dto.published);
  }

  @Post("address")
  address(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: SlugDto) {
    return this.editor.setSlug(req.user, id, dto.slug);
  }

  @Post("photos")
  photo(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Headers("content-type") contentType: string,
    @Headers("x-room-type") roomType?: string,
    @Headers("x-alt") alt?: string,
  ) {
    const bytes = (req as unknown as { body?: unknown }).body;
    if (!Buffer.isBuffer(bytes)) throw badRequest("Send the picture itself as the body.");
    const roomTypeId = roomType ? Number(roomType) : null;
    if (roomType && !Number.isInteger(roomTypeId)) throw badRequest("That is not a room type.");
    return this.editor.addPhoto(req.user, id, bytes, (contentType ?? "").split(";")[0]!.trim(), {
      roomTypeId,
      // headers are latin-1 on the wire, so the caller encodes anything else
      alt: alt ? decodeURIComponent(alt) : null,
    });
  }

  @Patch("photos/:photoId")
  movePhoto(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("photoId", ParseIntPipe) photoId: number,
    @Body() dto: PhotoDto,
  ) {
    if (dto.sortOrder == null) throw badRequest("Say where it goes.");
    return this.editor.movePhoto(req.user, id, photoId, dto.sortOrder);
  }

  @Delete("photos/:photoId")
  removePhoto(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("photoId", ParseIntPipe) photoId: number,
  ) {
    return this.editor.removePhoto(req.user, id, photoId);
  }
}
