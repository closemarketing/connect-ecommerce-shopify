-- CreateTable
CREATE TABLE `SyncLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `syncType` ENUM('CUSTOMER', 'PRODUCT', 'DEAL', 'ORDER') NOT NULL,
    `shopifyId` VARCHAR(191) NOT NULL,
    `clientifyId` INTEGER NULL,
    `status` ENUM('SUCCESS', 'ERROR') NOT NULL,
    `errorMessage` TEXT NULL,
    `requestData` LONGTEXT NULL,
    `responseData` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SyncLog_shopId_idx`(`shopId`),
    INDEX `SyncLog_syncType_idx`(`syncType`),
    INDEX `SyncLog_status_idx`(`status`),
    INDEX `SyncLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `SyncLog` ADD CONSTRAINT `SyncLog_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
