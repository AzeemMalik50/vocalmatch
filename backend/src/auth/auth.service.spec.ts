import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { LockedException } from './locked.exception';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';
import { LegalService } from '../legal/legal.service';

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
