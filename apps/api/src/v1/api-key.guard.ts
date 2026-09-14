import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { ApiKeyService, type ApiCaller } from "./api-key.service";

/** The request, once a key has been believed. */
export interface KeyedRequest extends Request {
  caller: ApiCaller;
}

/**
 * The door to `/v1`.
 *
 * `Authorization: Bearer rm_live_…`, which is where every HTTP client already
 * looks. One refusal for every way a key can be wrong — absent, malformed,
 * unknown, revoked — because telling a stranger which of them it was is telling
 * them how to get closer.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@Inject(ApiKeyService) private readonly keys: ApiKeyService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<KeyedRequest>();
    const header = req.headers.authorization ?? "";
    const secret = header.startsWith("Bearer ") ? header.slice(7) : "";
    const caller = await this.keys.authenticate(secret);
    if (!caller) {
      throw Object.assign(new Error("A valid API key is required."), { status: 401 });
    }
    req.caller = caller;
    return true;
  }
}
