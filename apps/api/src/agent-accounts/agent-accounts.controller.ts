/**
 * Both sides of an agent's account, as HTTP.
 *
 * Two controllers in one file because they are two views of one thing and
 * keeping them apart in the reader's head is the mistake: `resorts/:id/...` is
 * the resort's list of agencies, `agent/accounts/...` is the agency's list of
 * resorts. Every route in the first is gated by `settlement.*` on the resort;
 * every route in the second by an agency permission and by proving the agency
 * has business at that resort.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import { AGENT_DECLARE_KINDS, AGENT_ENTRY_KINDS_STORED, type AgentDeclareKind } from "@rh/shared";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { AgentAccountsService } from "./agent-accounts.service";
import { SettleService } from "./settle.service";
import { AGENT_COLLECT, AGENT_REMIT, MyAccountsService } from "./my-accounts.service";

class StatementQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

/** The one-form door: what came in, and what the agent kept out of it. */
class ReceivedDto {
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsNumber() @Min(0) commission?: number;
  @IsOptional() @IsInt() bookingId?: number;
  @IsString() @MaxLength(24) method!: string;
  @IsOptional() @IsString() @MaxLength(64) trxId?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  /** Offline identity: the same form replayed is still one settlement. */
  @IsOptional() @IsString() @MaxLength(64) clientRef?: string;
}

class EntryDto {
  @IsIn([...AGENT_ENTRY_KINDS_STORED]) kind!: string;
  /** Signed only for ADJUSTMENT; every other kind is forced to its direction. */
  @IsNumber() amount!: number;
  @IsOptional() @IsInt() bookingId?: number;
  @IsOptional() @IsString() @MaxLength(24) method?: string;
  @IsOptional() @IsString() @MaxLength(64) trxId?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsOptional() @IsString() @MaxLength(64) clientRef?: string;
}

class LimitDto {
  /** Null clears it, and null is what every account starts as. */
  @IsOptional() @IsNumber() @Min(0) creditLimit?: number | null;
}

class CollectDto {
  @IsNumber() @Min(0.01) amount!: number;
  @IsString() @MaxLength(24) method!: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsOptional() @IsString() @MaxLength(64) clientRef?: string;
}

class DeclareDto {
  @IsOptional() @IsIn([...AGENT_DECLARE_KINDS]) kind?: AgentDeclareKind;
  @IsNumber() @Min(0.01) amount!: number;
  @IsString() @MaxLength(24) method!: string;
  @IsOptional() @IsString() @MaxLength(64) trxId?: string;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsOptional() @IsString() @MaxLength(64) clientRef?: string;
}

class EarningsQuery {
  @IsOptional() @IsString() @MaxLength(7) month?: string;
}

/** The resort's side: every agency it has anything to settle with. */
@Controller()
@UseGuards(AuthGuard)
export class AgentAccountsController {
  constructor(
    @Inject(AgentAccountsService) private readonly accounts: AgentAccountsService,
    @Inject(SettleService) private readonly settle: SettleService,
  ) {}

  @Get("resorts/:resortId/agent-accounts")
  list(@Req() req: AuthedRequest, @Param("resortId", ParseIntPipe) resortId: number) {
    return this.accounts.accounts(req.user, resortId);
  }

  @Get("resorts/:resortId/agent-accounts/:agencyId")
  statement(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("agencyId", ParseIntPipe) agencyId: number,
    @Query() q: StatementQuery,
  ) {
    return this.accounts.statement(req.user, resortId, agencyId, q);
  }

  @Post("resorts/:resortId/agent-accounts/:agencyId/received")
  received(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("agencyId", ParseIntPipe) agencyId: number,
    @Body() dto: ReceivedDto,
  ) {
    return this.settle.received(req.user, resortId, agencyId, dto);
  }

  @Post("resorts/:resortId/agent-accounts/:agencyId/entries")
  entry(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("agencyId", ParseIntPipe) agencyId: number,
    @Body() dto: EntryDto,
  ) {
    return this.settle.entry(req.user, resortId, agencyId, dto);
  }

  @Put("resorts/:resortId/agent-accounts/:agencyId/limit")
  limit(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("agencyId", ParseIntPipe) agencyId: number,
    @Body() dto: LimitDto,
  ) {
    return this.settle.setLimit(req.user, resortId, agencyId, dto.creditLimit ?? null);
  }

  /**
   * Matching a declaration. Above the `:agencyId` routes would be wrong and
   * below them is fine — `entries` cannot be parsed as an integer, so
   * `ParseIntPipe` refuses it before it can be mistaken for an agency.
   */
  @Patch("resorts/:resortId/agent-accounts/entries/:entryId/confirm")
  confirm(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("entryId") entryId: string,
  ) {
    return this.settle.confirm(req.user, resortId, entryId);
  }

  @Delete("resorts/:resortId/agent-accounts/entries/:entryId")
  remove(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("entryId") entryId: string,
  ) {
    return this.settle.remove(req.user, resortId, entryId);
  }
}

/** The agency's side: every resort it has an account with. */
@Controller()
@UseGuards(AuthGuard)
export class MyAccountsController {
  constructor(
    @Inject(MyAccountsService) private readonly mine: MyAccountsService,
    @Inject(SettleService) private readonly settle: SettleService,
  ) {}

  @Get("agent/accounts")
  list(@Req() req: AuthedRequest) {
    return this.mine.list(req.user);
  }

  @Get("agent/accounts/earnings")
  earnings(@Req() req: AuthedRequest, @Query() q: EarningsQuery) {
    return this.mine.earnings(req.user, q.month ?? new Date().toISOString().slice(0, 7));
  }

  @Get("agent/accounts/:resortId")
  statement(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query() q: StatementQuery,
  ) {
    return this.mine.statement(req.user, resortId, q);
  }

  /** "I sent it by bKash, here is the TrxID." Pending until the resort matches it. */
  @Post("agent/accounts/:resortId/declare")
  async declare(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: DeclareDto,
  ) {
    const agencyId = await this.mine.contextFor(req.user, AGENT_REMIT);
    await this.mine.assertMine(agencyId, resortId);
    return this.settle.declare(req.user, agencyId, resortId, dto);
  }

  @Delete("agent/accounts/declarations/:entryId")
  async withdraw(@Req() req: AuthedRequest, @Param("entryId") entryId: string) {
    const agencyId = await this.mine.contextFor(req.user, AGENT_REMIT);
    return this.settle.withdraw(req.user, agencyId, entryId);
  }

  /** "I took money from the guest." Written on the booking, so the desk knows. */
  @Post("agent/bookings/:bookingId/collect")
  async collect(
    @Req() req: AuthedRequest,
    @Param("bookingId", ParseIntPipe) bookingId: number,
    @Body() dto: CollectDto,
  ) {
    const agencyId = await this.mine.contextFor(req.user, AGENT_COLLECT);
    return this.settle.collect(req.user, agencyId, bookingId, dto);
  }
}
