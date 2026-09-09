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
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { ToursService } from "./tours.service";

class CategoryDto {
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsInt() parentId?: number | null;
  @IsOptional() @IsInt() sort?: number;
}

class CategoryPatchDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sort?: number;
}

class PackageLineDto {
  @IsOptional() @IsInt() categoryId?: number | null;
  @IsString() @MaxLength(160) label!: string;
  @IsOptional() @IsNumber() @Min(0) qty?: number;
  @IsOptional() @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @IsNumber() @Min(0) unitPrice?: number;
}

class PackageDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(500) summary?: string;
  @IsOptional() @IsInt() @Min(1) days?: number;
  @IsOptional() @IsInt() @Min(0) nights?: number;
  @IsOptional() @IsInt() @Min(1) pax?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PackageLineDto)
  items?: PackageLineDto[];
  @IsOptional() @IsString() @MaxLength(64) clientRef?: string;
}

class PackagePatchDto extends PackageDto {
  @IsOptional() @IsString() @MaxLength(160) declare name: string;
}

/** The agency's tour tree and the packages built from it. */
@Controller("agent/tours")
@UseGuards(AuthGuard)
export class ToursController {
  constructor(@Inject(ToursService) private readonly tours: ToursService) {}

  @Get("categories") categories(@Req() req: AuthedRequest) {
    return this.tours.categories(req.user);
  }

  @Post("categories") createCategory(@Req() req: AuthedRequest, @Body() dto: CategoryDto) {
    return this.tours.createCategory(req.user, dto);
  }

  @Patch("categories/:id") updateCategory(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: CategoryPatchDto,
  ) {
    return this.tours.updateCategory(req.user, id, dto);
  }

  @Delete("categories/:id") deleteCategory(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.tours.deleteCategory(req.user, id);
  }

  @Get("packages") packages(
    @Req() req: AuthedRequest,
    @Query("q") q?: string,
    @Query("active") active?: string,
  ) {
    return this.tours.packages(req.user, {
      q,
      ...(active === undefined ? {} : { active: active === "true" }),
    });
  }

  @Get("packages/:id") package(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.tours.package(req.user, id);
  }

  @Post("packages") createPackage(@Req() req: AuthedRequest, @Body() dto: PackageDto) {
    return this.tours.createPackage(req.user, dto);
  }

  @Patch("packages/:id") updatePackage(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: PackagePatchDto,
  ) {
    return this.tours.updatePackage(req.user, id, dto);
  }

  @Delete("packages/:id") deletePackage(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.tours.deletePackage(req.user, id);
  }
}
