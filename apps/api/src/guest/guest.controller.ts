import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString,
  MaxLength, Min, ValidateNested,
} from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { GuestService } from "./guest.service";

class RoomTypeQtyDto {
  @IsInt() @Min(1) roomTypeId!: number;
  @IsInt() @Min(1) @Type(() => Number) qty!: number;
}

class GuestBookingDto {
  @IsInt() resortId!: number;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true })
  @Type(() => RoomTypeQtyDto)
  items!: RoomTypeQtyDto[];
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @IsInt() @Min(1) adults!: number;
  @IsOptional() @IsInt() @Min(0) children?: number;
  @IsOptional() @IsString() @MaxLength(160) fullName?: string;
  @IsOptional() @IsString() @MaxLength(500) remarks?: string;
}

class GuestAvailQuery {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

@Controller("guest")
export class GuestController {
  constructor(@Inject(GuestService) private readonly guest: GuestService) {}

  /** Marketplace â€” all active resorts (no guest role required to browse). */
  @Get("resorts")
  discover() {
    return this.guest.discover();
  }

  @Get("resorts/:id")
  detail(@Param("id", ParseIntPipe) id: number) {
    return this.guest.resortDetail(id);
  }

  @UseGuards(AuthGuard)
  @Get("resorts/:id/availability")
  availability(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Query() q: GuestAvailQuery,
  ) {
    return this.guest.availability(req.user, id, q.from, q.to);
  }

  @UseGuards(AuthGuard)
  @Post("bookings")
  book(@Req() req: AuthedRequest, @Body() dto: GuestBookingDto) {
    return this.guest.createBooking(req.user, {
      resortId: dto.resortId,
      items: dto.items,
      checkIn: dto.checkIn,
      checkOut: dto.checkOut,
      adults: dto.adults,
      children: dto.children ?? 0,
      fullName: dto.fullName,
      remarks: dto.remarks,
    });
  }

  @UseGuards(AuthGuard)
  @Get("bookings")
  trips(@Req() req: AuthedRequest) {
    return this.guest.trips(req.user);
  }

  @UseGuards(AuthGuard)
  @Get("bookings/:id")
  trip(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.guest.tripDetail(req.user, id);
  }

  @UseGuards(AuthGuard)
  @Post("bookings/:id/cancel")
  cancel(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.guest.cancelOwn(req.user, id);
  }

  @UseGuards(AuthGuard)
  @Get("activities/:catalogId/slots")
  activitySlots(
    @Req() req: AuthedRequest,
    @Param("catalogId", ParseIntPipe) catalogId: number,
    @Query("days") daysStr?: string,
  ) {
    return this.guest.upcomingActivitySlots(catalogId, Number(daysStr) || 7);
  }

  @UseGuards(AuthGuard)
  @Post("bookings/:id/activities")
  addActivity(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: { slotId: number; qty: number },
  ) {
    if (!dto?.slotId || !dto?.qty || dto.qty < 1) {
      throw Object.assign(new Error("slotId and qty (>=1) required"), { status: 400 });
    }
    return this.guest.addActivityToTrip(req.user, id, dto.slotId, dto.qty);
  }

  @UseGuards(AuthGuard)
  @Delete("bookings/:id/activities/:itemId")
  removeActivity(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("itemId", ParseIntPipe) itemId: number,
  ) {
    return this.guest.removeActivityFromTrip(req.user, id, itemId);
  }
}
