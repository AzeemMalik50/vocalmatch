import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/user.entity';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  DeleteAccountDto,
  LoginDto,
  SignupDto,
} from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
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

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.users.create({
      email: lcEmail,
      username: dto.username,
      passwordHash,
    });
    await this.users.save(user);

    return this.tokenize(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
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

    user.passwordHash = await bcrypt.hash(dto.newPassword, 10);
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
      },
    };
  }
}
