import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthedAuthController, PublicAuthController } from "./auth.controller";

@Module({
  providers: [AuthService],
  controllers: [PublicAuthController, AuthedAuthController],
  exports: [AuthService],
})
export class AuthModule {}
