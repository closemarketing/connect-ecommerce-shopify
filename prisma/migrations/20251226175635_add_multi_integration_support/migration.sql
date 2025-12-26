/*
  Warnings:

  - You are about to drop the column `clientifyStageId` on the `orderstagemapping` table. All the data in the column will be lost.
  - You are about to drop the column `clientifyStageName` on the `orderstagemapping` table. All the data in the column will be lost.
  - You are about to drop the column `clientifyPipelineId` on the `pipelineconfig` table. All the data in the column will be lost.
  - You are about to drop the column `clientifyPipelineName` on the `pipelineconfig` table. All the data in the column will be lost.
  - You are about to drop the column `clientifyId` on the `synclog` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[shopId,integrationId,externalPipelineId]` on the table `PipelineConfig` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `externalStageId` to the `OrderStageMapping` table without a default value. This is not possible if the table is not empty.
  - Added the required column `externalStageName` to the `OrderStageMapping` table without a default value. This is not possible if the table is not empty.
  - Added the required column `externalPipelineId` to the `PipelineConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `externalPipelineName` to the `PipelineConfig` table without a default value. This is not possible if the table is not empty.
  - Added the required column `integrationId` to the `PipelineConfig` table without a default value. This is not possible if the table is not empty.

*/

-- Paso 1: Limpiar datos existentes que pueden causar conflictos
DELETE FROM `OrderStageMapping`;
DELETE FROM `PipelineConfig`;

-- DropIndex
DROP INDEX `PipelineConfig_shopId_clientifyPipelineId_key` ON `pipelineconfig`;

-- AlterTable
ALTER TABLE `integration` ADD COLUMN `enabled` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `orderstagemapping` DROP COLUMN `clientifyStageId`,
    DROP COLUMN `clientifyStageName`,
    ADD COLUMN `externalStageId` VARCHAR(191) NOT NULL,
    ADD COLUMN `externalStageName` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `pipelineconfig` DROP COLUMN `clientifyPipelineId`,
    DROP COLUMN `clientifyPipelineName`,
    ADD COLUMN `externalPipelineId` VARCHAR(191) NOT NULL,
    ADD COLUMN `externalPipelineName` VARCHAR(191) NOT NULL,
    ADD COLUMN `integrationId` INTEGER NOT NULL;

-- AlterTable: Migrar clientifyId a externalId en SyncLog
ALTER TABLE `synclog` 
    ADD COLUMN `externalId` VARCHAR(191) NULL,
    ADD COLUMN `integrationId` INTEGER NULL;

-- Copiar datos de clientifyId a externalId
UPDATE `synclog` SET `externalId` = CAST(`clientifyId` AS CHAR) WHERE `clientifyId` IS NOT NULL;

-- Ahora eliminar clientifyId
ALTER TABLE `synclog` DROP COLUMN `clientifyId`;

-- AlterTable
ALTER TABLE `webhooklog` ADD COLUMN `integrationId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Job` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `shopId` INTEGER NOT NULL,
    `integrationId` INTEGER NULL,
    `queueName` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `payload` LONGTEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `priority` INTEGER NOT NULL DEFAULT 0,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 3,
    `startedAt` DATETIME(3) NULL,
    `processedAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Job_shopId_idx`(`shopId`),
    INDEX `Job_integrationId_idx`(`integrationId`),
    INDEX `Job_status_priority_idx`(`status`, `priority`),
    INDEX `Job_queueName_status_idx`(`queueName`, `status`),
    INDEX `Job_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `PipelineConfig_integrationId_idx` ON `PipelineConfig`(`integrationId`);

-- CreateIndex
CREATE UNIQUE INDEX `PipelineConfig_shopId_integrationId_externalPipelineId_key` ON `PipelineConfig`(`shopId`, `integrationId`, `externalPipelineId`);

-- CreateIndex
CREATE INDEX `SyncLog_integrationId_idx` ON `SyncLog`(`integrationId`);

-- CreateIndex
CREATE INDEX `WebhookLog_integrationId_idx` ON `WebhookLog`(`integrationId`);

-- AddForeignKey
ALTER TABLE `SyncLog` ADD CONSTRAINT `SyncLog_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `Integration`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WebhookLog` ADD CONSTRAINT `WebhookLog_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `Integration`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PipelineConfig` ADD CONSTRAINT `PipelineConfig_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `Integration`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Job` ADD CONSTRAINT `Job_integrationId_fkey` FOREIGN KEY (`integrationId`) REFERENCES `Integration`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
