-- AlterTable
ALTER TABLE `invoices` ADD COLUMN `category` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `invoices_category_idx` ON `invoices`(`category`);
