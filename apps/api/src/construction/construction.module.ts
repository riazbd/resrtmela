import { Module } from "@nestjs/common";
import { ConstructionService } from "./construction.service";
import { ConstructionController } from "./construction.controller";
import { AuditService } from "../common/audit.service";

@Module({
  providers: [ConstructionService, AuditService],
  controllers: [ConstructionController],
  exports: [ConstructionService],
})
export class ConstructionModule {}
