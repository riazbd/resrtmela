import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { Type } from "class-transformer";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { FbService } from "./fb.service";

class FbItemDto {
  @IsString() @MaxLength(120) name!: string;
  @IsInt() @Min(1) @Type(() => Number) qty!: number;
  @IsNumber() @Min(0) @Type(() => Number) unitPrice!: number;
}

class CreateBillDto {
  @IsDateString() date!: string;
  @IsArray() @Type(() => FbItemDto)
  items!: FbItemDto[];
  @IsOptional() @IsString() @MaxLength(160) guestName?: string;
  @IsOptional() @IsInt() @Type(() => Number) bookingId?: number;
  @IsOptional() @IsInt() @Type(() => Number) roomId?: number;
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number) paidAmount?: number;
  @IsOptional() @IsEnum(["CASH", "BKASH", "NAGAD", "CARD", "BANK"]) method?: "CASH" | "BKASH" | "NAGAD" | "CARD" | "BANK";
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

class PayBillDto {
  @IsNumber() @Min(1) @Type(() => Number) amount!: number;
  @IsOptional() @IsEnum(["CASH", "BKASH", "NAGAD", "CARD", "BANK"]) method?: "CASH" | "BKASH" | "NAGAD" | "CARD" | "BANK";
}

class BillRangeQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class FbController {
  constructor(@Inject(FbService) private readonly fb: FbService) {}

  @Get("resorts/:resortId/fb/in-house")
  inHouse(@Req() req: AuthedRequest, @Param("resortId", ParseIntPipe) resortId: number) {
    return this.fb.inHouse(req.user, resortId);
  }

  @Get("resorts/:resortId/fb/bills")
  list(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query() q: BillRangeQuery,
  ) {
    return this.fb.list(req.user, resortId, q.from, q.to);
  }

  @Post("resorts/:resortId/fb/bills")
  create(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: CreateBillDto,
  ) {
    return this.fb.create(req.user, resortId, dto);
  }

  @Post("fb/bills/:id/pay")
  pay(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: PayBillDto,
  ) {
    return this.fb.addPayment(req.user, id, dto.amount, dto.method);
  }

  @Delete("fb/bills/:id")
  remove(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.fb.remove(req.user, id);
  }
}
