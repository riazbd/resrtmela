import { Controller, Get, Header, Inject, Param, ParseIntPipe, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { ExportService, DATASETS } from "./export.service";

@Controller()
@UseGuards(AuthGuard)
export class ExportController {
  constructor(@Inject(ExportService) private readonly exporter: ExportService) {}

  /** What can be exported — so the UI never has to hard-code the list. */
  @Get("resorts/:id/export") datasets() {
    return { datasets: DATASETS };
  }

  /** Everything, as one JSON document. */
  @Get("resorts/:id/export/archive")
  archive(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.exporter.archive(req.user, id);
  }

  /**
   * One dataset as a file. The filename carries the resort and the date because
   * these land in a folder of other exports and "bookings.csv" tells you nothing
   * three months later.
   */
  @Get("resorts/:id/export/:name.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  async csv(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("name") name: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const body = await this.exporter.csv(req.user, id, name);
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="${name}-${id}-${day}.csv"`);
    return body;
  }
}
