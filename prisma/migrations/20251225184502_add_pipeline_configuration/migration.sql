-- CreateTable
CREATE TABLE `PipelineConfig` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `clientifyPipelineId` INTEGER NOT NULL,
    `clientifyPipelineName` VARCHAR(191) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PipelineConfig_shopId_idx`(`shopId`),
    UNIQUE INDEX `PipelineConfig_shopId_clientifyPipelineId_key`(`shopId`, `clientifyPipelineId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderStageMapping` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `pipelineConfigId` INTEGER NOT NULL,
    `shopifyOrderStatus` VARCHAR(191) NOT NULL,
    `clientifyStageId` INTEGER NOT NULL,
    `clientifyStageName` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OrderStageMapping_pipelineConfigId_idx`(`pipelineConfigId`),
    UNIQUE INDEX `OrderStageMapping_pipelineConfigId_shopifyOrderStatus_key`(`pipelineConfigId`, `shopifyOrderStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OrderStageMapping` ADD CONSTRAINT `OrderStageMapping_pipelineConfigId_fkey` FOREIGN KEY (`pipelineConfigId`) REFERENCES `PipelineConfig`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
