-- CreateTable
CREATE TABLE `WebhookLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `topic` VARCHAR(191) NOT NULL,
    `shopifyId` VARCHAR(191) NULL,
    `headers` TEXT NOT NULL,
    `payload` LONGTEXT NOT NULL,
    `hmacValid` BOOLEAN NULL,
    `processed` BOOLEAN NOT NULL DEFAULT false,
    `errorMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `WebhookLog_shopId_idx`(`shopId`),
    INDEX `WebhookLog_topic_idx`(`topic`),
    INDEX `WebhookLog_createdAt_idx`(`createdAt`),
    INDEX `WebhookLog_processed_idx`(`processed`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `WebhookLog` ADD CONSTRAINT `WebhookLog_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
