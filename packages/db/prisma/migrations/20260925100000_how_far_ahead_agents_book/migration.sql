-- Empty is no limit, which is how every resort was before this.
ALTER TABLE `resorts` ADD COLUMN `agentBookingWindowDays` INTEGER NULL;
