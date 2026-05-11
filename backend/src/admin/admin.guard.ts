import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

/**
 * Guard for admin-only endpoints. Must be combined with JwtAuthGuard:
 *
 *   @UseGuards(JwtAuthGuard, AdminGuard)
 *
 * Loads the requesting user fresh from the DB and verifies isAdmin === true.
 * The fresh load is intentional — the JWT only carries the user id, so we
 * can't trust any role claim baked into the token; the source of truth is
 * the `users` table at request time.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req.user?.userId;
    if (!userId) throw new ForbiddenException('Authentication required');

    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.isAdmin) {
      throw new ForbiddenException('Admin access required');
    }
    // Stash on req for downstream handlers
    req.adminUser = user;
    return true;
  }
}
