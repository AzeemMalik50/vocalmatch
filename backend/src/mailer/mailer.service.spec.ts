// backend/src/mailer/mailer.service.spec.ts
import { Test } from '@nestjs/testing';
import { MailerService } from './mailer.service';

describe('MailerService', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.MAIL_FROM;
  });

  it('falls back to console when GMAIL_USER is unset', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MailerService],
    }).compile();
    const svc = moduleRef.get(MailerService);

    await svc.sendPasswordResetEmail(
      'user@example.com',
      'https://vocalmatch.com/reset-password?token=abc',
    );

    const logs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logs).toMatch(/Reset link/i);
    expect(logs).toContain('user@example.com');
    expect(logs).toContain('https://vocalmatch.com/reset-password?token=abc');
  });

  it('calls the Gmail transporter when GMAIL_USER is set', async () => {
    process.env.GMAIL_USER = 'noreply@vocalmatch.com';
    process.env.GMAIL_APP_PASSWORD = 'fake-16-char-pwd';

    // Inject a mock transporter via the service's createTransport seam
    const sendMail = jest.fn(async () => ({ accepted: ['user@example.com'] }));
    const fakeTransport: any = { sendMail };

    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: MailerService,
          useFactory: () => new MailerService(fakeTransport),
        },
      ],
    }).compile();
    const svc = moduleRef.get(MailerService);

    await svc.sendPasswordResetEmail(
      'user@example.com',
      'https://vocalmatch.com/reset-password?token=abc',
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg: any = (sendMail.mock.calls as any)[0][0];
    expect(arg.to).toBe('user@example.com');
    expect(arg.subject).toMatch(/Reset your VOCALMATCH password/i);
    expect(arg.text).toContain('https://vocalmatch.com/reset-password?token=abc');
    expect(arg.text).toMatch(/1 hour/i);
  });
});
