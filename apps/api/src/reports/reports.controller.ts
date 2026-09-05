import { Controller, Get, Param, ParseIntPipe, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { ReportsService } from "./reports.service";

@Controller()
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get("resorts/:resortId/reports/agents")
  agents(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.agents(req.user, resortId, from, to);
  }

  @Get("resorts/:resortId/reports/sources")
  sources(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.sources(req.user, resortId, from, to);
  }

  @Get("resorts/:resortId/reports/collectors")
  collectors(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.collectors(req.user, resortId, from, to);
  }

  @Get("resorts/:resortId/metrics")
  metrics(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.metrics(req.user, resortId, from, to);
  }

  @Get("resorts/:resortId/reports/daily")
  daily(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query("from") from: string,
    @Query("to") to: string,
  ) {
    return this.reports.daily(req.user, resortId, from, to);
  }

  @Get("resorts/:resortId/audit")
  audit(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query("take") takeStr?: string,
  ) {
    return this.reports.audit(req.user, resortId, Number(takeStr) || 100);
  }

  @Get("agents/me/report")
  myReport(
    @Req() req: AuthedRequest,
    @Query("resortId", ParseIntPipe) resortId: number,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    return this.reports.myReport(req.user, resortId, from, to);
  }
}
