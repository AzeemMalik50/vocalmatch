// backend/src/common/magic-mime.validator.ts
import { BadRequestException } from '@nestjs/common';
import { fromBuffer } from 'file-type';

/**
 * Inspects a file's first bytes to determine its real MIME type,
 * ignoring any client-supplied Content-Type. Throws BadRequestException
 * if:
 *   - the buffer is empty
 *   - no signature matched (corrupt / unknown / encrypted file)
 *   - the detected MIME is not in `allowed`
 *
 * Returns the detected MIME on success.
 */
export async function assertMagicMime(
  buffer: Buffer,
  allowed: readonly string[],
): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('Empty file');
  }
  const detected = await fromBuffer(buffer);
  if (!detected) {
    throw new BadRequestException(
      'Could not determine file type from file contents',
    );
  }
  if (!allowed.includes(detected.mime)) {
    throw new BadRequestException(
      `File type ${detected.mime} is not allowed (accepted: ${allowed.join(', ')})`,
    );
  }
  return detected.mime;
}
