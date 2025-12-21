/*
  Warnings:

  - You are about to drop the column `shop` on the `order` table. All the data in the column will be lost.
  - Added the required column `shopId` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `Order_shop_idx` ON `order`;

-- AlterTable
ALTER TABLE `order` DROP COLUMN `shop`,
    ADD COLUMN `shopId` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `session` ADD COLUMN `shopId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Shop` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `domain` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Shop_domain_key`(`domain`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Order_shopId_idx` ON `Order`(`shopId`);

-- CreateIndex
CREATE INDEX `Session_shopId_idx` ON `Session`(`shopId`);

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_shopId_fkey` FOREIGN KEY (`shopId`) REFERENCES `Shop`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
