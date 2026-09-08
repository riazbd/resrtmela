import { Module } from "@nestjs/common";
import { ExportService } from "./export.service";
import { ExportController } from "./export.controller";
import { CommonModule } from "../common/common.module";

@Module({
  imports: [CommonModule],
  providers: [ExportService],
  controllers: [ExportController],
  exports: [ExportService],
})
export class ExportModule {}
