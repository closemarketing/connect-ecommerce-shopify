-- AlterTable
ALTER TABLE `synclog` ADD COLUMN `method` VARCHAR(191) NULL,
    ADD COLUMN `queryParams` TEXT NULL,
    ADD COLUMN `url` TEXT NULL;
