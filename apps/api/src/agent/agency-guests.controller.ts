import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { AgencyGuestsService } from "./agency-guests.service";

/** Who the agency has served, and what is free between two dates. */
@Controller("agent")
@UseGuards(AuthGuard)
export class AgencyGuestsController {
  constructor(@Inject(AgencyGuestsService) private readonly guests: AgencyGuestsService) {}

  @Get("guests") list(@Req() req: AuthedRequest, @Query("q") q?: string, @Query("take") take?: string) {
    return this.guests.list(req.user, { q, take: take ? Number(take) : undefined });
  }

  @Get("rooms") rooms(
    @Req() req: AuthedRequest,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("resortId") resortId?: string,
  ) {
    return this.guests.rooms(req.user, {
      from,
      to,
      resortId: resortId ? Number(resortId) : undefined,
    });
  }
}
