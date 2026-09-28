import {
  Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { CONSTRUCTION_KINDS, ConstructionService, type ConstructionKind } from "./construction.service";

class EntryDto {
  @IsIn([...CONSTRUCTION_KINDS]) kind!: ConstructionKind;
  @IsDateString() date!: string;
  @IsNumber() @Min(0.01) amount!: number;
  /** One of these two, per kind: the heading chosen, or the heading typed. */
  @IsOptional() @IsInt() contributorId?: number;
  @IsOptional() @IsInt() purposeId?: number;
  @IsOptional() @IsString() @MaxLength(120) contributorName?: string;
  @IsOptional() @IsString() @MaxLength(120) purposeName?: string;
  @IsOptional() @IsString() @MaxLength(160) paidTo?: string;
  @IsOptional() @IsString() @MaxLength(16) method?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  /** Offline identity: the same line replayed is still one line. */
  @IsOptional() @IsString() @MaxLength(64) clientRef?: string;
}

class BookQuery {
  @IsOptional() @IsIn([...CONSTRUCTION_KINDS]) kind?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() contributorId?: number;
  @IsOptional() @Type(() => Number) @IsInt() purposeId?: number;
  @IsOptional() @IsString() @MaxLength(80) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() take?: number;
}

class NamedDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

/** The construction book, per resort. */
@Controller()
@UseGuards(AuthGuard)
export class ConstructionController {
  constructor(@Inject(ConstructionService) private readonly construction: ConstructionService) {}

  @Get("resorts/:resortId/construction")
  book(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query() q: BookQuery,
  ) {
    return this.construction.book(req.user, resortId, q);
  }

  @Post("resorts/:resortId/construction")
  add(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: EntryDto,
  ) {
    return this.construction.add(req.user, resortId, dto);
  }

  @Patch("resorts/:resortId/construction/:id")
  update(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: EntryDto,
  ) {
    return this.construction.update(req.user, resortId, id, dto);
  }

  @Delete("resorts/:resortId/construction/:id")
  remove(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.construction.remove(req.user, resortId, id);
  }

  @Post("resorts/:resortId/construction/contributors")
  addContributor(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: NamedDto,
  ) {
    return this.construction.addContributor(req.user, resortId, dto.name, dto.note);
  }

  @Post("resorts/:resortId/construction/purposes")
  addPurpose(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: NamedDto,
  ) {
    return this.construction.addPurpose(req.user, resortId, dto.name);
  }
}
