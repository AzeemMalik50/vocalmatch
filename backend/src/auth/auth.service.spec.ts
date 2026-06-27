import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
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
