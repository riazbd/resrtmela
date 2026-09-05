import { Global, Module } from "@nestjs/common";
import { ActivitiesService } from "./activities.service";
import { ActivitiesController } from "./activities.controller";

@Global()
@Module({
  providers: [ActivitiesService],
  controllers: [ActivitiesController],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
