import DOMPurify from 'dompurify';
import {
  MAX_CUSTOM_HTML_BYTES,
  buildDomPurifyOptions,
  configureDomPurifyHooks,
  getUtf8ByteLength,
  type DomPurifyLike,
} from './html-sanitizer-policy';

type DomPurifyExport = DomPurifyLike | ((win: Window) => DomPurifyLike);

let cachedWindowRef: Window | null = null;
let cachedPurifyInstance: DomPurifyLike | null = null;
const clientHookState = { registered: false };

function resolveBrowserPurify(): DomPurifyLike | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (cachedPurifyInstance && cachedWindowRef === window) {
    return cachedPurifyInstance;
  }

  const raw = DOMPurify as unknown as DomPurifyExport;
  const instance =
    typeof (raw as DomPurifyLike)?.sanitize === 'function'
      ? (raw as DomPurifyLike)
      : typeof raw === 'function'
      ? raw(window)
      : null;

  if (!instance || typeof instance.sanitize !== 'function') {
    return null;
  }

  cachedWindowRef = window;
  cachedPurifyInstance = instance;
  clientHookState.registered = false;
  configureDomPurifyHooks(instance, clientHookState);
  return instance;
}

/**
 * Browser-only defense-in-depth sanitizer for Section 10 and product landing HTML.
 * Uses pure `dompurify` without `jsdom` or Node SSR dependencies; fails closed
 * when called without a browser `window`. Server API routes remain the
 * authoritative sanitizer via `@/lib/security/html-sanitizer`.
 */
export function sanitizeSection10Html(rawHtml: unknown): string {
  if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
    return '';
  }

  if (getUtf8ByteLength(rawHtml) > MAX_CUSTOM_HTML_BYTES) {
    console.warn('[HtmlSanitizerClient] Rejected oversized custom HTML payload (> 64 KB).');
    return '';
  }

  const purify = resolveBrowserPurify();
  if (!purify?.sanitize) {
    return '';
  }

  return purify.sanitize(rawHtml, buildDomPurifyOptions());
}
