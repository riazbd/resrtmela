import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { PayrollService } from "./payroll.service";

class EmployeeDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(80) designation?: string;
  @IsOptional() @IsNumber() @Min(0) salary?: number;
  @IsOptional() @IsString() joinDate?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class PayrollPayDto {
  @IsString() month!: string; // "2026-09"
  @IsOptional() @IsNumber() @Min(1) amount?: number;
  @IsOptional() @IsIn(["CASH", "BKASH", "NAGAD", "CARD", "BANK"]) method?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
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
  ) {
    return this.payroll.removeEmployee(req.user, id, employeeId);
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
