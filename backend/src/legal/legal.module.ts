import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LegalPage } from './legal-page.entity';
import { LegalPageVersion } from './legal-page-version.entity';
import { LegalService } from './legal.service';
import { LegalController } from './legal.controller';
import { AdminLegalController } from './admin-legal.controller';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LegalPage, LegalPageVersion]),
    forwardRef(() => AuthModule), // provides JwtAuthGuard; forwardRef breaks AuthModule↔LegalModule cycle
    AdminModule, // provides AdminGuard
  ],
  controllers: [LegalController, AdminLegalController],
  providers: [
    LegalService,
    {
      provide: 'DataSource',
      useFactory: (ds: DataSource) => ds,
      inject: [getDataSourceToken()],
    },
  ],
  exports: [LegalService],
})
export class LegalModule {}
