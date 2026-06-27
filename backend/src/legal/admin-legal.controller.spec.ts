import { Test } from '@nestjs/testing';
import { AdminLegalController } from './admin-legal.controller';
import { LegalService } from './legal.service';
import { validate } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { AdminAuditInterceptor } from '../admin/admin-audit.interceptor';

describe('AdminLegalController', () => {
  let controller: AdminLegalController;
  const legal = {
    listAdmin: jest.fn(),
    getAdminPage: jest.fn(),
    getAdminVersion: jest.fn(),
    publishVersion: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminLegalController],
      providers: [{ provide: LegalService, useValue: legal }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(AdminAuditInterceptor)
      .useValue({ intercept: (_ctx: any, next: any) => next.handle() })
      .compile();
    controller = moduleRef.get(AdminLegalController);
  });

  it('list delegates to LegalService.listAdmin', async () => {
    legal.listAdmin.mockResolvedValue([{ slug: 'terms' }]);
    const out = await controller.list();
    expect(legal.listAdmin).toHaveBeenCalled();
    expect(out).toEqual([{ slug: 'terms' }]);
  });

  it('get delegates to LegalService.getAdminPage with slug', async () => {
    legal.getAdminPage.mockResolvedValue({ slug: 'terms' });
    const out = await controller.get('terms');
    expect(legal.getAdminPage).toHaveBeenCalledWith('terms');
    expect(out.slug).toBe('terms');
  });

  it('getVersion delegates with parsed version number', async () => {
    legal.getAdminVersion.mockResolvedValue({ versionNumber: 2 });
    const out = await controller.getVersion('terms', '2');
    expect(legal.getAdminVersion).toHaveBeenCalledWith('terms', 2);
    expect(out.versionNumber).toBe(2);
  });

  it('update calls publishVersion with the admin user id from req', async () => {
    legal.publishVersion.mockResolvedValue({ versionNumber: 3 });
    const req: any = { adminUser: { id: 'admin-uuid' } };
    const out = await controller.update(
      'terms',
      { title: 'Terms', bodyMarkdown: '# new' } as any,
      req,
    );
    expect(legal.publishVersion).toHaveBeenCalledWith(
      'terms',
      'Terms',
      '# new',
      'admin-uuid',
    );
    expect(out.versionNumber).toBe(3);
  });

  it('UpdateLegalPageDto rejects bodyMarkdown over 50KB', async () => {
    const mod = await import('./admin-legal.controller');
    const Dto: any = (mod as any).UpdateLegalPageDto;
    const dto = new Dto();
    dto.title = 'OK';
    dto.bodyMarkdown = 'x'.repeat(50 * 1024 + 1);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('bodyMarkdown');
  });
});
