import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray, IsBoolean, IsDateString, IsInt, IsNumber, IsObject, IsOptional,
  IsString, Max, MaxLength, Min, ArrayMinSize, ValidateNested, IsEnum,
} from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { BookingsService, CreateBookingInput } from "./bookings.service";
import { AvailabilityService } from "./availability.service";
import { BookingSource, type BookingState } from "@rh/db";

class GuestInlineDto {
  @IsString() @MaxLength(160) fullName!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() nidPassportNo?: string;
  @IsOptional() @IsString() @MaxLength(191) email?: string;
}
// email added below via patch if missing

class CreateGroupDto {
  @IsInt() resortId!: number;
  @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) roomIds!: number[];
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @IsObject() @ValidateNested() @Type(() => GuestInlineDto) guest!: GuestInlineDto;
  @IsInt() @Min(1) adults!: number;
  @IsOptional() @IsInt() @Min(0) children?: number;
  @IsOptional() @IsNumber() @Min(0) discountPerRoom?: number;
  @IsOptional() @IsNumber() @Min(0) advancePerRoom?: number;
  @IsOptional() @IsEnum(["CASH", "BKASH", "NAGAD", "CARD", "BANK"]) advanceMethod?: "CASH" | "BKASH" | "NAGAD" | "CARD" | "BANK";
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsEnum(BookingSource) source?: BookingSource;
}
class AdvancePaymentDto {
  @IsNumber() @Min(1) amount!: number;
  @IsEnum(["CASH", "BKASH", "NAGAD", "CARD", "BANK"]) method!: "CASH" | "BKASH" | "NAGAD" | "CARD" | "BANK";
}

class CreateBookingDto {
  @IsInt() resortId!: number;
  @IsArray() @ArrayMinSize(1) @IsInt({ each: true }) roomIds!: number[];
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @IsOptional() @IsInt() guestId?: number;
  @IsOptional() @ValidateNested() @Type(() => GuestInlineDto) guest?: GuestInlineDto;
  @IsInt() @Min(1) adults!: number;
  @IsOptional() @IsInt() @Min(0) children?: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsString() remarks?: string;
  @IsOptional() @IsEnum(BookingSource) source?: BookingSource;
  @IsOptional() @ValidateNested() @Type(() => AdvancePaymentDto) advancePayment?: AdvancePaymentDto;
}

class ListBookingsQuery {
  @IsOptional() @IsString() @MaxLength(24) group?: string;
  @Type(() => Number) @IsInt() resortId!: number;
  @IsOptional() @IsEnum(BookingSource) source?: BookingSource;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @Type(() => Number) @IsInt() guestId?: number;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() skip?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Max(200) take?: number;
}

class UpdateBookingDto {
  @IsOptional() @IsDateString() checkIn?: string;
  @IsOptional() @IsDateString() checkOut?: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) roomIds?: number[];
  @IsOptional() @IsInt() @Min(1) adults?: number;
  @IsOptional() @IsInt() @Min(0) children?: number;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsString() remarks?: string;
}

class TransitionDto {
  @IsEnum(["PENDING", "CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "CANCELLED", "NO_SHOW"])
  to!: "PENDING" | "CONFIRMED" | "CHECKED_IN" | "CHECKED_OUT" | "CANCELLED" | "NO_SHOW";
}

class CancelRequestDto {
  @IsOptional() @IsString() reason?: string;
}

class CancelDecisionDto {
  @IsBoolean() approve!: boolean;
}

class AvailabilityQuery {
  @Type(() => Number) resortId!: number;
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

@Controller()
@UseGuards(AuthGuard)
export class BookingsController {
  constructor(
    @Inject(BookingsService) private readonly bookings: BookingsService,
    @Inject(AvailabilityService) private readonly availability: AvailabilityService,
  ) {}

  @Get("resorts/:resortId/availability")
  grid(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query() q: AvailabilityQuery,
  ) {
    return this.availability.roomsGrid(req.user, resortId, q.from, q.to);
  }

  @Get("resorts/:resortId/today")
  today(@Req() req: AuthedRequest, @Param("resortId", ParseIntPipe) resortId: number) {
    return this.bookings.today(req.user, resortId);
  }

  @Get("resorts/:resortId/day-sheet")
  daySheet(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query("date") date: string,
  ) {
    return this.bookings.daySheet(req.user, resortId, date || new Date().toISOString().slice(0, 10));
  }

  @Get("resorts/:resortId/calendar")
  calendar(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query() q: AvailabilityQuery,
  ) {
    return this.bookings.calendar(req.user, resortId, q.from, q.to);
  }

  @Get("resorts/:resortId/guests")
  guests(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query("search") search?: string,
  ) {
    return this.bookings.guests(req.user, resortId, search);
  }

  @Post("bookings")
  create(@Req() req: AuthedRequest, @Body() dto: CreateBookingDto) {
    const input: CreateBookingInput = {
      resortId: dto.resortId,
      roomIds: dto.roomIds,
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      guestId: dto.guestId,
      guest: dto.guest,
      adults: dto.adults,
      children: dto.children ?? 0,
      discount: dto.discount,
      remarks: dto.remarks,
      source: dto.source,
      advancePayment: dto.advancePayment,
    };
    return this.bookings.create(req.user, input);
  }

  /** Tour-group: N one-room bookings, one flow. */
  @Post("bookings/group")
  createGroup(@Req() req: AuthedRequest, @Body() dto: CreateGroupDto) {
    return this.bookings.createGroupBooking(req.user, dto);
  }


  @Get("bookings")
  list(@Req() req: AuthedRequest, @Query() q: ListBookingsQuery) {
    return this.bookings.list(req.user, { ...q, state: q.state as BookingState });
  }

  @Get("bookings/cancel-requests")
  cancelRequests(@Req() req: AuthedRequest, @Query("resortId", ParseIntPipe) resortId: number) {
    return this.bookings.listCancelRequests(req.user, resortId);
  }

  @Get("bookings/:id")
  detail(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.bookings.detail(req.user, id);
  }

  @Patch("bookings/:id")
  update(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: UpdateBookingDto) {
    return this.bookings.update(req.user, id, dto);
  }

  @Post("bookings/:id/transition")
  transition(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: TransitionDto) {
    return this.bookings.transition(req.user, id, dto.to);
  }

  @Post("bookings/:id/cancel-request")
  requestCancel(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CancelRequestDto,
  ) {
    return this.bookings.requestCancel(req.user, id, dto.reason);
  }

  @Post("bookings/:id/cancel-decision")
  decideCancel(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CancelDecisionDto,
  ) {
    return this.bookings.decideCancel(req.user, id, dto.approve);
  }

  @Post("bookings/:id/email-invoice")
  emailInvoice(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.bookings.emailInvoice(req.user, id);
  }

  @Post("bookings/:id/invoice")
  generateInvoice(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.bookings.generateInvoice(req.user, id);
  }

  @Get("bookings/:id/invoice")
  invoice(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.bookings.invoicePayload(req.user, id);
  }

  @Delete("bookings/:id")
  softDelete(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.bookings.softDelete(req.user, id);
  }
}
