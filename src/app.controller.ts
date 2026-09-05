import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Render health check — ไม่ต้อง auth */
  @Get('health')
  getHealth(): { status: string } {
    return { status: 'ok' };
  }
}
