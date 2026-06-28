// backend/src/qr/qr.controller.spec.ts
import { Test } from '@nestjs/testing';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';

describe('QrController', () => {
  let controller: QrController;
  const service: any = {
    render: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [QrController],
      providers: [{ provide: QrService, useValue: service }],
    }).compile();
    controller = moduleRef.get(QrController);
  });

  function makeRes() {
    return {
      setHeader: jest.fn(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as any;
  }

  it('returns PNG bytes for a valid url', async () => {
    service.render.mockResolvedValue({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentType: 'image/png',
    });
    const res = makeRes();
    await controller.generate(
      {
        url: 'https://vocalmatch.com',
        size: 512,
        format: 'png',
        fgColor: '#FF4B57',
        bgColor: '#FFFFFF',
        margin: 2,
      } as any,
      res,
    );
    expect(service.render).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/png',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=86400, stale-while-revalidate=604800',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/inline; filename="vocalmatch-qr\.png"/),
    );
    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it('returns SVG when format=svg', async () => {
    service.render.mockResolvedValue({
      buffer: Buffer.from('<svg/>'),
      contentType: 'image/svg+xml',
    });
    const res = makeRes();
    await controller.generate(
      {
        url: 'https://vocalmatch.com',
        size: 512,
        format: 'svg',
        fgColor: '#FF4B57',
        bgColor: '#FFFFFF',
        margin: 2,
      } as any,
      res,
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/svg+xml',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/inline; filename="vocalmatch-qr\.svg"/),
    );
  });

  it('passes "transparent" through as bgColor', async () => {
    service.render.mockResolvedValue({
      buffer: Buffer.alloc(10),
      contentType: 'image/png',
    });
    const res = makeRes();
    await controller.generate(
      {
        url: 'https://vocalmatch.com',
        size: 512,
        format: 'png',
        fgColor: '#FF4B57',
        bgColor: 'transparent',
        margin: 2,
      } as any,
      res,
    );
    expect(service.render).toHaveBeenCalledWith(
      expect.objectContaining({ bgColor: 'transparent' }),
    );
  });
});
