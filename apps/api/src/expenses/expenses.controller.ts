import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Req, UseGuards, Inject } from "@nestjs/common";
import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { ExpensesService } from "./expenses.service";

class CreateExpenseDto {
  @IsDateString() date!: string;
  @IsString() @MaxLength(120) category!: string;
  @IsOptional() @IsString() @MaxLength(255) details?: string;
  @IsNumber() @Min(1) amount!: number;
}

class ExpenseRangeQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class ExpensesController {
  constructor(@Inject(ExpensesService) private readonly expenses: ExpensesService) {}

  @Get("resorts/:resortId/expenses")
  list(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Query() q: ExpenseRangeQuery,
  ) {
    return this.expenses.list(req.user, resortId, q.from, q.to);
  }

  @Get("resorts/:resortId/expenses/categories")
  categories(@Req() req: AuthedRequest, @Param("resortId", ParseIntPipe) resortId: number) {
    return this.expenses.categories(req.user, resortId);
  }

  @Post("resorts/:resortId/expenses")
  create(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expenses.create(req.user, resortId, dto);
  }

  @Delete("expenses/:id")
  remove(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.expenses.remove(req.user, id);
  }
}
