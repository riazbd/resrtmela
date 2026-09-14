import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";
import { AuthGuard, type AuthedRequest } from "../common/auth.guard";
import { ResortDomainService } from "./resort-domain.service";

class ClaimDto {
  @IsString() @MaxLength(253) host!: string;
}

/** The owner's own domains: claim one, prove it, choose which is the address. */
@UseGuards(AuthGuard)
@Controller("resorts/:id/domains")
export class ResortDomainController {
  constructor(@Inject(ResortDomainService) private readonly domains: ResortDomainService) {}

  @Get()
  list(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.domains.list(req.user, id);
  }

  @Post()
  claim(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: ClaimDto) {
    return this.domains.claim(req.user, id, dto.host);
  }

  @Post(":domainId/verify")
  verify(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("domainId", ParseIntPipe) domainId: number,
  ) {
    return this.domains.verify(req.user, id, domainId);
  }

  @Post(":domainId/canonical")
  canonical(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("domainId", ParseIntPipe) domainId: number,
  ) {
    return this.domains.setCanonical(req.user, id, domainId);
  }

  @Delete(":domainId")
  remove(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("domainId", ParseIntPipe) domainId: number,
  ) {
    return this.domains.remove(req.user, id, domainId);
  }
}

/**
 * Whose site answers at a host.
 *
 * Open, because the caller is the website's own middleware deciding what to
 * render before anybody has signed in to anything. It gives a slug and nothing
 * else — the same 404 for an unknown host, an unproved one, and a `Host` header
 * that is not a hostname, because all three mean the same thing to the caller.
 *
 * Its own prefix rather than `/site/by-domain`: that sits under
 * `@Get(":slug")` on the published controller, and which of the two answers
 * depends on the order the module lists them. It resolved to "no resort is
 * called by-domain" — a 404 that looked exactly like an unknown host and meant
 * something else entirely. A path that cannot collide is worth more than a
 * comment asking the next person not to reorder anything.
 */
@Controller("domains")
export class DomainLookupController {
  constructor(@Inject(ResortDomainService) private readonly domains: ResortDomainService) {}

  @Get("lookup")
  async byDomain(@Query("host") host: string) {
    const found = host ? await this.domains.byHost(host) : null;
    if (!found) throw Object.assign(new Error("No site at that address"), { status: 404 });
    return found;
  }
}
