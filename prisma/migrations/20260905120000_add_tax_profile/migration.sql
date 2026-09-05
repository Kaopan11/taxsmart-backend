-- CreateTable
CREATE TABLE `tax_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `taxpayer_type` ENUM('INDIVIDUAL', 'CORPORATE') NOT NULL DEFAULT 'INDIVIDUAL',
    `estimated_income` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `tax_year` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tax_profiles_user_id_key`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tax_profiles` ADD CONSTRAINT `tax_profiles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
