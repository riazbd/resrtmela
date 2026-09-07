import { Module } from "@nestjs/common";
import { EngageService } from "./engage.service";
import { EngageController } from "./engage.controller";
import { CommonModule } from "../common/common.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [CommonModule, NotificationsModule],
  providers: [EngageService],
  controllers: [EngageController],
  exports: [EngageService],
})
export class EngageModule {}
