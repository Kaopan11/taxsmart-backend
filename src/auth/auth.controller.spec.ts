/// <reference types="jest" />
/**
 * HTTP-level specs สำหรับ AuthController — validation + login errors
 */
import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController (HTTP)', () => {
  let app: INestApplication<App>;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn(),
      login: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('returns 400 when fullName is too short', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          fullName: 'Short',
          email: 'user@example.com',
          password: 'longpassword1',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['Name must be between 6 and 20 characters']),
      );
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('returns 400 when password is only 8 characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          fullName: 'Valid Name',
          email: 'user@example.com',
          password: '12345678',
        })
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining(['Password must be more than 8 characters']),
      );
      expect(authService.register).not.toHaveBeenCalled();
    });

    it('returns 201 when body is valid', async () => {
      authService.register.mockResolvedValue({
        accessToken: 'token',
        user: {
          id: 'user-1',
          email: 'user@example.com',
          fullName: 'Valid Name',
          role: 'USER',
        },
      });

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          fullName: 'Valid Name',
          email: 'user@example.com',
          password: '123456789',
        })
        .expect(201);

      expect(response.body.accessToken).toBe('token');
      expect(authService.register).toHaveBeenCalled();
    });
  });

  describe('POST /auth/login', () => {
    it('returns 401 Email is incorrect from service', async () => {
      authService.login.mockRejectedValue(
        new UnauthorizedException('Email is incorrect'),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'missing@example.com', password: 'anypassword9' })
        .expect(401);

      expect(response.body.message).toBe('Email is incorrect');
    });

    it('returns 401 Password is incorrect from service', async () => {
      authService.login.mockRejectedValue(
        new UnauthorizedException('Password is incorrect'),
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'wrongpassword' })
        .expect(401);

      expect(response.body.message).toBe('Password is incorrect');
    });
  });
});
