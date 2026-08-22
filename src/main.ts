import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ---------- Step 4: CORS ----------
  // เบราว์เซอร์ที่ localhost:4000 (Next) เรียก API ที่ :3000 ได้
  // ถ้าไม่เปิด CORS จะติด blocked by CORS policy
  app.enableCors({
    origin: ['http://localhost:4000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
