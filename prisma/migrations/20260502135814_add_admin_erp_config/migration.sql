-- Add SyncDirection enum
ALTER TABLE `SyncLog`
    ADD COLUMN `direction` ENUM('SHOPIFY_TO_ERP', 'ERP_TO_SHOPIFY') NOT NULL DEFAULT 'SHOPIFY_TO_ERP',
    ADD COLUMN `erpName`   VARCHAR(191) NULL;

-- Add AdminUser table
CREATE TABLE `AdminUser` (
    `id`           INTEGER      NOT NULL AUTO_INCREMENT,
    `email`        VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `name`         VARCHAR(191) NULL,
    `createdAt`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`    DATETIME(3)  NOT NULL,

    UNIQUE INDEX `AdminUser_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Add ERPWebhookConfig table
CREATE TABLE `ERPWebhookConfig` (
    `id`            INTEGER      NOT NULL AUTO_INCREMENT,
    `shopId`        INTEGER      NOT NULL,
    `erpName`       VARCHAR(191) NOT NULL,
    `webhookSecret` VARCHAR(191) NULL,
    `lastSyncAt`    DATETIME(3)  NULL,
    `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt`     DATETIME(3)  NOT NULL,

    INDEX `ERPWebhookConfig_shopId_idx`(`shopId`),
    UNIQUE INDEX `ERPWebhookConfig_shopId_erpName_key`(`shopId`, `erpName`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ERPWebhookConfig` ADD CONSTRAINT `ERPWebhookConfig_shopId_fkey`
    FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
