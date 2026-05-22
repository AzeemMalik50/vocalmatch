import { Module, forwardRef } from '@nestjs/common';
import { RealtimeService } from './realtime.service';
import { RealtimeController } from './realtime.controller';
import { AuthModule } from '../auth/auth.module';
import { BattlesModule } from '../battles/battles.module';

/**
 * SSE + in-process pub/sub. Exports RealtimeService so any other module
 * (NotificationsService, BattlesService) can inject it and publish events.
 */
@Module({
  imports: [AuthModule, forwardRef(() => BattlesModule)],
  controllers: [RealtimeController],
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}
