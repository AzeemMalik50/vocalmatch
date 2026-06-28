// backend/src/qr/qr.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Response } from 'express';
import { QrService, QrRenderOptions } from './qr.service';

class QrQueryDto {
  // require_tld:false allows http://localhost:3000/... in dev. The
  // protocol allowlist still blocks dangerous schemes (javascript:, etc.)
  // and the @MaxLength cap prevents abuse as a payload-amplification farm.
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(64)
  @Max(2000)
  size?: number;

  @IsOptional()
  @IsIn(['png', 'svg'])
  format?: 'png' | 'svg';

  // Accept either #RRGGBB / #RGB OR the literal "transparent" for bgColor.
  // For fgColor we keep it strictly hex.
  @IsOptional()
  @IsHexColor()
  fgColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(transparent|#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?)$/, {
    message:
      'bgColor must be a hex color (e.g. #FFFFFF) or the literal string "transparent"',
  })
  bgColor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(8)
  margin?: number;
}

@ApiTags('QR')
@Controller('qr')
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Get()
  @ApiOperation({
    summary: 'Render a QR code for the given URL',
    description:
      'Encodes the given URL as a PNG (default) or SVG. Public — caches ' +
      'for 24h. Used by marketing tooling, in-context share modals, and any ' +
      'external design tool that can hot-link an <img>.',
  })
  @ApiQuery({ name: 'url', required: true, type: String })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @ApiQuery({ name: 'format', required: false, enum: ['png', 'svg'] })
  @ApiQuery({ name: 'fgColor', required: false, type: String })
  @ApiQuery({ name: 'bgColor', required: false, type: String })
  @ApiQuery({ name: 'margin', required: false, type: Number })
  async generate(@Query() dto: QrQueryDto, @Res() res: Response): Promise<void> {
    const opts: QrRenderOptions = {
      url: dto.url,
      size: dto.size ?? 512,
      format: dto.format ?? 'png',
      fgColor: dto.fgColor ?? '#FF4B57',
      bgColor: dto.bgColor ?? '#FFFFFF',
      margin: dto.margin ?? 2,
    };

    const { buffer, contentType } = await this.qr.render(opts);
    const ext = opts.format === 'svg' ? 'svg' : 'png';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="vocalmatch-qr.${ext}"`,
    );
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, stale-while-revalidate=604800',
    );
    res.send(buffer);
  }
}
