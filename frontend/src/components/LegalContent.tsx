'use client';

import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

interface Props {
  markdown: string;
}

/**
 * Renders trusted-stored markdown for legal pages. `rehype-sanitize` runs
 * the default sanitization schema, which strips raw HTML, <script>,
 * <iframe>, <style>, and event-handler attributes. We never store HTML
 * in the DB — only markdown — so this is defense-in-depth, not the only
 * line of defense.
 *
 * Headings/paragraphs/lists/links/inline emphasis/horizontal rules render;
 * images and code blocks are intentionally absent from legal copy.
 */
export default function LegalContent({ markdown }: Props) {
  return (
    <div className="prose prose-invert max-w-none prose-headings:font-display prose-headings:tracking-wide prose-a:text-spotlight hover:prose-a:underline prose-li:my-1">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>
    </div>
  );
}
