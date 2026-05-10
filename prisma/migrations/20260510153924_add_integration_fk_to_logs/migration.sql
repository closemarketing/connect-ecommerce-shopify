-- AlterTable
ALTER TABLE `synclog` ADD COLUMN `integrationId` INTEGER NULL;

-- AlterTable
ALTER TABLE `webhooklog` ADD COLUMN `integrationId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `SyncLog_integrationId_idx` ON `SyncLog`(`integrationId`);

-- CreateIndex
CREATE INDEX `WebhookLog_integrationId_idx` ON `WebhookLog`(`integrationId`);

-- AddForeignKey
ALTER TABLE `SyncLog` ADD CONSTRAINT `SyncLog_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `Integration`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebhookLog` ADD CONSTRAINT `WebhookLog_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `Integration`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
