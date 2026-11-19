/**
 * Public Catalog Lexical Sanitizer Module (Round 26 Shared Foundation)
 * Workstream: SEC-G2-C02 (BT-SEC-2026-001)
 * Target File: lib/public-catalog-sanitizer.ts
 */

import {
  defaultTreeAdapter,
  parseFragment,
  type DefaultTreeAdapterTypes,
  type TreeAdapter,
} from 'parse5';

export class CatalogSanitizationError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'CatalogSanitizationError';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Exact alias preserving baseline imports (`LexicalSanitizationError === CatalogSanitizationError`). */
export { CatalogSanitizationError as LexicalSanitizationError };

export const RFC_1123_HOSTNAME_REGEX =
  /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

const LOOPBACK_AND_INTERNAL_HOSTS = new Set([
  'localhost',
  'local',
  'internal',
  'localhost.localdomain',
]);

const LEXICAL_URL_DELIMITERS_REGEX = /[\s/?#@\\\x00-\x1f\x7f]/;
const LEXICAL_NUMERIC_OR_HEX_PART_REGEX = /^(?:\d+|0[xX][0-9a-fA-F]*)$/;

function isLexicalIpv4LikeLiteral(candidate: string): boolean {
  if (!candidate || LEXICAL_URL_DELIMITERS_REGEX.test(candidate)) return false;
  const normalized = candidate.endsWith('.') ? candidate.slice(0, -1) : candidate;
  if (!normalized || normalized.endsWith('.')) return false;
  const parts = normalized.split('.');
  if (parts.length < 1 || parts.length > 4) return false;
  return parts.every((part) => part.length > 0 && LEXICAL_NUMERIC_OR_HEX_PART_REGEX.test(part));
}

export function validateLexicalPublicUrl(inputUrl: string): string {
  if (typeof inputUrl !== 'string' || !inputUrl.trim()) {
    throw new CatalogSanitizationError('INVALID_URL_SYNTAX', 'URL must be a non-empty string');
  }
  const trimmed = inputUrl.trim();
  if (/[\x00-\x1f\x7f]/.test(trimmed)) {
    throw new CatalogSanitizationError(
      'INVALID_URL_SYNTAX',
      'URL contains prohibited control characters'
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new CatalogSanitizationError('INVALID_URL_SYNTAX', `Failed to parse URL: ${trimmed}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new CatalogSanitizationError(
      'INSECURE_PROTOCOL_PROHIBITED',
      `Protocol '${parsed.protocol}' is prohibited. Public catalog URLs must use 'https:' exclusively.`
    );
  }
  if (parsed.username || parsed.password) {
    throw new CatalogSanitizationError(
      'USERINFO_PROHIBITED',
      'URLs with embedded userinfo (username/password) are forbidden.'
    );
  }
  const rawHostname = parsed.hostname.toLowerCase();
  if (!rawHostname) {
    throw new CatalogSanitizationError('EMPTY_HOSTNAME', 'Target URL hostname cannot be empty.');
  }
  const unbracketed =
    rawHostname.startsWith('[') && rawHostname.endsWith(']')
      ? rawHostname.slice(1, -1)
      : rawHostname;

  if (
    isLexicalIpv4LikeLiteral(unbracketed) ||
    rawHostname.startsWith('[') ||
    rawHostname.endsWith(']') ||
    unbracketed.includes(':')
  ) {
    throw new CatalogSanitizationError(
      'IP_LITERAL_PROHIBITED',
      `Direct IP literals (${rawHostname}) are forbidden in public catalog URLs.`
    );
  }

  const hostNoTrailingDots = rawHostname.replace(/\.+$/, '');
  if (
    LOOPBACK_AND_INTERNAL_HOSTS.has(hostNoTrailingDots) ||
    hostNoTrailingDots.endsWith('.localhost') ||
    hostNoTrailingDots.endsWith('.local') ||
    hostNoTrailingDots.endsWith('.internal') ||
    hostNoTrailingDots.endsWith('.localdomain')
  ) {
    throw new CatalogSanitizationError(
      'LOOPBACK_HOST_PROHIBITED',
      `Hostname '${rawHostname}' is a prohibited local, internal, or loopback domain.`
    );
  }

  if (
    rawHostname.endsWith('.') ||
    rawHostname.length > 253 ||
    !RFC_1123_HOSTNAME_REGEX.test(rawHostname)
  ) {
    throw new CatalogSanitizationError(
      'INVALID_RFC1123_HOST',
      `Hostname '${rawHostname}' violates RFC 1123 multi-label FQDN syntax.`
    );
  }

  const labels = rawHostname.split('.');
  if (/^\d+$/.test(labels[labels.length - 1])) {
    throw new CatalogSanitizationError(
      'INVALID_RFC1123_HOST',
      `Hostname '${rawHostname}' cannot terminate with an all-numeric TLD.`
    );
  }

  return parsed.toString();
}

export function isSafePublicUrl(inputUrl: string): boolean {
  try {
    validateLexicalPublicUrl(inputUrl);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Shared Sanitizer Bounds & R23-F02 / R24-F01 / R25-AUD-01 Contracts
// ---------------------------------------------------------------------------

export interface SanitizeTextOptions {
  readonly allowNullish?: boolean;
  readonly maxLength?: number;
}

export const MAX_SANITIZE_INPUT_CHARS = 65_536;
export const MAX_HTML_AST_NODES = 2_048;
export const MAX_HTML_AST_DEPTH = 64;
export const MAX_CONVERGE_PASSES = 5;
export const DEFAULT_MAX_TEXT_LENGTH = 4_000;

const ASCII_CONTROL_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function stripDisallowedControls(value: string): string {
  return value.replace(ASCII_CONTROL_REGEX, '');
}

const DROPPED_HTML_SUBTREE_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'textarea',
  'title',
  'xmp',
  'noembed',
  'noframes',
  'plaintext',
  'portal',
  'audio',
  'video',
  'canvas',
  'head',
]);

/**
 * Multi-letter standard HTML / SVG / MathML tag names (always stripped even if unclosed at EOF).
 */
const MULTI_LETTER_HTML_TAGS = new Set([
  ...DROPPED_HTML_SUBTREE_TAGS,
  'abbr', 'address', 'area', 'article', 'aside', 'base', 'bdi', 'bdo',
  'bgsound', 'blockquote', 'body', 'br', 'button', 'caption', 'center', 'cite',
  'code', 'col', 'colgroup', 'data', 'datalist', 'dd', 'del', 'details', 'dfn',
  'dialog', 'dir', 'div', 'dl', 'dt', 'em', 'fieldset', 'figcaption', 'figure',
  'font', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hgroup', 'hr', 'html', 'image', 'img', 'input', 'ins', 'kbd', 'keygen',
  'label', 'legend', 'li', 'link', 'main', 'map', 'mark', 'marquee', 'menu',
  'menuitem', 'meta', 'meter', 'nav', 'nobr', 'ol', 'optgroup', 'option',
  'output', 'param', 'picture', 'pre', 'progress', 'rb', 'rp', 'rt',
  'rtc', 'ruby', 'samp', 'search', 'section', 'select', 'slot', 'small',
  'source', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'time', 'tr', 'track', 'tt',
  'ul', 'var', 'wbr', 'path', 'rect', 'circle', 'line', 'polygon',
  'polyline', 'ellipse', 'text', 'tspan', 'use', 'defs', 'desc', 'foreignobject',
  'mi', 'mn', 'mo', 'ms', 'mtext', 'annotation-xml',
]);

/**
 * Single-letter HTML/SVG tag names ('a', 'b', 'g', 'i', 'p', 'q', 's', 'u').
 * When unclosed without attributes/closing '>', e.g. "Rumus: a<b untuk semua",
 * an immediately preceding alphanumeric operand ('a' before '<b') disambiguates
 * mathematical comparison from an unclosed tag like "<b onload=alert(1)".
 */
const SINGLE_LETTER_HTML_TAGS = new Set(['a', 'b', 'g', 'i', 'p', 'q', 's', 'u']);

const BLOCK_CONTAINER_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'caption', 'dd', 'details', 'dialog',
  'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'li', 'main', 'nav',
  'ol', 'p', 'pre', 'search', 'section', 'summary', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'tr', 'ul',
]);

const BREAK_HTML_TAGS = new Set(['br', 'hr']);

/**
 * R25-AUD-01 Fix: Removed the valueless `|[\s/]on[a-zA-Z]{2,}\b` branch that falsely matched
 * ordinary English/Indonesian words starting with "on" ("online", "ongkir", "only", "once")
 * after unspaced math comparisons ("Promo: x<y hanya online hari ini!").
 * Real HTML attribute assignments (including event handlers like `onload=alert(1)` or `onerror = 1`)
 * require `=`, and URI scheme injections match `(?:javascript|vbscript|data)\s*:`.
 */
const HTML_ATTR_OR_EVENT_REGEX =
  /(?:[\s/][a-zA-Z_:][-a-zA-Z0-9_:.]*\s*=|(?:javascript|vbscript|data)\s*:)/i;

function isAsciiLetterCode(code: number): boolean {
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isAsciiDigitCode(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isTagNameCharCode(code: number): boolean {
  return (
    isAsciiLetterCode(code) ||
    isAsciiDigitCode(code) ||
    code === 45 || // '-'
    code === 58 || // ':'
    code === 95    // '_'
  );
}

/**
 * R23-F02b Layer 1: Pre-parse O(n) complexity guard executed BEFORE DOM parsing/allocation.
 */
function assertPreParseTagBudget(input: string): void {
  let tagOpenCandidates = 0;
  for (let i = 0; i < input.length; i++) {
    if (input.charCodeAt(i) === 60 /* '<' */ && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (
        isAsciiLetterCode(next) ||
        next === 47 /* '/' */ ||
        next === 33 /* '!' */ ||
        next === 63 /* '?' */
      ) {
        tagOpenCandidates++;
        if (tagOpenCandidates > MAX_HTML_AST_NODES) {
          throw new CatalogSanitizationError(
            'HTML_COMPLEXITY_LIMIT_EXCEEDED',
            `Text input exceeds pre-parse HTML tag limit (${MAX_HTML_AST_NODES})`
          );
        }
      }
    }
  }
}

/**
 * R24-F01a/b/c + R25-AUD-01 + R26-AUD-01 + R27-AUD-01: Disjoint-Interval Linear O(n) Math '<' Preserver.
 *
 * Invariants:
 * 1. Zero quote-tracking inside the lookahead window: apostrophes in prose ("Jum'at") never swallow
 *    subsequent HTML tags ("<b>Spesial</b>").
 * 2. Disjoint scan FIRST (`R26-AUD-01` + `R27-AUD-01`): inner pointer `k` ALWAYS scans forward from `j`
 *    to the FIRST raw `>`, valid WHATWG `_stateTagOpen` starter `<[a-zA-Z/!?]`, or `EOF` BEFORE any
 *    pre-escaping decision is made (ignoring non-tag `<` like `<1` or `< ` inside tag/attribute names).
 * 3. Every closed `<ident...>` construct (`foundClosingGt === true`) — including WHATWG tag-name
 *    extensions containing `=` or punctuation (`<x=1 onmouseover=alert(1)>`, `<b=1 autofocus>`)
 *    and unknown boolean-attribute tags (`<xss autofocus>`) — is NEVER pre-escaped to `&lt;`;
 *    `i` advances directly to `k + 1` so the HTML parser strips the closed tag cleanly.
 * 4. Strictly inside the unclosed branch (`foundClosingGt === false`, terminated by next `<` or
 *    `EOF`), multi-letter HTML tags, custom/namespaced tags (`-` or `:`), standalone single-letter
 *    HTML tags without a left operand, immediate `/` or `=`, trailing slash `/`, or attribute
 *    assignments (`HTML_ATTR_OR_EVENT_REGEX`) are left raw so `eofInTag` strips them, whereas
 *    unspaced math comparisons (`x<y`, `a<b`, `x<y+1`, `a<b*2`) are pre-escaped to `&lt;`.
 * 5. Outer pointer `i` advances monotonically (`k + 1` when closed, `k >= j >= i + 2` when unclosed)
 *    over disjoint intervals -> each character is inspected at most twice -> strict O(n) worst-case.
 */
export function preserveSafeUnspacedMathLt(input: string): string {
  if (input.indexOf('<') === -1) {
    return input;
  }

  let out = '';
  let lastFlushed = 0;
  let i = 0;

  while (i < input.length) {
    if (input.charCodeAt(i) !== 60 /* '<' */ || i + 1 >= input.length) {
      i++;
      continue;
    }

    const nextCode = input.charCodeAt(i + 1);
    if (!isAsciiLetterCode(nextCode)) {
      i++;
      continue;
    }

    let j = i + 1;
    while (j < input.length && isTagNameCharCode(input.charCodeAt(j))) {
      j++;
    }

    const lowerIdent = input.slice(i + 1, j).toLowerCase();
    const afterIdentCode = j < input.length ? input.charCodeAt(j) : -1;
    const prevCode = i > 0 ? input.charCodeAt(i - 1) : -1;
    const hasUnspacedLeftOperand =
      prevCode !== -1 && (isAsciiLetterCode(prevCode) || isAsciiDigitCode(prevCode));

    const isAlwaysUnsafeTag =
      MULTI_LETTER_HTML_TAGS.has(lowerIdent) ||
      lowerIdent.indexOf('-') !== -1 ||
      lowerIdent.indexOf(':') !== -1;

    // R26-AUD-01 + R27-AUD-01 Fix: Execute disjoint linear scan from j to FIRST raw '>',
    // valid WHATWG _stateTagOpen starter '<[a-zA-Z/!?]', or EOF FIRST (zero quote state),
    // BEFORE any pre-escaping decision.
    let k = j;
    let foundClosingGt = false;
    while (k < input.length) {
      const c = input.charCodeAt(k);
      if (c === 62 /* '>' */) {
        foundClosingGt = true;
        break;
      }
      if (c === 60 /* '<' */) {
        if (k + 1 < input.length) {
          const afterLt = input.charCodeAt(k + 1);
          if (
            isAsciiLetterCode(afterLt) ||
            afterLt === 47 /* '/' */ ||
            afterLt === 33 /* '!' */ ||
            afterLt === 63 /* '?' */
          ) {
            break;
          }
        }
      }
      k++;
    }

    // R24-F01a + R26-AUD-01: ANY closed `<ident...>` interval (including `<x=1 ...>`, `<b=1 ...>`,
    // `<xss autofocus>`) MUST remain raw so the HTML parser strips it completely.
    if (foundClosingGt) {
      i = k + 1;
      continue;
    }

    // Truly unclosed `<ident...` (terminated by next `<` or `EOF` without any `>`)
    const fragmentBetween = input.slice(j, k);
    const isSingleLetterTagWithoutLeftOperand =
      SINGLE_LETTER_HTML_TAGS.has(lowerIdent) && !hasUnspacedLeftOperand;

    const looksLikeDangerousOrAttributedUnclosedTag =
      isAlwaysUnsafeTag ||
      isSingleLetterTagWithoutLeftOperand ||
      afterIdentCode === 47 /* '/' */ ||
      afterIdentCode === 61 /* '=' */ ||
      fragmentBetween.trimEnd().endsWith('/') ||
      HTML_ATTR_OR_EVENT_REGEX.test(fragmentBetween);

    if (!looksLikeDangerousOrAttributedUnclosedTag) {
      out += input.slice(lastFlushed, i) + '&lt;';
      lastFlushed = i + 1;
    }

    // Advance i directly to k (next '<' or EOF; k >= j >= i + 2) -> disjoint scan intervals -> strict O(n)
    i = k;
  }

  if (lastFlushed === 0) {
    return input;
  }
  return out + input.slice(lastFlushed);
}

/**
 * R23-F02d + R25-AUD-02/03 helper: maintains clean word spacing across NON-EMPTY block containers
 * and <br>/<hr> while restoring `pendingBreak` on empty blocks (so `'&lt;s<div></div>cript&gt;'`
 * never injects a space that could split reassembled `<script>` tags across convergence passes).
 */
class PlainTextChunkBuilder {
  private readonly chunks: string[] = [];
  public emittedCharCount = 0;
  public pendingBreak = false;

  public pushText(textVal: string): void {
    if (!textVal) {
      return;
    }
    if (this.pendingBreak) {
      this.pendingBreak = false;
      const lastChunk = this.chunks.length > 0 ? this.chunks[this.chunks.length - 1] : '';
      const lastChar = lastChunk ? lastChunk[lastChunk.length - 1] : '';
      const firstChar = textVal[0];
      if (lastChar && !/\s/.test(lastChar) && !/\s/.test(firstChar)) {
        this.chunks.push(' ');
        this.emittedCharCount += 1;
      }
    }
    this.chunks.push(textVal);
    this.emittedCharCount += textVal.length;
  }

  public markBreakIfStarted(): void {
    if (this.emittedCharCount > 0) {
      this.pendingBreak = true;
    }
  }

  public toString(): string {
    return this.chunks.join('');
  }
}

export function encodeHtmlText(plainText: string): string {
  if (typeof plainText !== 'string' || !plainText) {
    return '';
  }
  return plainText
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncateCodeUnitSafe(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength === 0) return '';
  const code = value.charCodeAt(maxLength - 1);
  if (code >= 0xd800 && code <= 0xdbff) {
    return value.slice(0, maxLength - 1);
  }
  return value.slice(0, maxLength);
}

/**
 * R23-F02b + R24-F02 + R25-AUD-02 Layer 2: Parse-time complexity circuit breaker wrapping
 * parse5 defaultTreeAdapter.
 * - Intercepts createElement, createCommentNode, createDocumentFragment, createTextNode,
 *   setDocumentType, insertText, and insertTextBefore so newly allocated text nodes and DOCTYPE
 *   nodes are counted against MAX_HTML_AST_NODES (2,048) during parsing.
 * - Intercepts onItemPush / onItemPop on parse5's OpenElementStack to enforce MAX_HTML_AST_DEPTH (64)
 *   during parsing.
 */
function createBoundedTreeAdapter(): TreeAdapter<DefaultTreeAdapterTypes.DefaultTreeAdapterMap> {
  let allocatedNodes = 0;
  let openDepth = 0;

  // Fragment parser allocates 3 internal scaffolding nodes (template context, documentmock, html root)
  const ALLOC_GRACE = 8;
  const DEPTH_GRACE = 4;

  const incrementNodeCount = (): void => {
    allocatedNodes++;
    if (allocatedNodes > MAX_HTML_AST_NODES + ALLOC_GRACE) {
      throw new CatalogSanitizationError(
        'HTML_COMPLEXITY_LIMIT_EXCEEDED',
        `HTML parser node allocation exceeded budget (${MAX_HTML_AST_NODES})`
      );
    }
  };

  const trackNode = <T>(node: T): T => {
    incrementNodeCount();
    return node;
  };

  return {
    ...defaultTreeAdapter,
    createElement(tagName, namespaceURI, attrs) {
      return trackNode(defaultTreeAdapter.createElement(tagName, namespaceURI, attrs));
    },
    createCommentNode(data) {
      return trackNode(defaultTreeAdapter.createCommentNode(data));
    },
    createTextNode(value) {
      return trackNode(defaultTreeAdapter.createTextNode(value));
    },
    createDocumentFragment() {
      return trackNode(defaultTreeAdapter.createDocumentFragment());
    },
    setDocumentType(document, name, publicId, systemId) {
      const parent = document as DefaultTreeAdapterTypes.ParentNode;
      const hadDocType = parent.childNodes.some((n) => n.nodeName === '#documentType');
      defaultTreeAdapter.setDocumentType(document, name, publicId, systemId);
      if (!hadDocType) {
        incrementNodeCount();
      }
    },
    insertText(parentNode, text) {
      const children = (parentNode as DefaultTreeAdapterTypes.ParentNode).childNodes;
      const prevLast = children.length > 0 ? children[children.length - 1] : null;
      const willAllocateTextNode = !prevLast || prevLast.nodeName !== '#text';
      if (willAllocateTextNode) {
        incrementNodeCount();
      }
      defaultTreeAdapter.insertText(parentNode, text);
    },
    insertTextBefore(parentNode, text, referenceNode) {
      const children = (parentNode as DefaultTreeAdapterTypes.ParentNode).childNodes;
      const refIdx = children.indexOf(referenceNode as DefaultTreeAdapterTypes.ChildNode);
      const prevNode = refIdx > 0 ? children[refIdx - 1] : null;
      const willAllocateTextNode = !prevNode || prevNode.nodeName !== '#text';
      if (willAllocateTextNode) {
        incrementNodeCount();
      }
      defaultTreeAdapter.insertTextBefore(parentNode, text, referenceNode);
    },
    onItemPush(item) {
      openDepth++;
      if (openDepth > MAX_HTML_AST_DEPTH + DEPTH_GRACE) {
        throw new CatalogSanitizationError(
          'HTML_COMPLEXITY_LIMIT_EXCEEDED',
          `HTML parser nesting depth exceeded budget (${MAX_HTML_AST_DEPTH})`
        );
      }
      defaultTreeAdapter.onItemPush?.(item);
    },
    onItemPop(item, newTop) {
      openDepth = Math.max(0, openDepth - 1);
      defaultTreeAdapter.onItemPop?.(item, newTop);
    },
  };
}

/**
 * R23-F02a/b/c/d + R24-F02 + R25-AUD-02 Hardened Option A plain-text extractor using parse5@7.3.0.
 */
function extractPlainTextPass(input: string): string {
  // Layer 1: Pre-parse O(n) complexity budget before DOM allocation
  assertPreParseTagBudget(input);

  // Layer 1b: Preserve safe unspaced math prose ('x<y') while keeping closed/dangerous tags raw
  const preNormalized = preserveSafeUnspacedMathLt(input);

  // Layer 2: Parse with bounded TreeAdapter circuit breaker
  const fragment = parseFragment(preNormalized, {
    treeAdapter: createBoundedTreeAdapter(),
  });
  const rootChildren = fragment.childNodes;
  if (!rootChildren || rootChildren.length === 0) {
    return '';
  }

  type StackEntry =
    | {
        readonly kind: 'node';
        readonly node: DefaultTreeAdapterTypes.Node;
        readonly depth: number;
        readonly inDroppedSubtree: boolean;
      }
    | {
        readonly kind: 'exit-block';
        readonly charCountAtEnter: number;
        readonly prevPendingBreak: boolean;
      };

  const stack: StackEntry[] = [];
  for (let i = rootChildren.length - 1; i >= 0; i--) {
    stack.push({
      kind: 'node',
      node: rootChildren[i],
      depth: 1,
      inDroppedSubtree: false,
    });
  }

  const builder = new PlainTextChunkBuilder();
  let visitedNodes = 0;

  // Layer 3: Iterative AST walk counting ALL nodes & depth (INCLUDING dropped subtrees & template.content)
  while (stack.length > 0) {
    const entry = stack.pop()!;
    if (entry.kind === 'exit-block') {
      if (builder.emittedCharCount > entry.charCountAtEnter) {
        builder.pendingBreak = true;
      } else {
        // R25-AUD-02 Fix: Empty container block (<div></div>) restores prevPendingBreak so
        // '&lt;s<div></div>cript&gt;alert(1)&lt;/script&gt;' reassembles '<script>' and strips to ''
        builder.pendingBreak = entry.prevPendingBreak;
      }
      continue;
    }

    visitedNodes++;
    if (visitedNodes > MAX_HTML_AST_NODES) {
      throw new CatalogSanitizationError(
        'HTML_COMPLEXITY_LIMIT_EXCEEDED',
        `Text input exceeds maximum HTML node budget (${MAX_HTML_AST_NODES})`
      );
    }
    if (entry.depth > MAX_HTML_AST_DEPTH) {
      throw new CatalogSanitizationError(
        'HTML_COMPLEXITY_LIMIT_EXCEEDED',
        `Text input exceeds maximum HTML nesting depth (${MAX_HTML_AST_DEPTH})`
      );
    }

    const node = entry.node;
    if (node.nodeName === '#text') {
      if (!entry.inDroppedSubtree) {
        const textVal = (node as DefaultTreeAdapterTypes.TextNode).value;
        builder.pushText(textVal);
      }
      continue;
    }

    if (node.nodeName === '#comment' || node.nodeName === '#documentType') {
      continue;
    }

    if (node.nodeName === '#document-fragment') {
      const frag = node as DefaultTreeAdapterTypes.DocumentFragment;
      if (Array.isArray(frag.childNodes) && frag.childNodes.length > 0) {
        const nextDepth = entry.depth + 1;
        for (let i = frag.childNodes.length - 1; i >= 0; i--) {
          stack.push({
            kind: 'node',
            node: frag.childNodes[i],
            depth: nextDepth,
            inDroppedSubtree: entry.inDroppedSubtree,
          });
        }
      }
      continue;
    }

    const elem = node as DefaultTreeAdapterTypes.Element;
    const tag = typeof elem.tagName === 'string' ? elem.tagName.toLowerCase() : '';
    const childDropped = entry.inDroppedSubtree || DROPPED_HTML_SUBTREE_TAGS.has(tag);

    if (!childDropped && BREAK_HTML_TAGS.has(tag)) {
      builder.markBreakIfStarted();
      continue;
    }

    const isBlockContainer = !childDropped && BLOCK_CONTAINER_TAGS.has(tag);
    if (isBlockContainer) {
      const prevPending = builder.pendingBreak;
      builder.markBreakIfStarted();
      stack.push({
        kind: 'exit-block',
        charCountAtEnter: builder.emittedCharCount,
        prevPendingBreak: prevPending,
      });
    }

    const nextDepth = entry.depth + 1;

    // R23-F02b: Include <template>.content subtree in node/depth accounting
    if (tag === 'template') {
      const tmplContent = (elem as DefaultTreeAdapterTypes.Template).content;
      if (tmplContent) {
        stack.push({
          kind: 'node',
          node: tmplContent,
          depth: nextDepth,
          inDroppedSubtree: childDropped,
        });
      }
    }

    if (Array.isArray(elem.childNodes) && elem.childNodes.length > 0) {
      for (let i = elem.childNodes.length - 1; i >= 0; i--) {
        stack.push({
          kind: 'node',
          node: elem.childNodes[i],
          depth: nextDepth,
          inDroppedSubtree: childDropped,
        });
      }
    }
  }

  return builder.toString();
}

export function sanitizePublicText(input: unknown, maxLength: number): string;
export function sanitizePublicText(
  input: unknown,
  options: SanitizeTextOptions & { readonly allowNullish: false },
  fieldName?: string
): string;
export function sanitizePublicText(
  input: unknown,
  options?: SanitizeTextOptions,
  fieldName?: string
): string | null;
export function sanitizePublicText(
  input: unknown,
  optionsOrMaxLength: SanitizeTextOptions | number = {},
  fieldName: string = 'text'
): string | null {
  const isLegacyNumericSignature = typeof optionsOrMaxLength === 'number';
  const allowNullish = isLegacyNumericSignature
    ? true
    : optionsOrMaxLength.allowNullish ?? true;
  const maxLength = isLegacyNumericSignature
    ? optionsOrMaxLength
    : optionsOrMaxLength.maxLength ?? DEFAULT_MAX_TEXT_LENGTH;

  if (!Number.isInteger(maxLength) || maxLength < 0) {
    throw new CatalogSanitizationError(
      'INVALID_MAX_LENGTH',
      `maxLength for '${fieldName}' must be a non-negative integer`
    );
  }

  if (input === null || input === undefined) {
    if (isLegacyNumericSignature) return '';
    if (allowNullish) return null;
    throw new CatalogSanitizationError(
      'REQUIRED_TEXT_MISSING',
      `Field '${fieldName}' cannot be null or undefined`
    );
  }

  if (typeof input !== 'string') {
    throw new CatalogSanitizationError(
      'INVALID_TEXT_TYPE',
      `Field '${fieldName}' must be a string; type '${typeof input}' received`
    );
  }

  if (input.length > MAX_SANITIZE_INPUT_CHARS) {
    throw new CatalogSanitizationError(
      'TEXT_INPUT_TOO_LARGE',
      `Field '${fieldName}' exceeds maximum pre-sanitization length (${MAX_SANITIZE_INPUT_CHARS})`
    );
  }

  let current = stripDisallowedControls(input);
  let converged = false;

  // R23-F02a: 5 passes handle 1..4 entity layers + tag strip pass cleanly
  for (let pass = 0; pass < MAX_CONVERGE_PASSES; pass++) {
    const next = stripDisallowedControls(extractPlainTextPass(current));
    if (next === current) {
      converged = true;
      break;
    }
    current = next;
  }

  // Fixed-point stability check (6th pass): fails closed on 5+ entity layers (TC-R23-ADV-12)
  if (!converged) {
    const verifyStable = stripDisallowedControls(extractPlainTextPass(current));
    if (verifyStable !== current) {
      throw new CatalogSanitizationError(
        'UNSAFE_NESTED_MARKUP',
        `Field '${fieldName}' contains excessively nested HTML/entity encoding`
      );
    }
  }

  const trimmed = current.trim();
  return truncateCodeUnitSafe(trimmed, maxLength);
}
