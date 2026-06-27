// backend/src/admin/admin-route-protection.spec.ts
import 'reflect-metadata';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminController } from './admin.controller';
import { AdminPerformancesController } from './admin-performances.controller';
import { AdminLegalController } from '../legal/admin-legal.controller';
import { AdminChallengesController } from '../battles/admin-challenges.controller';

const ADMIN_CONTROLLERS: Array<{ name: string; cls: any }> = [
  { name: 'AdminController', cls: AdminController },
  { name: 'AdminPerformancesController', cls: AdminPerformancesController },
  { name: 'AdminLegalController', cls: AdminLegalController },
  { name: 'AdminChallengesController', cls: AdminChallengesController },
];

function classGuards(cls: any): unknown[] {
  return (Reflect.getMetadata('__guards__', cls) as unknown[]) ?? [];
}

describe('admin route protection', () => {
  ADMIN_CONTROLLERS.forEach(({ name, cls }) => {
    describe(name, () => {
      const guards = classGuards(cls);

      it('declares JwtAuthGuard at the class level', () => {
        expect(guards).toContain(JwtAuthGuard);
      });

      it('declares AdminGuard at the class level', () => {
        expect(guards).toContain(AdminGuard);
      });
    });
  });
});
