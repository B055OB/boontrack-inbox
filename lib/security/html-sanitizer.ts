import DOMPurify from 'isomorphic-dompurify';
export { STOREFRONT_CSP_HEADER } from './csp-headers';

export const MAX_CUSTOM_HTML_BYTES = 65536; // 64 KB hard limit

export const ALLOWED_HTML_TAGS = [
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'main',
  'nav',
  'div',
  'span',
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'del',
  'ins',
  'mark',
  'small',
  'sub',
  'sup',
  'blockquote',
  'pre',
  'code',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'a',
  'img',
  'figure',
  'figcaption',
  'picture',
  'source',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'details',
  'summary',
  'time',
] as const;

export const FORBIDDEN_HTML_TAGS = [
  'script',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'style',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'noscript',
  'template',
  'slot',
  'portal',
] as const;

export const ALLOWED_HTML_ATTRS = [
  'class',
  'id',
  'href',
  'target',
  'rel',
  'src',
  'srcset',
  'sizes',
  'media',
  'type',
  'alt',
  'title',
  'width',
  'height',
  'loading',
  'decoding',
  'colspan',
  'rowspan',
  'scope',
  'role',
  'aria-label',
  'aria-hidden',
  'datetime',
  'open',
  'data-section',
  'data-theme',
  'data-variant',
] as const;

export const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto|tel):|\/(?!\/)|#)/i;

let hookRegistered = false;

function ensurePurifyHooks() {
  const purifyInstance = DOMPurify as unknown as {
    addHook?: (hookName: string, cb: (node: Element) => void) => void;
    sanitize?: (dirty: string, cfg?: Record<string, unknown>) => string;
  };
  if (hookRegistered || typeof purifyInstance?.addHook !== 'function') {
    return;
  }

  purifyInstance.addHook('afterSanitizeAttributes', (node: Element) => {
    if (!node || typeof node.getAttribute !== 'function') return;

    const tagName = (node.tagName || '').toLowerCase();
    if (tagName === 'a') {
      const href = node.getAttribute('href');
      if (href && !sanitizeNavigationUrl(href)) {
        node.removeAttribute('href');
      }
      const target = node.getAttribute('target');
      if (target === '_blank') {
        node.setAttribute('rel', 'noopener noreferrer');
      } else if (target && target !== '_self') {
        node.removeAttribute('target');
      }
    }

    if (tagName === 'img' || tagName === 'source') {
      const src = node.getAttribute('src');
      if (src && !sanitizeMediaUrl(src)) {
        node.removeAttribute('src');
      }
      const srcset = node.getAttribute('srcset');
      if (srcset) {
        const candidates = srcset
          .split(',')
          .map((entry) => entry.trim().split(/\s+/)[0])
          .filter(Boolean);
        if (candidates.some((u) => !sanitizeMediaUrl(u))) {
          node.removeAttribute('srcset');
        }
      }
    }
  });

  hookRegistered = true;
}

export function getUtf8ByteLength(input: string): number {
  if (typeof Buffer !== 'undefined' && typeof Buffer.byteLength === 'function') {
    return Buffer.byteLength(input, 'utf8');
  }
  return new TextEncoder().encode(input).length;
}

export function validateCustomHtmlPayload(
  rawHtml: unknown
): { valid: true; byteLength: number; html: string } | { valid: false; error: string; status: 400 | 413; byteLength?: number } {
  if (rawHtml === null || rawHtml === undefined || rawHtml === '') {
    return { valid: true, byteLength: 0, html: '' };
  }

  if (typeof rawHtml !== 'string') {
    return { valid: false, error: 'Custom HTML payload must be a string.', status: 400 };
  }

  const byteLength = getUtf8ByteLength(rawHtml);
  if (byteLength > MAX_CUSTOM_HTML_BYTES) {
    return {
      valid: false,
      error: `Custom HTML payload exceeds maximum allowed size (${MAX_CUSTOM_HTML_BYTES} bytes).`,
      status: 413,
      byteLength,
    };
  }

  return { valid: true, byteLength, html: rawHtml };
}

export function sanitizeNavigationUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('#')) {
    return trimmed;
  }
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'https:' || protocol === 'http:' || protocol === 'mailto:' || protocol === 'tel:') {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

export function sanitizeMediaUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'https:' || protocol === 'http:') {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Sanitizes Section 10 and Product Landing Custom HTML strictly.
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

  ensurePurifyHooks();

  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [...ALLOWED_HTML_TAGS],
    FORBID_TAGS: [...FORBIDDEN_HTML_TAGS],
    ALLOWED_ATTR: [...ALLOWED_HTML_ATTRS],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP,
    KEEP_CONTENT: true,
    FORCE_BODY: false,
  });
}
