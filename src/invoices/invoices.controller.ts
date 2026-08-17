import {
    BadRequestException,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    UploadedFile,
    UseInterceptors,
  } from '@nestjs/common';
  import { FileInterceptor } from '@nestjs/platform-express';
  import { InvoicesService } from './invoices.service';
  import type { UploadedReceiptFile } from './invoices.service';
  
  const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ];
  
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  
  @Controller('invoices')
  export class InvoicesController {
    constructor(private readonly invoicesService: InvoicesService) {}
  
    @Post('upload')
    @HttpCode(HttpStatus.ACCEPTED)
    @UseInterceptors(
      FileInterceptor('file', {
        limits: { fileSize: MAX_FILE_SIZE },
        fileFilter: (_req, file, callback) => {
          if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            callback(null, true);
            return;
          }
          callback(
            new BadRequestException(
              'Only JPEG, PNG, WebP, and PDF files are allowed',
            ),
            false,
          );
        },
      }),
    )
    upload(@UploadedFile() file: UploadedReceiptFile) {
      if (!file) {
        throw new BadRequestException('File is required');
      }
  
      return this.invoicesService.enqueueUpload(file);
    }

    @Get(':id')
    findById(@Param('id') id: string) {
      return this.invoicesService.findById(id);
    }
  }