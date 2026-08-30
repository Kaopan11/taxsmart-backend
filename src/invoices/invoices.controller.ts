import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
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
@UseGuards(JwtAuthGuard) // P1: ทุก route ต้องมี Bearer token
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
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: UploadedReceiptFile,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // ผูกใบเสร็จกับ user ที่ล็อกอิน ไม่ใช้ demo อีก
    return this.invoicesService.enqueueUpload(user.userId, file);
  }

  // GET /invoices ต้องอยู่เหนือ GET /invoices/:id
  @Get()
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.invoicesService.findAll(user.userId, { q, status, category });
  }

  /**
   * GET /invoices/:id/file — ส่ง binary ใบเสร็จ (JWT + owner เท่านั้น)
   * ต้องประกาศก่อน @Get(':id') เพื่อไม่ให้ route JSON กลืน path นี้
   */
  @Get(':id/file')
  async getInvoiceFile(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const file = await this.invoicesService.getInvoiceFile(user.userId, id);

    return new StreamableFile(file.buffer, {
      type: file.contentType,
      disposition: `inline; filename="${file.filename}"`,
    });
  }

  @Get(':id')
  findById(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.findById(user.userId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(user.userId, id, dto);
  }

  /** DELETE /invoices/:id — 204 ไม่มี body; เฉพาะเจ้าของ invoice */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoicesService.remove(user.userId, id);
  }
}
