import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsInt, IsOptional, IsString, MaxLength } from "class-validator";
import { AuthGuard, AuthedRequest } from "../common/auth.guard";
import { AgentService } from "./agent.service";

class AgentRoleDto {
  @IsString() @MaxLength(60) name!: string;
  @IsArray() permissions!: string[];
}

class AgentRolePatchDto {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsArray() permissions?: string[];
}

class AssignRoleDto {
  @IsOptional() @IsInt() roleId?: number | null;
}

/** The agency's own side: its roles, its money, its activity. */
@Controller("agent")
@UseGuards(AuthGuard)
export class AgentController {
  constructor(@Inject(AgentService) private readonly agent: AgentService) {}

  @Get("me") me(@Req() req: AuthedRequest) {
    return this.agent.me(req.user);
  }

  @Get("roles") roles(@Req() req: AuthedRequest) {
    return this.agent.listRoles(req.user);
  }

  @Post("roles") createRole(@Req() req: AuthedRequest, @Body() dto: AgentRoleDto) {
    return this.agent.createRole(req.user, dto);
  }

  @Patch("roles/:id") updateRole(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number, @Body() dto: AgentRolePatchDto) {
    return this.agent.updateRole(req.user, id, dto);
  }

  @Delete("roles/:id") deleteRole(@Req() req: AuthedRequest, @Param("id", ParseIntPipe) id: number) {
    return this.agent.deleteRole(req.user, id);
  }

  @Patch("staff/:userId/role") assignRole(
    @Req() req: AuthedRequest,
    @Param("userId", ParseIntPipe) userId: number,
    @Body() dto: AssignRoleDto,
  ) {
    return this.agent.assignRole(req.user, userId, dto.roleId ?? null);
  }

  @Get("wallet") wallet(@Req() req: AuthedRequest) {
    return this.agent.wallet(req.user);
  }

  @Get("activity") activity(@Req() req: AuthedRequest, @Query("q") q?: string, @Query("take") take?: string) {
    return this.agent.activity(req.user, { q, take: take ? Number(take) : undefined });
  }
}
