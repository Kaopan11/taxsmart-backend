import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import type { AuthUser } from '../auth/auth-user.type';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UpdateTaxProfileDto } from './dto/update-tax-profile.dto';
import { TaxProfileService } from './tax-profile.service';

@Controller('tax')
@UseGuards(JwtAuthGuard) // เฉพาะ user ที่ล็อกอิน — เหมือน invoices
export class TaxController {
  constructor(private readonly taxProfileService: TaxProfileService) {}

  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.taxProfileService.getProfile(user.userId);
  }

  @Put('profile')
  upsertProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateTaxProfileDto,
  ) {
    return this.taxProfileService.upsertProfile(user.userId, dto);
  }
}
