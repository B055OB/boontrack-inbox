import DOMPurify from 'isomorphic-dompurify';
import {
  MAX_CUSTOM_HTML_BYTES,
  buildDomPurifyOptions,
  configureDomPurifyHooks,
  getUtf8ByteLength,
  type DomPurifyLike,
} from './html-sanitizer-policy';

export { STOREFRONT_CSP_HEADER } from './csp-headers';
export {
  ALLOWED_HTML_ATTRS,
  ALLOWED_HTML_TAGS,
  ALLOWED_URI_REGEXP,
  FORBIDDEN_HTML_TAGS,
  MAX_CUSTOM_HTML_BYTES,
  getUtf8ByteLength,
  sanitizeMediaUrl,
  sanitizeNavigationUrl,
  validateCustomHtmlPayload,
} from './html-sanitizer-policy';

const serverHookState = { registered: false };

/**
 * Server-authoritative sanitizer for Section 10 and Product Landing Custom HTML.
 * Enforces 64 KB limit and strips executable tags/attributes/URIs via isomorphic-dompurify.
 */
export function sanitizeSection10Html(rawHtml: unknown): string {
  if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
    return '';
  }

  if (getUtf8ByteLength(rawHtml) > MAX_CUSTOM_HTML_BYTES) {
    console.warn('[HtmlSanitizer] Rejected oversized custom HTML payload (> 64 KB).');
    return '';
  }

  configureDomPurifyHooks(DOMPurify as unknown as DomPurifyLike, serverHookState);

  return DOMPurify.sanitize(rawHtml, buildDomPurifyOptions());
}
