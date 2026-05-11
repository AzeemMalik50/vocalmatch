import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { AdminGuard } from './admin.guard';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Cross-cutting admin authorization + user management endpoints.
 *   - AdminGuard is exported so other modules (songs, battles) can compose it
 *   - AdminController hosts the admin user-management endpoints under /admin/users
 */
@Module({
  imports: [TypeOrmModule.forFeature([User]), AuthModule],
  controllers: [AdminController],
  providers: [AdminGuard],
  exports: [AdminGuard, TypeOrmModule],
})
export class AdminModule {}
