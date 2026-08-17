import {
    Injectable,
    OnModuleDestroy,
    OnModuleInit,
  } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import { PrismaMariaDb } from '@prisma/adapter-mariadb';
  import { PrismaClient } from '.prisma/client';
  
  @Injectable()
  export class PrismaService
    extends PrismaClient
    implements OnModuleInit, OnModuleDestroy
  {
    constructor(configService: ConfigService) {
      const databaseUrl = configService.get<string>('DATABASE_URL');
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is not set');
      }
  
      const adapter = new PrismaMariaDb(databaseUrl);
      super({ adapter });
    }
  
    async onModuleInit() {
      await this.$connect();
      await this.user.upsert({
        where: { email: 'demo@taxsmart.local' },
        update: {},
        create: {
          email: 'demo@taxsmart.local',
          passwordHash: 'local-dev-placeholder',
          fullName: 'Demo User',
        },
      });
    }
  
    async onModuleDestroy() {
      await this.$disconnect();
    }
  }