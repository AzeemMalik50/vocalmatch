import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { LockedException } from './locked.exception';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';
import { LegalService } from '../legal/legal.service';
import { MailerService } from '../mailer/mailer.service';
import { TurnstileService } from '../security/turnstile.service';

describe('AuthService.signup acceptance plumbing', () => {
  let service: AuthService;

  const usersData: any[] = [];

  const userRepo: any = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => null),
    })),
    create: jest.fn((row: any) => row),
    save: jest.fn(async (row: any) => {
      const saved = { id: 'u-1', ...row };
      usersData.push(saved);
      return saved;
    }),
  };

  const jwt: any = { sign: jest.fn(() => 'fake.jwt') };

  const legal: any = {
    getCurrentVersionIds: jest.fn(async () => ({
      terms: 'v-terms-1',
      privacy: 'v-privacy-1',
    })),
  };

  const mailer: any = { sendPasswordResetEmail: jest.fn(async () => undefined) };

  beforeEach(async () => {
    usersData.length = 0;
    jest.clearAllMocks();
    legal.getCurrentVersionIds = jest.fn(async () => ({
      terms: 'v-terms-1',
      privacy: 'v-privacy-1',
    }));
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwt },
        { provide: LegalService, useValue: legal },
        { provide: MailerService, useValue: mailer },
        { provide: TurnstileService, useValue: { verify: jest.fn(async () => true), isEnabled: false } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('populates accepted version IDs + timestamp on a successful signup', async () => {
    const result = await service.signup({
      email: 'a@b.com',
      username: 'tester',
      password: 'pw12345',
      acceptedTerms: true,
      acceptedPrivacy: true,
    } as any);

    expect(legal.getCurrentVersionIds).toHaveBeenCalledWith(['terms', 'privacy']);
    expect(userRepo.save).toHaveBeenCalled();
    const saved = userRepo.save.mock.calls[0][0];
    expect(saved.acceptedTermsVersionId).toBe('v-terms-1');
    expect(saved.acceptedPrivacyVersionId).toBe('v-privacy-1');
    expect(saved.legalAcceptedAt).toBeInstanceOf(Date);
    expect(result.token).toBe('fake.jwt');
  });

  it('propagates the legal-service failure if a slug is missing', async () => {
    legal.getCurrentVersionIds = jest.fn().mockRejectedValue(new Error('missing'));
    await expect(
      service.signup({
        email: 'a@b.com',
        username: 'tester',
        password: 'pw12345',
        acceptedTerms: true,
        acceptedPrivacy: true,
      } as any),
    ).rejects.toThrow('missing');
  });
});

describe('AuthService.login lockout', () => {
  let service: AuthService;

  const usersState: any[] = [];

  const userRepo: any = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => usersState[0] ?? null),
    })),
    save: jest.fn(async (row: any) => {
      const i = usersState.findIndex((u) => u.id === row.id);
      if (i >= 0) usersState[i] = { ...usersState[i], ...row };
      else usersState.push(row);
      return row;
    }),
    create: jest.fn((row: any) => row),
    findOne: jest.fn(async ({ where }: any) =>
      usersState.find((u) => u.id === where.id) ?? null,
    ),
  };

  const jwt: any = { sign: jest.fn(() => 'fake.jwt') };

  const legal: any = {
    getCurrentVersionIds: jest.fn(async () => ({
      terms: 'v-terms-1',
      privacy: 'v-privacy-1',
    })),
  };

  const mailer: any = { sendPasswordResetEmail: jest.fn(async () => undefined) };

  const seedUser = async (overrides: Partial<any> = {}) => {
    const hash = await bcrypt.hash('correct-password', 10);
    usersState.length = 0;
    usersState.push({
      id: 'u-1',
      email: 'a@b.com',
      username: 'tester',
      passwordHash: hash,
      failedLoginCount: 0,
      lockoutUntil: null,
      ...overrides,
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwt },
        { provide: LegalService, useValue: legal },
        { provide: MailerService, useValue: mailer },
        { provide: TurnstileService, useValue: { verify: jest.fn(async () => true), isEnabled: false } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('increments failedLoginCount on a bad password', async () => {
    await seedUser();
    await expect(
      service.login({ email: 'a@b.com', password: 'wrong' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersState[0].failedLoginCount).toBe(1);
    expect(usersState[0].lockoutUntil).toBeNull();
  });

  it('sets lockoutUntil after the 5th failure', async () => {
    await seedUser({ failedLoginCount: 4 });
    await expect(
      service.login({ email: 'a@b.com', password: 'wrong' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersState[0].failedLoginCount).toBe(5);
    expect(usersState[0].lockoutUntil).toBeInstanceOf(Date);
    const ms = usersState[0].lockoutUntil.getTime() - Date.now();
    // 15 minutes ± a few seconds
    expect(ms).toBeGreaterThan(14 * 60 * 1000);
    expect(ms).toBeLessThan(16 * 60 * 1000);
  });

  it('rejects login with the correct password while locked', async () => {
    const future = new Date(Date.now() + 10 * 60_000);
    await seedUser({ failedLoginCount: 5, lockoutUntil: future });
    await expect(
      service.login({ email: 'a@b.com', password: 'correct-password' } as any),
    ).rejects.toBeInstanceOf(LockedException);
  });

  it('proceeds past an expired lockoutUntil', async () => {
    const past = new Date(Date.now() - 1000);
    await seedUser({ failedLoginCount: 5, lockoutUntil: past });
    const out = await service.login({
      email: 'a@b.com',
      password: 'correct-password',
    } as any);
    expect(out.token).toBe('fake.jwt');
    expect(usersState[0].failedLoginCount).toBe(0);
    expect(usersState[0].lockoutUntil).toBeNull();
  });

  it('resets the counter on a successful login', async () => {
    await seedUser({ failedLoginCount: 3 });
    const out = await service.login({
      email: 'a@b.com',
      password: 'correct-password',
    } as any);
    expect(out.token).toBe('fake.jwt');
    expect(usersState[0].failedLoginCount).toBe(0);
    expect(usersState[0].lockoutUntil).toBeNull();
  });
});

describe('AuthService password reset', () => {
  let service: AuthService;
  const usersState: any[] = [];

  const userRepo: any = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where.email) {
        return usersState.find((u) => u.email === where.email) ?? null;
      }
      if (where.passwordResetTokenHash) {
        return (
          usersState.find(
            (u) =>
              u.passwordResetTokenHash === where.passwordResetTokenHash &&
              u.passwordResetExpiresAt &&
              u.passwordResetExpiresAt > new Date(),
          ) ?? null
        );
      }
      return null;
    }),
    save: jest.fn(async (row: any) => {
      const i = usersState.findIndex((u) => u.id === row.id);
      if (i >= 0) usersState[i] = { ...usersState[i], ...row };
      return row;
    }),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => null),
    })),
    create: jest.fn((row: any) => row),
  };

  const jwt: any = { sign: jest.fn(() => 'fake.jwt') };

  const legal: any = {
    getCurrentVersionIds: jest.fn(async () => ({
      terms: 'v-terms-1',
      privacy: 'v-privacy-1',
    })),
  };

  const mailer: any = { sendPasswordResetEmail: jest.fn(async () => undefined) };

  beforeEach(async () => {
    usersState.length = 0;
    jest.clearAllMocks();
    process.env.FRONTEND_RESET_URL = 'https://vocalmatch.com/reset-password';
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwt },
        { provide: LegalService, useValue: legal },
        { provide: MailerService, useValue: mailer },
        { provide: TurnstileService, useValue: { verify: jest.fn(async () => true), isEnabled: false } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('forgotPassword', () => {
    it('writes hash + expiry and sends email for an existing user', async () => {
      usersState.push({
        id: 'u-1',
        email: 'a@b.com',
        username: 'tester',
        passwordHash: 'hash',
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        tokenVersion: 0,
      });
      const out = await service.forgotPassword({ email: 'a@b.com' } as any);
      expect(out).toEqual({ sent: true });
      expect(usersState[0].passwordResetTokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(usersState[0].passwordResetExpiresAt).toBeInstanceOf(Date);
      const ms = usersState[0].passwordResetExpiresAt.getTime() - Date.now();
      expect(ms).toBeGreaterThan(59 * 60 * 1000);
      expect(ms).toBeLessThanOrEqual(61 * 60 * 1000);
      expect(mailer.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const [toEmail, url] = mailer.sendPasswordResetEmail.mock.calls[0];
      expect(toEmail).toBe('a@b.com');
      expect(url).toMatch(/^https:\/\/vocalmatch\.com\/reset-password\?token=[a-f0-9]{64}$/);
    });

    it('is a silent no-op for an unknown email', async () => {
      const out = await service.forgotPassword({ email: 'nobody@nope.com' } as any);
      expect(out).toEqual({ sent: true });
      expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates passwordHash, clears reset fields, and bumps tokenVersion on a valid token', async () => {
      const crypto = require('crypto');
      const token = 'a'.repeat(64);
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      usersState.push({
        id: 'u-1',
        email: 'a@b.com',
        username: 'tester',
        passwordHash: 'old',
        passwordResetTokenHash: hash,
        passwordResetExpiresAt: new Date(Date.now() + 30 * 60_000),
        tokenVersion: 3,
      });
      const out = await service.resetPassword({
        token,
        newPassword: 'newpassword123',
      } as any);
      expect(out).toEqual({ reset: true });
      expect(usersState[0].passwordHash).not.toBe('old');
      expect(usersState[0].passwordResetTokenHash).toBeNull();
      expect(usersState[0].passwordResetExpiresAt).toBeNull();
      expect(usersState[0].tokenVersion).toBe(4);
    });

    it('rejects an expired token', async () => {
      const crypto = require('crypto');
      const token = 'b'.repeat(64);
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      usersState.push({
        id: 'u-1',
        email: 'a@b.com',
        username: 'tester',
        passwordHash: 'old',
        passwordResetTokenHash: hash,
        passwordResetExpiresAt: new Date(Date.now() - 1000),
        tokenVersion: 0,
      });
      await expect(
        service.resetPassword({
          token,
          newPassword: 'newpassword123',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown / tampered token', async () => {
      await expect(
        service.resetPassword({
          token: 'c'.repeat(64),
          newPassword: 'newpassword123',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

describe('AuthService.login Turnstile gate', () => {
  let service: AuthService;
  const usersState: any[] = [];
  const turnstile: any = { verify: jest.fn(), isEnabled: true };

  const userRepo: any = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => usersState[0] ?? null),
    })),
    save: jest.fn(async (row: any) => {
      const i = usersState.findIndex((u) => u.id === row.id);
      if (i >= 0) usersState[i] = { ...usersState[i], ...row };
      else usersState.push(row);
      return row;
    }),
    create: jest.fn((row: any) => row),
    findOne: jest.fn(async ({ where }: any) =>
      usersState.find((u) => u.id === where.id) ?? null,
    ),
  };
  const jwt: any = { sign: jest.fn(() => 'fake.jwt') };
  const legal: any = {
    getCurrentVersionIds: jest.fn(async () => ({
      terms: 'v-t',
      privacy: 'v-p',
    })),
  };
  const mailer: any = { sendPasswordResetEmail: jest.fn(async () => undefined) };

  beforeEach(async () => {
    usersState.length = 0;
    jest.clearAllMocks();
    turnstile.verify.mockReset();
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('correctpwd', 10);
    usersState.push({
      id: 'u-1',
      email: 'a@b.com',
      username: 'tester',
      passwordHash: hash,
      failedLoginCount: 3,
      lockoutUntil: null,
      tokenVersion: 0,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwt },
        { provide: LegalService, useValue: legal },
        { provide: MailerService, useValue: mailer },
        { provide: TurnstileService, useValue: turnstile },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('requires Turnstile after 3 failed attempts; rejects when verify returns false', async () => {
    turnstile.verify.mockResolvedValue(false);
    await expect(
      service.login({ email: 'a@b.com', password: 'correctpwd' } as any),
    ).rejects.toThrow(/Bot challenge required/);
    expect(turnstile.verify).toHaveBeenCalled();
  });

  it('proceeds past the Turnstile gate when verify returns true', async () => {
    turnstile.verify.mockResolvedValue(true);
    const out = await service.login(
      { email: 'a@b.com', password: 'correctpwd', turnstileToken: 't' } as any,
    );
    expect(out.token).toBe('fake.jwt');
    expect(turnstile.verify).toHaveBeenCalledWith('t', undefined);
  });
});
