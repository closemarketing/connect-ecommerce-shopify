/*
  Warnings:

  - You are about to drop the column `jsonData` on the `order` table. All the data in the column will be lost.
  - You are about to drop the column `shop` on the `order` table. All the data in the column will be lost.
  - Added the required column `body` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `sessionId` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX `Order_shop_idx` ON `order`;

-- AlterTable
ALTER TABLE `order` DROP COLUMN `jsonData`,
    DROP COLUMN `shop`,
    ADD COLUMN `body` LONGTEXT NOT NULL,
    ADD COLUMN `sessionId` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `Order_sessionId_idx` ON `Order`(`sessionId`);

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `Session`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
