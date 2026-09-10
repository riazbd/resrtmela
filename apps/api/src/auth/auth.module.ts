import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { PasswordResetService } from "./password-reset.service";
import { AuthedAuthController, PublicAuthController } from "./auth.controller";

@Module({
  providers: [AuthService, PasswordResetService],
  controllers: [PublicAuthController, AuthedAuthController],
  exports: [AuthService],
})
export class AuthModule {}
