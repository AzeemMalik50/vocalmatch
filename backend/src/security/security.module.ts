// backend/src/security/security.module.ts
import { Module } from '@nestjs/common';
import { MailerModule } from '../mailer/mailer.module';
import { SecurityController } from './security.controller';
import { TurnstileService } from './turnstile.service';

@Module({
  imports: [MailerModule],
  controllers: [SecurityController],
  providers: [TurnstileService],
  exports: [TurnstileService],
})
export class SecurityModule {}
