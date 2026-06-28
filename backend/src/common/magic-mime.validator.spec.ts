// backend/src/common/magic-mime.validator.spec.ts
import { BadRequestException } from '@nestjs/common';
import { assertMagicMime } from './magic-mime.validator';

// Hex-encoded fixtures so the test is self-contained — no fixture files
// to read from disk. Each is the first few bytes of a real file of that
// type plus enough padding to satisfy file-type's minimum read size.

// PNG: complete minimal 1×1 pixel PNG (PNG sig + IHDR + IDAT + IEND).
// The plan's original hex was a truncated IHDR that file-type v16 cannot
// fully parse and returns undefined for — replaced with a valid 68-byte PNG.
const PNG_HEADER = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fedce34e0000000049454e44ae426082',
  'hex',
);

// JPEG: FF D8 FF E0 ... JFIF
const JPEG_HEADER = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0',
  'hex',
);

describe('assertMagicMime', () => {
  it('returns the detected MIME when it is in the allowlist', async () => {
    const result = await assertMagicMime(PNG_HEADER, ['image/png']);
    expect(result).toBe('image/png');
  });

  it('throws BadRequestException for an empty buffer', async () => {
    await expect(assertMagicMime(Buffer.alloc(0), ['image/png'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when no signature matches the buffer', async () => {
    const random = Buffer.from('not a real file at all, just random text bytes');
    await expect(assertMagicMime(random, ['image/png'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when the detected MIME is not in the allowlist', async () => {
    await expect(
      assertMagicMime(JPEG_HEADER, ['image/png', 'image/webp']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('error messages include the detected MIME and the allowlist', async () => {
    await expect(
      assertMagicMime(JPEG_HEADER, ['image/png']),
    ).rejects.toThrow(/image\/jpeg/);
    await expect(
      assertMagicMime(JPEG_HEADER, ['image/png']),
    ).rejects.toThrow(/image\/png/);
  });
});
