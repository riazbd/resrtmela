import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { AgencyGuestsService } from "./agency-guests.service";
import { AgencyCalendarService } from "./agency-calendar.service";

/** Who the agency has served, what is free between two dates, and the month. */
@Controller("agent")
@UseGuards(AuthGuard)
export class AgencyGuestsController {
  constructor(
    @Inject(AgencyGuestsService) private readonly guests: AgencyGuestsService,
    @Inject(AgencyCalendarService) private readonly cal: AgencyCalendarService,
  ) {}

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

  @Get("calendar") calendar(
    @Req() req: AuthedRequest,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("resortId") resortId?: string,
  ) {
    return this.cal.calendar(req.user, {
      from,
      to,
      resortId: resortId ? Number(resortId) : undefined,
    });
  }
}
