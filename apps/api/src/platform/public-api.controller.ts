import { Body, Controller, Get, Post, Query, Req, Inject } from "@nestjs/common";
import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { PlatformService } from "./platform.service";
import { BookingsService, type CreateBookingInput } from "../bookings/bookings.service";
import { type JwtClaims } from "@rh/shared";
import { apiKeyClaims, badRequest } from "../common/rbac";

interface ApiKeyRequest {
  headers: Record<string, string | string[] | undefined>;
}

class PublicBookingDto {
  @IsArray() @IsInt({ each: true }) roomIds!: number[];
  @IsString() @MaxLength(10) checkIn!: string;
  @IsString() @MaxLength(10) checkOut!: string;
  @IsInt() @Min(1) adults!: number;
  @IsOptional() @IsInt() @Min(0) children?: number;
  @IsString() @MaxLength(160) guestName!: string;
  @IsOptional() @IsString() @MaxLength(32) guestPhone?: string;
  @IsOptional() @IsString() @MaxLength(191) guestEmail?: string;
  @IsOptional() @IsString() @MaxLength(64) nidPassportNo?: string;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}

/** Public v1 API — authenticated by X-Api-Key (per resort), for resort websites. */
@Controller("v1")
export class PublicApiController {
  constructor(
    @Inject(PlatformService) private readonly platform: PlatformService,
    @Inject(BookingsService) private readonly bookings: BookingsService,
  ) {}

  private async resortId(req: ApiKeyRequest): Promise<number> {
    const key = (req.headers["x-api-key"] as string | undefined)?.trim();
    const resortId = await this.platform.authenticateApiKey(key);
    if (!resortId) throw badRequest("Invalid or missing X-Api-Key");
    return resortId;
  }

  private claimsFor(resortId: number): JwtClaims {
    return apiKeyClaims(resortId);
  }

  @Get("resort")
  async resort(@Req() req: ApiKeyRequest) {
    const resortId = await this.resortId(req);
    return this.platform.publicResort(resortId);
  }

  @Get("availability")
  async availability(@Req() req: ApiKeyRequest, @Query("from") from?: string, @Query("to") to?: string) {
    const resortId = await this.resortId(req);
    return this.platform.publicAvailability(resortId, from, to);
  }

  /**
   * Kept, and refused.
   *
   * A guest cannot book directly, and a booking form on a resort's own website
   * is a guest booking directly however it reaches us — there is no human at
   * the desk in the loop, which is exactly what `apiKeyClaims` records by
   * minting SYSTEM_ACTOR_ID. `bookings.create` turns it away.
   *
   * The route stays because a live website is already posting to it. Deleting
   * it would answer with a 404 the site cannot explain to the visitor standing
   * in front of it; this answers with a sentence about ringing the resort. The
   * key's read endpoints above are untouched, so the site keeps its rooms, its
   * rates and its free nights.
   */
  @Post("bookings")
  async createBooking(@Req() req: ApiKeyRequest, @Body() dto: PublicBookingDto) {
    const resortId = await this.resortId(req);
    const input: CreateBookingInput = {
      resortId,
      roomIds: dto.roomIds,
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      adults: dto.adults,
      children: dto.children ?? 0,
      guest: { fullName: dto.guestName, phone: dto.guestPhone, email: dto.guestEmail, nidPassportNo: dto.nidPassportNo },
      remarks: dto.remarks,
      source: "APP",
    };
    return this.bookings.create(this.claimsFor(resortId), input);
  }
}
