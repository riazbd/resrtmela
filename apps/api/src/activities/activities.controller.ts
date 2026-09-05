import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional,
  IsString, MaxLength, Min, Max, ValidateNested,
} from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { ActivitiesService } from "./activities.service";

class CreateActivityDto {
  @IsString() @MaxLength(160) name!: string;
  @IsEnum(["TOUR", "WATER_SPORTS", "WELLNESS", "DINING", "ENTERTAINMENT", "OTHER"]) category!: string;
  @IsNumber() @Min(0) basePrice!: number;
  @IsInt() @Min(15) durationMin!: number;
  @IsOptional() @IsInt() @Min(1) minPerSlot?: number;
  @IsOptional() @IsInt() @Min(1) maxPerSlot?: number;
  @IsOptional() @IsString() description?: string;
}

class UpdateActivityDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEnum(["TOUR", "WATER_SPORTS", "WELLNESS", "DINING", "ENTERTAINMENT", "OTHER"]) category?: string;
  @IsOptional() @IsNumber() @Min(0) basePrice?: number;
  @IsOptional() @IsInt() @Min(15) durationMin?: number;
  @IsOptional() @IsInt() @Min(1) minPerSlot?: number;
  @IsOptional() @IsInt() @Min(1) maxPerSlot?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class ScheduleRowDto {
  @IsInt() @Min(0) @Max(6) weekday!: number;
  @IsString() startTime!: string;
  @IsString() endTime!: string;
  @IsInt() @Min(1) capacity!: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

class SetSchedulesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ScheduleRowDto)
  rows!: ScheduleRowDto[];
}

class GenerateDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

class SlotsQuery {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() futureOnly?: boolean;
}

class AddActivityToBookingDto {
  @IsInt() slotId!: number;
  @IsInt() @Min(1) @Type(() => Number) qty!: number;
}

@Controller()
@UseGuards(AuthGuard)
export class ActivitiesController {
  constructor(@Inject(ActivitiesService) private readonly activities: ActivitiesService) {}

  @Get("resorts/:resortId/activities")
  list(@Req() req: AuthedRequest, @Param("resortId", ParseIntPipe) resortId: number) {
    return this.activities.list(req.user, resortId);
  }

  @Post("resorts/:resortId/activities")
  create(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: CreateActivityDto,
  ) {
    return this.activities.create(req.user, resortId, dto);
  }

  @Patch("activities/:id")
  update(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: UpdateActivityDto) {
    return this.activities.update(req.user, id, dto);
  }

  @Put("activities/:id/schedules")
  setSchedules(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: SetSchedulesDto) {
    return this.activities.setSchedules(req.user, id, dto.rows);
  }

  @Post("activities/:id/generate")
  generate(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: GenerateDto) {
    return this.activities.generate(req.user, id, dto.from, dto.to);
  }

  @Get("resorts/:resortId/activities/:catalogId/slots")
  slots(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("catalogId", ParseIntPipe) catalogId: number,
    @Query() q: SlotsQuery,
  ) {
    return this.activities.slotsList(req.user, resortId, catalogId, q.from, q.to, q.futureOnly ?? false);
  }

  @Delete("activity-slots/:id")
  deleteSlot(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.activities.deleteSlot(req.user, id);
  }

  // ── attach to bookings (staff) ──
  @Post("bookings/:bookingId/activities")
  addToBooking(
    @Req() req: AuthedRequest,
    @Param("bookingId", ParseIntPipe) bookingId: number,
    @Body() dto: AddActivityToBookingDto,
  ) {
    return this.activities.addToBooking(req.user, bookingId, dto.slotId, dto.qty);
  }

  @Delete("bookings/:bookingId/activities/:itemId")
  removeFromBooking(
    @Req() req: AuthedRequest,
    @Param("bookingId", ParseIntPipe) bookingId: number,
    @Param("itemId", ParseIntPipe) itemId: number,
  ) {
    return this.activities.removeFromBooking(req.user, bookingId, itemId);
  }
}
