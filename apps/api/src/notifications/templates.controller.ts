import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Put, Req, UseGuards } from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { TemplatesService } from "./templates.service";
import type { TemplateName } from "./templates";

class TemplateBodyDto {
  @IsString() @MaxLength(600) body!: string;
}

@Controller()
@UseGuards(AuthGuard)
export class TemplatesController {
  constructor(@Inject(TemplatesService) private readonly templates: TemplatesService) {}

  @Get("resorts/:id/message-templates")
  list(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.templates.list(req.user, id);
  }

  @Put("resorts/:id/message-templates/:name")
  save(
    @Req() req: AuthedRequest,
    @Param("id", ParseIntPipe) id: number,
    @Param("name") name: string,
    @Body() dto: TemplateBodyDto,
  ) {
    return this.templates.save(req.user, id, name as TemplateName, dto);
  }

  /** Back to the built-in wording. */
  @Delete("resorts/:id/message-templates/:name")
  reset(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Param("name") name: string) {
    return this.templates.reset(req.user, id, name as TemplateName);
  }
}
