import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { PaymentsService } from "./payments.service";

class AddPaymentDto {
  @IsNumber() @Min(1) amount!: number;
  @IsEnum(["CASH", "BKASH", "NAGAD", "CARD", "BANK"]) method!: "CASH" | "BKASH" | "NAGAD" | "CARD" | "BANK";
  @IsOptional() @IsEnum(["ADVANCE", "FINAL", "REFUND"]) type?: "ADVANCE" | "FINAL" | "REFUND";
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post("bookings/:bookingId/payments")
  add(
    @Req() req: AuthedRequest,
    @Param("bookingId", ParseIntPipe) bookingId: number,
    @Body() dto: AddPaymentDto,
  ) {
    return this.payments.addPayment(req.user, bookingId, dto);
  }

  @Get("resorts/:resortId/dues")
  dues(@Req() req: AuthedRequest, @Param("resortId", ParseIntPipe) resortId: number) {
    return this.payments.dues(req.user, resortId);
  }
}
