import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { RoomsService } from "./rooms.service";

class CreateRoomTypeDto {
  @IsString() @MaxLength(120) name!: string;
  @IsInt() @Min(1) maxAdults!: number;
  @IsOptional() @IsInt() @Min(0) maxChildren?: number;
  @IsOptional() amenities?: string[];
}

class CreateRoomDto {
  @IsString() @MaxLength(120) name!: string;
  @IsInt() roomTypeId!: number;
  @IsNumber() @Min(0) baseRate!: number;
}

class UpdateRoomDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) baseRate?: number;
  @IsOptional() @IsEnum(["ACTIVE", "OUT_OF_SERVICE"]) status?: "ACTIVE" | "OUT_OF_SERVICE";
}

class CreateRatePlanDto {
  @IsInt() roomTypeId!: number;
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsNumber() @Min(0) price!: number;
}

@Controller()
@UseGuards(AuthGuard)
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}

  @Get("resorts/:resortId/room-types")
  listRoomTypes(@Req() req: AuthedRequest, @Param("resortId", ParseIntPipe) resortId: number) {
    return this.rooms.listRoomTypes(req.user, resortId);
  }

  @Post("resorts/:resortId/room-types")
  createRoomType(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: CreateRoomTypeDto,
  ) {
    return this.rooms.createRoomType(req.user, resortId, dto);
  }

  @Get("resorts/:resortId/rooms")
  listRooms(@Req() req: AuthedRequest, @Param("resortId", ParseIntPipe) resortId: number) {
    return this.rooms.listRooms(req.user, resortId);
  }

  @Post("resorts/:resortId/rooms")
  createRoom(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: CreateRoomDto,
  ) {
    return this.rooms.createRoom(req.user, resortId, dto);
  }

  @Patch("rooms/:id")
  updateRoom(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: UpdateRoomDto) {
    return this.rooms.updateRoom(req.user, id, dto);
  }

  @Get("resorts/:resortId/rate-plans")
  listRatePlans(@Req() req: AuthedRequest, @Param("resortId", ParseIntPipe) resortId: number) {
    return this.rooms.listRatePlans(req.user, resortId);
  }

  @Post("resorts/:resortId/rate-plans")
  createRatePlan(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: CreateRatePlanDto,
  ) {
    return this.rooms.createRatePlan(req.user, resortId, dto);
  }
}
