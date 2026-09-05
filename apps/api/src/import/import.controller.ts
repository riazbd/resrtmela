import { Body, Controller, Param, ParseIntPipe, Post, Req, UseGuards, Inject } from "@nestjs/common";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { ImportService } from "./import.service";

class ImportDto {
  @IsString() @MaxLength(2_000_000) csv!: string;
  @IsOptional() @IsBoolean() dryRun?: boolean;
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
    return this.importer.import(req.user, resortId, dto.csv, dto.dryRun ?? false);
  }
}
