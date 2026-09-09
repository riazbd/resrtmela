import {
  Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Patch, Post, Req, UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { OptionsService } from "./options.service";
import { OPTION_LISTS, OPTION_LIST_NAMES, isOptionList, type OptionList } from "./registry";
import { badRequest } from "../common/rbac";

class CreateOptionDto {
  @IsString() @MinLength(2) @MaxLength(32) code!: string;
  @IsString() @MinLength(1) @MaxLength(60) label!: string;
  @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

class UpdateOptionDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(60) label?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsObject() meta?: Record<string, unknown>;
}

/**
 * The lists a resort owns: payment methods, booking sources, activity
 * categories. One set of routes for all of them — a list is addressed by name,
 * so making the next thing dynamic costs a registry entry rather than a
 * controller.
 */
@Controller()
@UseGuards(AuthGuard)
export class OptionsController {
  constructor(@Inject(OptionsService) private readonly options: OptionsService) {}

  /** What lists exist, and what each is called. */
  @Get("option-lists")
  lists() {
    return OPTION_LIST_NAMES.map((name) => ({ name, label: OPTION_LISTS[name].label }));
  }

  @Get("resorts/:resortId/options/:list")
  list(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("list") list: string,
  ) {
    return this.options.list(req.user, resortId, this.named(list));
  }

  @Post("resorts/:resortId/options/:list")
  create(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("list") list: string,
    @Body() dto: CreateOptionDto,
  ) {
    return this.options.create(req.user, resortId, this.named(list), dto);
  }

  @Patch("resorts/:resortId/options/:list/:id")
  update(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateOptionDto,
  ) {
    return this.options.update(req.user, resortId, id, dto);
  }

  @Delete("resorts/:resortId/options/:list/:id")
  remove(
    @Req() req: AuthedRequest,
    @Param("resortId", ParseIntPipe) resortId: number,
    @Param("id", ParseIntPipe) id: number,
  ) {
    return this.options.remove(req.user, resortId, id);
  }

  /** A list name from the URL, or a 400 that says which names exist. */
  private named(list: string): OptionList {
    const upper = list.toUpperCase().replace(/-/g, "_");
    if (!isOptionList(upper)) {
      throw badRequest(`Unknown list "${list}" — expected one of ${OPTION_LIST_NAMES.join(", ")}`);
    }
    return upper;
  }
}
