// backend/src/security/security.module.ts
import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { TurnstileService } from './turnstile.service';

@Module({
  controllers: [SecurityController],
  providers: [TurnstileService],
  exports: [TurnstileService],
})
export class SecurityModule {}
