import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { PAYROLL_ADJUSTMENT_KINDS, PAYROLL_PAYMENT_KINDS } from "@rh/shared";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { PayrollService } from "./payroll.service";

class EmployeeDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(80) designation?: string;
  @IsOptional() @IsNumber() @Min(0) salary?: number;
  @IsOptional() @IsString() joinDate?: string;
  @IsOptional() @IsString() leftDate?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  /** the app login this person uses; 0 unlinks */
  @IsOptional() @IsInt() @Min(0) userId?: number;
}

export class PayrollAdjustDto {
  @IsString() month!: string;
  @IsIn([...PAYROLL_ADJUSTMENT_KINDS]) kind!: string;
  @IsNumber() @Min(1) amount!: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

class PayrollPayDto {
  @IsString() month!: string; // "2026-09"
  @IsOptional() @IsNumber() @Min(1) amount?: number;
  @IsOptional() @IsIn(["CASH", "BKASH", "NAGAD", "CARD", "BANK"]) method?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  /**
   * Against the declared vocabulary, not a free string. Absent means SALARY,
   * which is what every caller written before advances existed meant.
   */
  @IsOptional() @IsIn([...PAYROLL_PAYMENT_KINDS]) kind?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class PayrollController {
  constructor(@Inject(PayrollService) private readonly payroll: PayrollService) {}

  @Get("resorts/:id/payroll/employees")
  employees(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.payroll.employees(req.user, id);
  }
  @Post("resorts/:id/payroll/employees")
  addEmployee(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: EmployeeDto) {
    return this.payroll.addEmployee(req.user, id, dto);
  }
  @Patch("resorts/:id/payroll/employees/:employeeId")
  editEmployee(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("employeeId", ParseIntPipe) employeeId: number,
    @Body() dto: EmployeeDto,
  ) {
    return this.payroll.editEmployee(req.user, id, employeeId, dto);
  }
  @Delete("resorts/:id/payroll/employees/:employeeId")
  removeEmployee(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("employeeId", ParseIntPipe) employeeId: number,
    @Query("leftDate") leftDate?: string,
  ) {
    return this.payroll.removeEmployee(req.user, id, employeeId, leftDate);
  }
  @Get("resorts/:id/payroll/people")
  people(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.payroll.people(req.user, id);
  }
  @Get("resorts/:id/payroll/year")
  year(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Query("year", ParseIntPipe) year: number) {
    return this.payroll.year(req.user, id, year);
  }
  @Post("resorts/:id/payroll/employees/:employeeId/adjust")
  adjust(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("employeeId", ParseIntPipe) employeeId: number,
    @Body() dto: PayrollAdjustDto,
  ) {
    return this.payroll.adjust(req.user, id, employeeId, dto);
  }
  @Delete("payroll/adjustments/:adjustmentId")
  unadjust(@Req() req: AuthedRequest, @Param("adjustmentId", ParseIntPipe) adjustmentId: number) {
    return this.payroll.unadjust(req.user, adjustmentId);
  }
  /** Whoever is signed in: their own pay, wherever they are on payroll. */
  @Get("me/pay")
  mine(@Req() req: AuthedRequest) {
    return this.payroll.mine(req.user);
  }
  @Get("resorts/:id/payroll")
  sheet(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Query("month") month: string) {
    return this.payroll.sheet(req.user, id, month);
  }
  @Post("resorts/:id/payroll/employees/:employeeId/pay")
  pay(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("employeeId", ParseIntPipe) employeeId: number,
    @Body() dto: PayrollPayDto,
  ) {
    return this.payroll.pay(req.user, id, employeeId, dto);
  }
  @Delete("payroll/payments/:paymentId")
  undoPay(@Req() req: AuthedRequest, @Param("paymentId", ParseIntPipe) paymentId: number) {
    return this.payroll.undoPay(req.user, paymentId);
  }
}
