import { BadRequestException, ParseIntPipe } from '@nestjs/common';

/** ตรวจ query ?year= — ต้องเป็นตัวเลขปี ค.ศ. */
export const TaxYearQueryPipe = new ParseIntPipe({
  exceptionFactory: () =>
    new BadRequestException('Query "year" must be a valid tax year number'),
});
