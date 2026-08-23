import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { GeminiModule } from './gemini/gemini.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // ทำให้ ConfigService ใช้งานได้ทุก Module อัตโนมัติ
      envFilePath: '.env',
    }),
    AuthModule, // P1: /auth/register + /auth/login + JwtStrategy
    GeminiModule,
    InvoicesModule,
    PrismaModule,
    QueueModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
