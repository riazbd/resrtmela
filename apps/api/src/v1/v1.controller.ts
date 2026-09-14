import { Body, Controller, Get, Headers, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { ApiKeyGuard, type KeyedRequest } from "./api-key.guard";
import { V1Service } from "./v1.service";

class GuestDto {
  @IsString() @MaxLength(160) fullName!: string;
  @IsOptional() @IsString() @MaxLength(32) phone?: string;
  @IsOptional() @IsString() @MaxLength(191) email?: string;
}

class OrderDto {
  @IsString() @MaxLength(80) roomType!: string;
  @IsString() @MaxLength(10) checkIn!: string;
  @IsString() @MaxLength(10) checkOut!: string;
  @IsInt() @Min(1) adults!: number;
  @IsOptional() @IsInt() @Min(0) children?: number;
  @ValidateNested() @Type(() => GuestDto) guest!: GuestDto;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}

/**
 * The API a resort builds its own website against (2026-09-15 design).
 *
 * Versioned in the path from the first day, because the alternative is finding
 * out that somebody's site depends on a field the moment you remove it. A
 * breaking change is `/v2`, and both run.
 *
 * Every write goes through `BookingsService` — see `v1.service.ts`. Nothing
 * here touches a booking row.
 */
@UseGuards(ApiKeyGuard)
@Controller("v1")
export class V1Controller {
  constructor(@Inject(V1Service) private readonly v1: V1Service) {}

  /** Who this key belongs to: the resort, its rooms and its prices. */
  @Get("resort")
  resort(@Req() req: KeyedRequest) {
    return this.v1.resort(req.caller);
  }

  /** How many of each kind are free between two dates, and from what price. */
  @Get("vacancy")
  vacancy(@Req() req: KeyedRequest, @Query("from") from: string, @Query("to") to: string) {
    return this.v1.vacancy(req.caller, from, to);
  }

  /**
   * Books a kind of room.
   *
   * `Idempotency-Key` is required, not offered: a request that times out is not
   * a request that failed, the caller cannot tell, and a retry without one
   * books the room twice.
   */
  @Post("bookings")
  book(
    @Req() req: KeyedRequest,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() order: OrderDto,
  ) {
    return this.v1.book(req.caller, idempotencyKey, order);
  }

  @Get("bookings/:code")
  booking(@Req() req: KeyedRequest, @Param("code") code: string) {
    return this.v1.booking(req.caller, code);
  }

  @Post("bookings/:code/cancel")
  cancel(@Req() req: KeyedRequest, @Param("code") code: string) {
    return this.v1.cancel(req.caller, code);
  }
}
