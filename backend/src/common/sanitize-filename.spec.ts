// backend/src/common/sanitize-filename.spec.ts
import { sanitizeFilename } from './sanitize-filename';

describe('sanitizeFilename', () => {
  it('strips path traversal segments', () => {
    const out = sanitizeFilename('../../etc/passwd');
    expect(out).not.toContain('/');
    expect(out).not.toContain('..');
    expect(out).toMatch(/passwd$/);
  });

  it('replaces spaces and special characters with underscore', () => {
    const out = sanitizeFilename('cute pic.jpg');
    expect(out).toBe('cute_pic.jpg');
  });

  it('removes shell metacharacters while preserving the extension', () => {
    const out = sanitizeFilename('evil; rm -rf /.png');
    expect(out).not.toContain(';');
    expect(out).not.toContain(' ');
    expect(out).not.toContain('/');
    expect(out.endsWith('.png')).toBe(true);
  });

  it('truncates very long names while keeping the extension', () => {
    const longName = 'a'.repeat(195) + '.jpg';
    const out = sanitizeFilename(longName);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith('.jpg')).toBe(true);
  });

  it('falls back to "upload" when the input is empty', () => {
    expect(sanitizeFilename(undefined)).toBe('upload');
    expect(sanitizeFilename('')).toBe('upload');
  });
});
