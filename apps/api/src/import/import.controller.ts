import { Body, Controller, Param, ParseIntPipe, Post, Req, UseGuards, Inject } from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { ImportService } from "./import.service";

class RoomTypeChoiceDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(30) maxAdults?: number;
  @IsOptional() @IsInt() @Min(0) @Max(30) maxChildren?: number;
}

class ImportDto {
  @IsString() @MaxLength(2_000_000) csv!: string;
  @IsOptional() @IsBoolean() dryRun?: boolean;
  /** what to call the room type, when the resort has none yet */
  @IsOptional() @ValidateNested() @Type(() => RoomTypeChoiceDto) roomType?: RoomTypeChoiceDto;
}

@Controller()
@UseGuards(AuthGuard)
export class ImportController {
  constructor(@Inject(ImportService) private readonly importer: ImportService) {}

  @Post("resorts/:resortId/import/expenses")
  importExpenses(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: ImportDto,
  ) {
    return this.importer.importExpenses(req.user, resortId, dto.csv);
  }

  @Post("resorts/:resortId/import/fb")
  importFb(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: ImportDto & { roomMap?: Record<string, string> },
  ) {
    return this.importer.importFb(req.user, resortId, dto.csv, dto.roomMap);
  }

  @Post("resorts/:resortId/reconcile")
  reconcile(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: { sheet7: string; sheet11: string },
  ) {
    return this.importer.reconcileGrids(req.user, resortId, dto.sheet7, dto.sheet11);
  }

  @Post("resorts/:resortId/import/bookings")
  import(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: ImportDto,
  ) {
    return this.importer.import(req.user, resortId, dto.csv, dto.dryRun ?? false, dto.roomType);
  }
}
