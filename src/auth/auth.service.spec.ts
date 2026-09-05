/// <reference types="jest" />
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Response } from 'express';
import { Role } from '.prisma/client';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const mockUser = {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: 'hashed-password',
    fullName: 'Kaopan Kaew',
    role: Role.USER,
  };

  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
    };
  };
  let jwtService: { sign: jest.Mock };
  let configService: { get: jest.Mock };
  let res: Response;
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();

    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ id: 'rt-1' }),
      },
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('access-token-jwt'),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        if (key === 'REFRESH_COOKIE_NAME') return 'taxsmart_refresh';
        return undefined;
      }),
    };

    res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;

    service = new AuthService(
      prisma as never,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  describe('login', () => {
    it('throws Email is incorrect when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login(
          { email: 'missing@example.com', password: 'anypassword' },
          res,
        ),
      ).rejects.toThrow(new UnauthorizedException('Email is incorrect'));

      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('throws Password is incorrect when password does not match', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login(
          { email: 'user@example.com', password: 'wrongpassword' },
          res,
        ),
      ).rejects.toThrow(new UnauthorizedException('Password is incorrect'));
    });

    it('returns accessToken when credentials are valid', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(
        { email: 'user@example.com', password: 'correctpassword' },
        res,
      );

      expect(result.accessToken).toBe('access-token-jwt');
      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        fullName: mockUser.fullName,
        role: mockUser.role,
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });
  });

  describe('register', () => {
    it('creates user and returns accessToken with trimmed fullName', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      prisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        email: 'new@example.com',
        fullName: 'New User',
        role: Role.USER,
      });

      const result = await service.register(
        {
          fullName: '  New User  ',
          email: 'new@example.com',
          password: 'longpassword1',
        },
        res,
      );

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'new@example.com',
            fullName: 'New User',
            passwordHash: 'new-hash',
          }),
        }),
      );
      expect(result.accessToken).toBe('access-token-jwt');
      expect(result.user.fullName).toBe('New User');
    });
  });
});
