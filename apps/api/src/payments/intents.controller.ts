import { Body, Controller, Get, Param, Post, Req, UseGuards, Inject } from "@nestjs/common";
import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { IntentsService } from "./intents.service";

class CheckoutDto {
  @IsString() method!: string; // validated in service against online methods
  @IsNumber() @Min(1) amount!: number;
}

class ConfirmDto {
  @IsOptional() @IsString() @MaxLength(64) trxId?: string;
  @IsOptional() @IsString() outcome?: string; // "fail" simulates gateway failure
}

@Controller()
export class IntentsController {
  constructor(@Inject(IntentsService) private readonly intents: IntentsService) {}

  @Post("bookings/:bookingId/checkout")
  @UseGuards(AuthGuard)
  checkout(
    @Req() req: AuthedRequest,
    @Param("bookingId") bookingId: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.intents.createCheckout(req.user, Number(bookingId), {
      method: dto.method as "BKASH" | "NAGAD",
      amount: dto.amount,
    });
  }

  /**
   * The gateway's server-to-server callback: POST /payments/webhook/:provider
   *
   * Deliberately unvalidated at this layer — the body is whatever the gateway
   * chose to send, and different gateways send different shapes. It is also
   * why nothing in it is trusted: the service asks the gateway what actually
   * happened rather than believing the POST, which previously let anyone on
   * the internet mark any booking paid by guessing a reference.
   */
  @Post("payments/webhook/:provider")
  webhook(@Param("provider") provider: string, @Body() body: Record<string, unknown>) {
    void provider; // the configured gateway decides how to read this, not the URL
    return this.intents.confirmFromGateway(body ?? {});
  }

  /** Dev mock-gateway confirm (what the hosted checkout page would call). */
  @Post("mock-checkout/:ref/confirm")
  @UseGuards(AuthGuard)
  mockConfirm(@Param("ref") ref: string, @Body() dto: ConfirmDto) {
    return this.intents.confirm(ref, dto.trxId ?? `mock-${Date.now()}`, dto.outcome === "fail");
  }

  @Get("payments/:ref/status")
  @UseGuards(AuthGuard)
  status(@Param("ref") ref: string) {
    return this.intents.status(ref);
  }
}
