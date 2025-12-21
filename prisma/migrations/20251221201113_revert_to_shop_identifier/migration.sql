/*
  Warnings:

  - You are about to drop the column `sessionId` on the `order` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[shop,isOnline]` on the table `Session` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `shop` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `order` DROP FOREIGN KEY `Order_sessionId_fkey`;

-- DropIndex
DROP INDEX `Order_sessionId_idx` ON `order`;

-- AlterTable
ALTER TABLE `order` DROP COLUMN `sessionId`,
    ADD COLUMN `shop` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `Order_shop_idx` ON `Order`(`shop`);

-- CreateIndex
CREATE INDEX `Session_shop_idx` ON `Session`(`shop`);

-- CreateIndex
CREATE UNIQUE INDEX `Session_shop_isOnline_key` ON `Session`(`shop`, `isOnline`);
