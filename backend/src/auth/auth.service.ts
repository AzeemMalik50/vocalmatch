import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { LockedException } from './locked.exception';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { User } from '../users/user.entity';
import { LegalService } from '../legal/legal.service';
import { MailerService } from '../mailer/mailer.service';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  DeleteAccountDto,
  ForgotPasswordDto,
  LoginDto,
  ResetPasswordDto,
  SignupDto,
} from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly legal: LegalService,
    private readonly mailer: MailerService,
  ) {}

  async signup(dto: SignupDto) {
    const lcEmail = dto.email.toLowerCase();
    const lcUsername = dto.username.toLowerCase();

    const existing = await this.users
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email OR LOWER(u.username) = :username', {
        email: lcEmail,
        username: lcUsername,
      })
      .getOne();

    if (existing) {
      throw new ConflictException(
        existing.email.toLowerCase() === lcEmail
          ? 'Email already in use'
          : 'Username already taken',
      );
    }

    // Capture which version of ToS + Privacy the user accepted. Throws if
    // either seed is missing — surfaces a deploy issue immediately rather
    // than silently storing nulls.
    const versions = await this.legal.getCurrentVersionIds([
      'terms',
      'privacy',
    ]);

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = this.users.create({
      email: lcEmail,
      username: dto.username,
      passwordHash,
      acceptedTermsVersionId: versions.terms,
      acceptedPrivacyVersionId: versions.privacy,
      legalAcceptedAt: new Date(),
    });
    await this.users.save(user);

    return this.tokenize(user);
  }

  async login(dto: LoginDto) {
    // The `email` field on LoginDto is a misnomer for backwards
    // compatibility — callers may send either an email address or a
    // username. Match against both columns case-insensitively in a
    // single query. The signup flow already enforces uniqueness on
    // each column, so a hit on either is unambiguous.
    const identifier = dto.email.trim().toLowerCase();
    const user = await this.users
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :identifier OR LOWER(u.username) = :identifier', {
        identifier,
      })
      .getOne();
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Check lockout BEFORE bcrypt — don't leak whether the password is
    // correct via a slow vs fast response. Throws 423.
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      throw new LockedException(
        `Account locked until ${user.lockoutUntil.toISOString()}. Try again later.`,
      );
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      user.failedLoginCount = (user.failedLoginCount ?? 0) + 1;
      if (user.failedLoginCount >= 5) {
        user.lockoutUntil = new Date(Date.now() + 15 * 60_000);
      }
      await this.users.save(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Success — reset both fields if they're nonzero / set.
    if (user.failedLoginCount > 0 || user.lockoutUntil !== null) {
      user.failedLoginCount = 0;
      user.lockoutUntil = null;
      await this.users.save(user);
    }

    return this.tokenize(user);
  }

  async changeEmail(userId: string, dto: ChangeEmailDto) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    const lcNew = dto.newEmail.toLowerCase();
    if (lcNew === user.email.toLowerCase()) {
      throw new BadRequestException('That is already your email');
    }

    const taken = await this.users
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email', { email: lcNew })
      .andWhere('u.id != :id', { id: userId })
      .getOne();
    if (taken) throw new ConflictException('Email already in use');

    user.email = lcNew;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);
    return { ok: true, email: lcNew };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException('New password must be different');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    // Invalidate every existing session except this one
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);
    return this.tokenize(user);
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Current password is incorrect');

    await this.users.remove(user);
    return { ok: true };
  }

  async signOutEverywhere(userId: string) {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);
    return this.tokenize(user);
  }

  /**
   * Looks up the user by ID and verifies token-version still matches.
   * Used by the JWT strategy.
   */
  async validateTokenPayload(
    userId: string,
    tokenVersion: number | undefined,
  ): Promise<User | null> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) return null;
    if ((user.tokenVersion ?? 0) !== (tokenVersion ?? 0)) return null;
    return user;
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const lcEmail = dto.email.toLowerCase();
    const user = await this.users.findOne({ where: { email: lcEmail } });
    if (!user) {
      // Don't reveal whether the address belongs to a real account.
      return { sent: true };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    user.passwordResetTokenHash = hash;
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60_000);
    await this.users.save(user);

    const base =
      process.env.FRONTEND_RESET_URL ?? 'http://localhost:3000/reset-password';
    const resetUrl = `${base}?token=${token}`;
    await this.mailer.sendPasswordResetEmail(user.email, resetUrl);

    return { sent: true };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const hash = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');
    const user = await this.users.findOne({
      where: { passwordResetTokenHash: hash },
    });
    if (
      !user ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt <= new Date()
    ) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);

    return { reset: true };
  }

  private tokenize(user: User) {
    const token = this.jwt.sign({
      sub: user.id,
      username: user.username,
      tv: user.tokenVersion ?? 0,
    });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        avatarUrl: user.avatarUrl,
        // Phase 2A — surface flags so the frontend can show admin / songwriter UI
        isAdmin: !!user.isAdmin,
        isSongwriter: !!user.isSongwriter,
      },
    };
  }
}
