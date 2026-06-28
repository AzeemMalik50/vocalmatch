// backend/src/qr/qr.service.ts
import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

export interface QrRenderOptions {
  url: string;
  size: number;
  format: 'png' | 'svg';
  fgColor: string;
  bgColor: string;
  margin: number;
}

export interface QrRenderResult {
  buffer: Buffer;
  contentType: string;
}

@Injectable()
export class QrService {
  async render(opts: QrRenderOptions): Promise<QrRenderResult> {
    const colorConfig = {
      dark: opts.fgColor,
      light: opts.bgColor === 'transparent' ? '#0000' : opts.bgColor,
    };

    if (opts.format === 'svg') {
      const svg = await QRCode.toString(opts.url, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: opts.margin,
        width: opts.size,
        color: colorConfig,
      });
      return { buffer: Buffer.from(svg, 'utf8'), contentType: 'image/svg+xml' };
    }

    const buffer = await QRCode.toBuffer(opts.url, {
      type: 'png',
      errorCorrectionLevel: 'H',
      margin: opts.margin,
      width: opts.size,
      color: colorConfig,
    });
    return { buffer, contentType: 'image/png' };
  }
}
