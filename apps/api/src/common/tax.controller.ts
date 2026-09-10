import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { AuthGuard, AuthedRequest } from "./auth.guard";
import { TaxService } from "./tax.service";

class CreateTaxRuleDto {
  @IsString() @MinLength(2) @MaxLength(24) code!: string;
  @IsString() @MinLength(1) @MaxLength(60) label!: string;
  @IsNumber() @Min(0) @Max(100) ratePct!: number;
  @IsOptional() @IsString() @MaxLength(16) appliesTo?: string;
  @IsOptional() @IsBoolean() inclusive?: boolean;
  @IsOptional() @IsBoolean() compound?: boolean;
}

class UpdateTaxRuleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) label?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) ratePct?: number;
  @IsOptional() @IsString() @MaxLength(16) appliesTo?: string;
  @IsOptional() @IsBoolean() inclusive?: boolean;
  @IsOptional() @IsBoolean() compound?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

/** What a resort charges on top of its rates — VAT, service charge, whatever it has. */
@Controller()
@UseGuards(AuthGuard)
export class TaxController {
  constructor(@Inject(TaxService) private readonly tax: TaxService) {}

  @Get("resorts/:resortId/tax-rules")
  list(@Req() req: AuthedRequest, @Param("resortId", ParseIntPipe) resortId: number) {
    return this.tax.list(req.user, resortId);
  }

  @Post("resorts/:resortId/tax-rules")
  create(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: CreateTaxRuleDto,
  ) {
    return this.tax.create(req.user, resortId, dto);
  }

  @Patch("resorts/:resortId/tax-rules/:id")
  update(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateTaxRuleDto,
  ) {
    return this.tax.update(req.user, resortId, id, dto);
  }

  @Delete("resorts/:resortId/tax-rules/:id")
  deactivate(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.tax.deactivate(req.user, resortId, id);
  }
}
