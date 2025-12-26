-- AlterTable
ALTER TABLE `job` ADD COLUMN `shopId` INTEGER NULL,
    ADD COLUMN `startedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Job_shopId_idx` ON `Job`(`shopId`);

-- CreateIndex
CREATE INDEX `Job_createdAt_idx` ON `Job`(`createdAt`);

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
