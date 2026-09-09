import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Type } from "class-transformer";
import {
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { SalesService, type DocKind } from "./sales.service";

class DocLineDto {
  @IsString() @MaxLength(200) label!: string;
  @IsOptional() @IsString() @MaxLength(500) details?: string;
  @IsOptional() @IsNumber() @Min(0) qty?: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
}

class DocDto {
  @IsIn(["QUOTATION", "INVOICE"]) kind!: DocKind;
  @IsString() @MaxLength(160) clientName!: string;
  @IsOptional() @IsEmail() clientEmail?: string;
  @IsOptional() @IsString() @MaxLength(32) clientPhone?: string;
  @IsOptional() @IsString() @MaxLength(255) clientAddress?: string;
  @IsOptional() @IsInt() guestId?: number;
  @IsOptional() @IsInt() packageId?: number;
  @IsString() issueDate!: string;
  @IsOptional() @IsString() validUntil?: string;
  @IsOptional() @IsNumber() @Min(0) discount?: number;
  @IsOptional() @IsNumber() @Min(0) taxRate?: number;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() terms?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => DocLineDto)
  items?: DocLineDto[];
  @IsOptional() @IsString() @MaxLength(64) clientRef?: string;
}

class DocPatchDto extends DocDto {
  @IsOptional() @IsIn(["QUOTATION", "INVOICE"]) declare kind: DocKind;
  @IsOptional() @IsString() @MaxLength(160) declare clientName: string;
  @IsOptional() @IsString() declare issueDate: string;
}

class SendDto {
  @IsOptional() @IsEmail() to?: string;
  @IsOptional() @IsString() @MaxLength(2000) message?: string;
}

class DocPaymentDto {
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() @MaxLength(255) note?: string;
  @IsOptional() @IsString() @MaxLength(64) clientRef?: string;
}

class StatusDto {
  @IsIn(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "VOID"]) status!: string;
}

/** Quotations and invoices. */
@Controller("agent/sales")
@UseGuards(AuthGuard)
export class SalesController {
  constructor(@Inject(SalesService) private readonly sales: SalesService) {}

  @Get() list(
    @Req() req: AuthedRequest,
    @Query("kind") kind?: DocKind,
    @Query("status") status?: string,
    @Query("q") q?: string,
  ) {
    return this.sales.list(req.user, { kind, status, q });
  }

  @Get(":id") get(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.sales.get(req.user, id);
  }

  /** The same markup the client is emailed — the browser prints it to PDF. */
  @Get(":id/print")
  @Header("Content-Type", "text/html; charset=utf-8")
  print(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.sales.preview(req.user, id);
  }

  @Post() create(@Req() req: AuthedRequest, @Body() dto: DocDto) {
    return this.sales.create(req.user, dto);
  }

  @Patch(":id") update(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DocPatchDto,
  ) {
    return this.sales.update(req.user, id, dto);
  }

  @Post(":id/convert") convert(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.sales.convert(req.user, id);
  }

  @Post(":id/send") send(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: SendDto,
  ) {
    return this.sales.send(req.user, id, dto);
  }

  @Post(":id/payments") pay(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: DocPaymentDto,
  ) {
    return this.sales.recordPayment(req.user, id, dto);
  }

  @Patch(":id/status") setStatus(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: StatusDto,
  ) {
    return this.sales.setStatus(req.user, id, dto.status);
  }

  @Delete(":id") remove(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.sales.remove(req.user, id);
  }
}
