// backend/src/common/sanitize-filename.ts
/**
 * Normalize an arbitrary client-supplied filename so it's safe to log
 * and reference. Strips path components, replaces non-portable
 * characters with underscore, and caps total length at 100 chars.
 *
 * Cloudinary assigns its own asset IDs so this sanitized name never
 * reaches storage — but it does land in server logs (Multer's
 * file.originalname) and any audit trail consumer.
 */
export function sanitizeFilename(name: string | undefined): string {
  if (!name) return 'upload';
  // Take just the last path segment (works with both / and \ separators)
  const last = name.split(/[/\\]+/).pop() ?? 'upload';
  // Replace anything outside [A-Za-z0-9._-] with underscore
  const safe = last.replace(/[^A-Za-z0-9._-]+/g, '_');
  // Collapse runs of underscores
  const collapsed = safe.replace(/_+/g, '_');
  if (!collapsed) return 'upload';
  if (collapsed.length <= 100) return collapsed;
  // Preserve extension when truncating.
  // A valid extension has a dot that is not the first char and leaves
  // at most 10 chars after it (e.g. ".jpg", ".webm", ".tar.gz").
  const dot = collapsed.lastIndexOf('.');
  const extLen = collapsed.length - dot;
  if (dot <= 0 || extLen > 10) {
    return collapsed.slice(0, 100);
  }
  const ext = collapsed.slice(dot);
  const stem = collapsed.slice(0, dot);
  return stem.slice(0, 100 - ext.length) + ext;
}
