-- AlterTable: add HOLDED_PRODUCT to SyncType enum
ALTER TABLE `SyncLog` MODIFY `syncType` ENUM('CUSTOMER', 'PRODUCT', 'DEAL', 'ORDER', 'PIPELINE', 'STAGE', 'HOLDED_PRODUCT') NOT NULL;

-- CreateTable
CREATE TABLE `HoldedSyncJob` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `totalProducts` INTEGER NULL,
    `syncedProducts` INTEGER NOT NULL DEFAULT 0,
    `errorCount` INTEGER NOT NULL DEFAULT 0,
    `log` LONGTEXT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `HoldedSyncJob_shopId_idx`(`shopId`),
    INDEX `HoldedSyncJob_status_idx`(`status`),
    INDEX `HoldedSyncJob_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `HoldedSyncJob` ADD CONSTRAINT `HoldedSyncJob_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
