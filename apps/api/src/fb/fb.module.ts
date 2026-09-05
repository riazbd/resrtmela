import { Module } from "@nestjs/common";
import { FbService } from "./fb.service";
import { FbController } from "./fb.controller";
import { AuditService } from "../common/audit.service";

@Module({
  providers: [FbService, AuditService],
  controllers: [FbController],
  exports: [FbService],
})
export class FbModule {}
