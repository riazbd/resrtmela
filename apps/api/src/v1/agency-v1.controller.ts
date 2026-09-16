import { Body, Controller, Delete, Get, Headers, HttpCode, Inject, Param, ParseIntPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { AuthGuard, type AuthedRequest } from "../common/auth.guard";
import { ApiKeyGuard, type KeyedRequest } from "./api-key.guard";
import { AgencyApiService } from "./agency-api.service";
import { AgencyKeysService } from "./agency-keys.service";
import { AgencyWebhooksService } from "./agency-webhooks.service";

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

class CancelDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

class EndpointDto {
  @IsString() @MaxLength(500) url!: string;
}

class KeyDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsArray() scopes?: string[];
}

/**
 * The API an agency builds its own website against (2026-09-17 design, §3).
 *
 * The same key header, scopes and idempotency rule as a resort's `/v1`. A
 * resort's key is refused here by name, and an agency's key there.
 */
@UseGuards(ApiKeyGuard)
@Controller("v1/agency")
export class AgencyV1Controller {
  constructor(@Inject(AgencyApiService) private readonly api: AgencyApiService) {}

  /** The agency, the resorts it sells and its tours. */
  @Get()
  agency(@Req() req: KeyedRequest) {
    return this.api.agency(req.caller);
  }

  @Get("resorts/:slug/vacancy")
  vacancy(@Req() req: KeyedRequest, @Param("slug") slug: string, @Query("from") from: string, @Query("to") to: string) {
    return this.api.vacancy(req.caller, slug, from, to);
  }

  /** Books a kind of room at a resort the agency sells. `Idempotency-Key` is required. */
  @Post("resorts/:slug/bookings")
  book(
    @Req() req: KeyedRequest,
    @Param("slug") slug: string,
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() order: OrderDto,
  ) {
    return this.api.book(req.caller, slug, idempotencyKey, order);
  }

  @Get("resorts/:slug/bookings/:code")
  booking(@Req() req: KeyedRequest, @Param("slug") slug: string, @Param("code") code: string) {
    return this.api.booking(req.caller, slug, code);
  }

  /** Asks the resort to cancel. An agency cannot cancel on its own. */
  @Post("resorts/:slug/bookings/:code/cancel")
  @HttpCode(200)
  cancel(@Req() req: KeyedRequest, @Param("slug") slug: string, @Param("code") code: string, @Body() dto: CancelDto) {
    return this.api.cancel(req.caller, slug, code, dto.reason);
  }
}

/** The agency's own screen for its keys. */
@UseGuards(AuthGuard)
@Controller("agent/api-keys")
export class AgencyKeysController {
  constructor(@Inject(AgencyKeysService) private readonly keys: AgencyKeysService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.keys.list(req.user);
  }

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: KeyDto) {
    return this.keys.create(req.user, dto.name, dto.scopes);
  }

  @Delete(":id")
  revoke(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.keys.revoke(req.user, id);
  }
}

/** Where the agency's own website is told about its bookings, and what was sent. */
@UseGuards(AuthGuard)
@Controller("agent/webhooks")
export class AgencyWebhooksController {
  constructor(@Inject(AgencyWebhooksService) private readonly hooks: AgencyWebhooksService) {}

  @Get()
  list(@Req() req: AuthedRequest) {
    return this.hooks.list(req.user);
  }

  @Post()
  add(@Req() req: AuthedRequest, @Body() dto: EndpointDto) {
    return this.hooks.add(req.user, dto.url);
  }

  @Get("deliveries")
  deliveries(@Req() req: AuthedRequest) {
    return this.hooks.deliveries(req.user);
  }

  @Post("deliveries/:deliveryId/retry")
  @HttpCode(200)
  retry(@Req() req: AuthedRequest, @Param("deliveryId") deliveryId: string) {
    if (!/^\d+$/.test(deliveryId)) throw Object.assign(new Error("No such delivery"), { status: 404 });
    return this.hooks.retry(req.user, BigInt(deliveryId));
  }

  @Delete(":id")
  remove(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.hooks.remove(req.user, id);
  }
}
