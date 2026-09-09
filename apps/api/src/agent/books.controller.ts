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
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { BooksService } from "./books.service";

class HeadDto {
  @IsString() @MaxLength(80) name!: string;
}

class HeadPatchDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class ExpenseDto {
  @IsString() date!: string;
  @IsInt() headId!: number;
  @IsOptional() @IsString() @MaxLength(255) details?: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() @MaxLength(64) clientRef?: string;
}

class EmployeeDto {
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(80) designation?: string;
  @IsOptional() @IsNumber() @Min(0) salary?: number;
  @IsOptional() @IsString() joinDate?: string;
}

class EmployeePatchDto extends EmployeeDto {
  @IsOptional() @IsString() @MaxLength(120) declare name: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

class PayDto {
  @IsString() month!: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() method?: string;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

/** The agency's own books: what it spends, and who it pays. */
@Controller("agent")
@UseGuards(AuthGuard)
export class BooksController {
  constructor(@Inject(BooksService) private readonly books: BooksService) {}

  // heads & expenses

  @Get("expense-heads") heads(@Req() req: AuthedRequest) {
    return this.books.heads(req.user);
  }

  @Post("expense-heads") createHead(@Req() req: AuthedRequest, @Body() dto: HeadDto) {
    return this.books.createHead(req.user, dto);
  }

  @Patch("expense-heads/:id") updateHead(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: HeadPatchDto,
  ) {
    return this.books.updateHead(req.user, id, dto);
  }

  @Delete("expense-heads/:id") deleteHead(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.books.deleteHead(req.user, id);
  }

  @Get("expenses") expenses(
    @Req() req: AuthedRequest,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("headId") headId?: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    return this.books.expenses(req.user, {
      from,
      to,
      headId: headId ? Number(headId) : undefined,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Post("expenses") addExpense(@Req() req: AuthedRequest, @Body() dto: ExpenseDto) {
    return this.books.addExpense(req.user, dto);
  }

  @Delete("expenses/:id") removeExpense(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.books.removeExpense(req.user, id);
  }

  // payroll

  @Get("employees") employees(@Req() req: AuthedRequest) {
    return this.books.employees(req.user);
  }

  @Post("employees") addEmployee(@Req() req: AuthedRequest, @Body() dto: EmployeeDto) {
    return this.books.addEmployee(req.user, dto);
  }

  @Patch("employees/:id") editEmployee(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: EmployeePatchDto,
  ) {
    return this.books.editEmployee(req.user, id, dto);
  }

  @Delete("employees/:id") removeEmployee(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.books.removeEmployee(req.user, id);
  }

  @Get("payroll") sheet(@Req() req: AuthedRequest, @Query("month") month: string) {
    return this.books.payrollSheet(req.user, month);
  }

  @Post("payroll/:employeeId") pay(
    @Req() req: AuthedRequest,
    @Param("employeeId", ParseIntPipe) employeeId: number,
    @Body() dto: PayDto,
  ) {
    return this.books.pay(req.user, employeeId, dto);
  }

  @Delete("payroll/payment/:id") undoPay(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.books.undoPay(req.user, id);
  }
}
