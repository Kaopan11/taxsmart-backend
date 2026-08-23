-- AlterTable
ALTER TABLE `invoices` MODIFY `ocr_status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DUPLICATE') NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX `invoices_user_id_merchant_tax_id_invoice_number_idx` ON `invoices`(`user_id`, `merchant_tax_id`, `invoice_number`);
