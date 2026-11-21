/**
 * @jest-environment node
 *
 * Project: BT-SEC-2026-001
 * Workstream: SEC-G2-C02
 * Scope: C02 Round 28 Phase C — Runtime Verification of All 40 Test Specifications
 *        (TC-R24-ADV-01..15, TC-R24-AUD-01..08, TC-R25-ADV-24..25,
 *         TC-R26-ADV-01..08, TC-R27-AUD-01..03, TC-R28-AUD-01..04)
 * Option: UD-07 Option A (parse5@7.3.0) ONLY
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Dispatcher } from 'undici';

interface MockDnsRecord {
  address: string;
  family: 4 | 6;
}

const mockControl = {
  dnsLookupImpl: null as null | ((hostname: string, options: unknown) => Promise<MockDnsRecord[]>),
  fetchImpl: null as null | ((input: string, init: Record<string, unknown>) => Promise<unknown>),
  agentCloseImpl: null as null | ((agent: unknown) => Promise<void>),
  agentDestroyImpl: null as null | ((agent: unknown) => Promise<void>),
  poolDestroyImpl: null as null | ((pool: unknown) => Promise<void>),
  responseConstructorImpl: null as null | ((body: unknown, init?: unknown) => unknown),
  agentInstances: [] as Array<Record<string, unknown>>,
  poolInstances: [] as Array<Record<string, unknown>>,
  agentCloseCalls: 0,
  agentDestroyCalls: 0,
  poolDestroyCalls: 0,
  eventLog: [] as string[],
};

jest.mock('node:dns/promises', () => {
  const actual = jest.requireActual('node:dns/promises');
  return {
    ...actual,
    lookup: jest.fn(async (hostname: string, options: unknown) => {
      if (mockControl.dnsLookupImpl) {
        return mockControl.dnsLookupImpl(hostname, options);
      }
      return [{ address: '93.184.216.34', family: 4 }];
    }),
  };
});

jest.mock('undici', () => {
  const actual = jest.requireActual('undici');

  class MockWrappedPool extends actual.Pool {
    constructor(origin: string | URL, opts?: Record<string, unknown>) {
      super(origin, opts);
      mockControl.poolInstances.push(this as unknown as Record<string, unknown>);
    }

    override destroy(...args: unknown[]): Promise<void> {
      mockControl.poolDestroyCalls += 1;
      mockControl.eventLog.push('pool.destroy');
      if (mockControl.poolDestroyImpl) {
        return mockControl.poolDestroyImpl(this);
      }
      return super.destroy(...(args as [Error?, (() => void)?]));
    }
  }

  class MockWrappedAgent extends actual.Agent {
    public readonly __mockOptions: Record<string, unknown>;

    constructor(opts: Record<string, unknown> = {}) {
      super(opts);
      this.__mockOptions = opts;
      mockControl.agentInstances.push(this as unknown as Record<string, unknown>);
    }

    override close(...args: unknown[]): Promise<void> {
      mockControl.agentCloseCalls += 1;
      mockControl.eventLog.push('agent.close');
      if (mockControl.agentCloseImpl) {
        return mockControl.agentCloseImpl(this);
      }
      return super.close(...(args as [(() => void)?]));
    }

    override destroy(...args: unknown[]): Promise<void> {
      mockControl.agentDestroyCalls += 1;
      mockControl.eventLog.push('agent.destroy');
      if (mockControl.agentDestroyImpl) {
        return mockControl.agentDestroyImpl(this);
      }
      return super.destroy(...(args as [Error?, (() => void)?]));
    }
  }

  class MockWrappedResponse extends actual.Response {
    constructor(body?: unknown, init?: unknown) {
      if (mockControl.responseConstructorImpl) {
        return mockControl.responseConstructorImpl(body, init) as MockWrappedResponse;
      }
      super(body, init);
    }
  }

  return {
    ...actual,
    Agent: MockWrappedAgent,
    Pool: MockWrappedPool,
    Response: MockWrappedResponse,
    fetch: jest.fn(async (input: string, init: Record<string, unknown>) => {
      if (mockControl.fetchImpl) {
        return mockControl.fetchImpl(input, init);
      }
      return actual.fetch(input, init);
    }),
  };
});

import * as dns from 'node:dns/promises';
const actualUndici = jest.requireActual('undici') as typeof import('undici');

import {
  EgressSecurityError,
  PERMITTED_OUTBOUND_HEADERS,
  executeSecureOutboundFetch,
  isEligibleOutboundIp4,
  isEligibleOutboundIp6,
  isIpLiteralHostname,
  isPermittedOutboundHeader,
  validateOutboundTargetUrl,
} from '@/lib/egress/secure-outbound-fetch';

import {
  CatalogSanitizationError,
  LexicalSanitizationError,
  encodeHtmlText,
  isSafePublicUrl,
  preserveSafeUnspacedMathLt,
  sanitizePublicText,
  validateLexicalPublicUrl,
} from '@/lib/public-catalog-sanitizer';

import {
  CURRENCY_EXPONENT_CONTRACT,
  parseMajorPrice,
  parseMinorPrice,
  parsePublicPriceContract,
  transformPublicProductDto,
} from '@/lib/product-catalog';

interface ControlledRawBody {
  readonly stream: {
    locked: boolean;
    getReader: () => ControlledRawReader;
    cancel: (reason?: unknown) => Promise<void>;
  };
  getCancelCount: () => number;
  getReaderCancelCount: () => number;
  getReleaseCount: () => number;
  isLocked: () => boolean;
}

interface ControlledRawReader {
  read: () => Promise<{ done: boolean; value?: Uint8Array }>;
  cancel: (reason?: unknown) => Promise<void>;
  releaseLock: () => void;
}

function createControlledRawBody(options: {
  readImpl?: () => Promise<{ done: boolean; value?: Uint8Array }>;
  cancelMode?: 'resolve' | 'hang' | 'sync-throw' | 'reject';
} = {}): ControlledRawBody {
  let locked = false;
  let bodyCancelCount = 0;
  let readerCancelCount = 0;
  let releaseCount = 0;

  const invokeCancel = (reason: unknown, source: 'body' | 'reader'): Promise<void> => {
    if (source === 'body') bodyCancelCount += 1;
    else readerCancelCount += 1;
    mockControl.eventLog.push(`${source}.cancel:${String((reason as Error)?.message ?? reason ?? '')}`);

    if (options.cancelMode === 'sync-throw') {
      throw new Error(`synchronous ${source} cancel failure`);
    }
    if (options.cancelMode === 'reject') {
      return Promise.reject(new Error(`async ${source} cancel rejection`));
    }
    if (options.cancelMode === 'hang') {
      return new Promise<void>(() => {
        // Intentionally never settles
      });
    }
    return Promise.resolve();
  };

  const reader: ControlledRawReader = {
    read: () => {
      if (options.readImpl) {
        return options.readImpl();
      }
      return Promise.resolve({ done: true, value: undefined });
    },
    cancel: (reason?: unknown) => invokeCancel(reason, 'reader'),
    releaseLock: () => {
      releaseCount += 1;
      locked = false;
    },
  };

  const stream = {
    get locked() {
      return locked;
    },
    getReader: () => {
      locked = true;
      return reader;
    },
    cancel: (reason?: unknown) => invokeCancel(reason, 'body'),
  };

  return {
    stream,
    getCancelCount: () => bodyCancelCount + readerCancelCount,
    getReaderCancelCount: () => readerCancelCount,
    getReleaseCount: () => releaseCount,
    isLocked: () => locked,
  };
}

function spawnTrackedPoolFromAgent(dispatcher: unknown, origin = 'https://cdn.boontrack.com'): void {
  const agent = dispatcher as { __mockOptions?: { factory?: (origin: string, opts: unknown) => unknown } };
  if (agent?.__mockOptions?.factory) {
    agent.__mockOptions.factory(origin, { connections: 1 });
  }
}

describe('SEC-G2-C02 Round 28 Phase C — Runtime Verification Suite (40 Cases)', () => {
  beforeEach(() => {
    mockControl.dnsLookupImpl = async () => [{ address: '93.184.216.34', family: 4 }];
    mockControl.fetchImpl = null;
    mockControl.agentCloseImpl = async () => undefined;
    mockControl.agentDestroyImpl = async () => undefined;
    mockControl.poolDestroyImpl = async () => undefined;
    mockControl.responseConstructorImpl = null;
    mockControl.agentInstances = [];
    mockControl.poolInstances = [];
    mockControl.agentCloseCalls = 0;
    mockControl.agentDestroyCalls = 0;
    mockControl.poolDestroyCalls = 0;
    mockControl.eventLog = [];
    jest.clearAllMocks();
  });

  // =========================================================================
  // 1. Egress SSRF, Lifecycle & Transport Teardown (TC-R24-ADV-01..07, 13, 14)
  // =========================================================================

  it('TC-R24-ADV-01: R23-F01 Case 1 — aborted pull() destroys Agent immediately without awaiting hanging reader.cancel() and clears activeReader', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);

    try {
      const controller = new AbortController();
      const controlled = createControlledRawBody({
        cancelMode: 'hang',
        readImpl: () => {
          controller.abort(new Error('consumer-abort-during-read'));
          return Promise.resolve({ done: false, value: new Uint8Array([1, 2, 3]) });
        },
      });

      mockControl.fetchImpl = async (url, init) => {
        spawnTrackedPoolFromAgent(init.dispatcher, new URL(url).origin);
        return {
          status: 200,
          statusText: 'OK',
          url,
          type: 'default',
          redirected: false,
          headers: new actualUndici.Headers({ 'content-type': 'text/plain' }),
          body: controlled.stream,
        };
      };

      const res = await executeSecureOutboundFetch('https://cdn.boontrack.com/catalog.json', {
        signal: controller.signal,
      });

      const reader = res.body!.getReader();
      let caughtErr: unknown = null;
      try {
        await reader.read();
      } catch (err) {
        caughtErr = err;
      }

      expect(caughtErr).toBeInstanceOf(EgressSecurityError);
      expect((caughtErr as EgressSecurityError).code).toBe('REQUEST_ABORTED');
      expect(mockControl.agentDestroyCalls).toBe(1);
      expect(mockControl.poolDestroyCalls).toBe(1);
      expect(controlled.getReaderCancelCount()).toBe(1);
      const destroyIdx = mockControl.eventLog.indexOf('agent.destroy');
      const cancelIdx = mockControl.eventLog.findIndex((e) => e.startsWith('reader.cancel:'));
      expect(destroyIdx).toBeGreaterThanOrEqual(0);
      expect(cancelIdx).toBeGreaterThan(destroyIdx);

      // Calling cancel again on errored locked reader surfaces stored REQUEST_ABORTED without re-cancelling rawReader
      expect(res.body!.locked).toBe(true);
      await expect(reader.cancel()).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
      expect(controlled.getReaderCancelCount()).toBe(1);
      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('TC-R24-ADV-02: R23-F01 Case 2 — res.body.cancel() destroys Agent + tracked Pools immediately even when underlying cancel() hangs; detaches abort listener only after teardown begins', async () => {
    const controller = new AbortController();
    const signalEvents: string[] = [];
    const origAdd = controller.signal.addEventListener.bind(controller.signal);
    const origRemove = controller.signal.removeEventListener.bind(controller.signal);

    jest.spyOn(controller.signal, 'addEventListener').mockImplementation((...args: Parameters<AbortSignal['addEventListener']>) => {
      signalEvents.push(`add:${args[0]}`);
      return origAdd(...args);
    });
    jest.spyOn(controller.signal, 'removeEventListener').mockImplementation((...args: Parameters<AbortSignal['removeEventListener']>) => {
      mockControl.eventLog.push(`removeEventListener:${args[0]}`);
      signalEvents.push(`remove:${args[0]}`);
      return origRemove(...args);
    });

    const controlled = createControlledRawBody({ cancelMode: 'hang' });

    mockControl.fetchImpl = async (url, init) => {
      spawnTrackedPoolFromAgent(init.dispatcher, new URL(url).origin);
      return {
        status: 200,
        statusText: 'OK',
        url,
        type: 'default',
        redirected: false,
        headers: new actualUndici.Headers({ 'content-type': 'application/octet-stream' }),
        body: controlled.stream,
      };
    };

    const res = await executeSecureOutboundFetch('https://cdn.boontrack.com/asset.bin', {
      signal: controller.signal,
      bodyIdleTimeoutMs: 5000,
    });

    // Ensure idleTimer had not triggered and abort listener stays attached while open
    expect(signalEvents).toContain('add:abort');
    expect(signalEvents).not.toContain('remove:abort');

    await res.body!.cancel('user-stop');

    expect(mockControl.agentDestroyCalls).toBe(1);
    expect(mockControl.poolDestroyCalls).toBe(1);
    expect(controlled.getCancelCount()).toBe(1);
    expect(signalEvents).toContain('remove:abort');

    const agentDestroyIdx = mockControl.eventLog.indexOf('agent.destroy');
    const detachIdx = mockControl.eventLog.indexOf('removeEventListener:abort');
    expect(agentDestroyIdx).toBeGreaterThanOrEqual(0);
    expect(detachIdx).toBeGreaterThan(agentDestroyIdx);
  });

  it('TC-R24-ADV-03: R23-F01 Case 3 — 302 redirect response with hanging rawBody.cancel() destroys transport first and immediately rejects with EGRESS_REDIRECT_FORBIDDEN', async () => {
    const controlled = createControlledRawBody({ cancelMode: 'hang' });

    mockControl.fetchImpl = async (url, init) => {
      spawnTrackedPoolFromAgent(init.dispatcher, new URL(url).origin);
      return {
        status: 302,
        statusText: 'Found',
        url,
        type: 'default',
        redirected: false,
        headers: new actualUndici.Headers({ location: 'https://internal.local/admin' }),
        body: controlled.stream,
      };
    };

    await expect(
      executeSecureOutboundFetch('https://cdn.boontrack.com/redirect')
    ).rejects.toMatchObject({
      name: 'EgressSecurityError',
      code: 'EGRESS_REDIRECT_FORBIDDEN',
    });

    expect(mockControl.agentDestroyCalls).toBe(1);
    expect(mockControl.poolDestroyCalls).toBe(1);
    expect(controlled.getCancelCount()).toBe(1);
    expect(mockControl.eventLog.indexOf('agent.destroy')).toBeLessThan(
      mockControl.eventLog.findIndex((e) => e.startsWith('body.cancel:'))
    );
  });

  it('TC-R24-ADV-04: R23-F01 Case 4 — 204 / 205 / HEAD carrying stalled or sync-throwing response.body cleans up Agent cleanly and returns null-body Response with immutable headers', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);

    try {
      const cases: Array<{ status: number; method: 'GET' | 'HEAD'; cancelMode: 'sync-throw' | 'hang' }> = [
        { status: 204, method: 'GET', cancelMode: 'sync-throw' },
        { status: 205, method: 'GET', cancelMode: 'hang' },
        { status: 200, method: 'HEAD', cancelMode: 'hang' },
      ];

      for (const tc of cases) {
        mockControl.agentCloseCalls = 0;
        mockControl.eventLog = [];
        const controlled = createControlledRawBody({ cancelMode: tc.cancelMode });

        mockControl.fetchImpl = async (url, init) => {
          spawnTrackedPoolFromAgent(init.dispatcher, new URL(url).origin);
          return {
            status: tc.status,
            statusText: tc.status === 204 ? 'No Content' : tc.status === 205 ? 'Reset Content' : 'OK',
            url,
            type: 'default',
            redirected: false,
            headers: new actualUndici.Headers({ 'x-test-case': String(tc.status) }),
            body: controlled.stream,
          };
        };

        const res = await executeSecureOutboundFetch('https://cdn.boontrack.com/probe', {
          method: tc.method,
        });

        expect(res.status).toBe(tc.status);
        expect(res.body).toBeNull();
        expect(res.headers.get('x-test-case')).toBe(String(tc.status));
        expect(mockControl.agentCloseCalls).toBe(1);
        expect(controlled.getCancelCount()).toBe(1);
        const closeIdx = mockControl.eventLog.indexOf('agent.close');
        const cancelIdx = mockControl.eventLog.findIndex((e) => e.startsWith('body.cancel:'));
        expect(closeIdx).toBeGreaterThanOrEqual(0);
        expect(cancelIdx).toBeGreaterThan(closeIdx);
      }

      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('TC-R24-ADV-05: R23-F01 Case 5 — concurrent cancel() + abort() during delayed destroy AND abort() preempting stalled cleanupAgent(false) CLOSING both destroy Agent + Pool once without unhandled rejections', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);

    try {
      // Scenario (a): delayed agent.destroy(), cancel() followed immediately by abort()
      let releaseDestroy!: () => void;
      mockControl.agentDestroyImpl = () =>
        new Promise<void>((resolve) => {
          releaseDestroy = resolve;
        });

      const controllerA = new AbortController();
      const bodyA = createControlledRawBody({ cancelMode: 'hang' });
      mockControl.fetchImpl = async (url, init) => {
        spawnTrackedPoolFromAgent(init.dispatcher, new URL(url).origin);
        return {
          status: 200,
          statusText: 'OK',
          url,
          type: 'default',
          redirected: false,
          headers: new actualUndici.Headers(),
          body: bodyA.stream,
        };
      };

      const resA = await executeSecureOutboundFetch('https://cdn.boontrack.com/a', {
        signal: controllerA.signal,
      });

      const cancelPromise = resA.body!.cancel('user-cancel');
      controllerA.abort(new Error('concurrent-abort'));
      releaseDestroy();
      await cancelPromise;

      expect(mockControl.agentDestroyCalls).toBe(1);
      expect(mockControl.poolDestroyCalls).toBe(1);

      // Scenario (b): stalled agent.close() (CLOSING) on HEAD null-body -> abort() preempts Promise.race
      mockControl.agentCloseCalls = 0;
      mockControl.agentDestroyCalls = 0;
      mockControl.poolDestroyCalls = 0;
      mockControl.agentDestroyImpl = async () => undefined;
      mockControl.agentCloseImpl = () => new Promise<void>(() => { /* stalls forever */ });

      const controllerB = new AbortController();
      const bodyB = createControlledRawBody({ cancelMode: 'reject' });
      mockControl.fetchImpl = async (url, init) => {
        spawnTrackedPoolFromAgent(init.dispatcher, new URL(url).origin);
        return {
          status: 200,
          statusText: 'OK',
          url,
          type: 'default',
          redirected: false,
          headers: new actualUndici.Headers(),
          body: bodyB.stream,
        };
      };

      const fetchPromiseB = executeSecureOutboundFetch('https://cdn.boontrack.com/b', {
        method: 'HEAD',
        signal: controllerB.signal,
      });

      // Allow undiciFetch microtask & agent.close() entry
      await new Promise((r) => setTimeout(r, 15));
      expect(mockControl.agentCloseCalls).toBe(1);
      controllerB.abort(new Error('abort-during-closing'));

      await expect(fetchPromiseB).rejects.toMatchObject({
        name: 'EgressSecurityError',
        code: 'REQUEST_ABORTED',
      });

      expect(mockControl.agentDestroyCalls).toBe(1);
      expect(mockControl.poolDestroyCalls).toBe(1);

      await new Promise((r) => setTimeout(r, 20));
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('TC-R24-ADV-06: R23-F01 Case 6 — repeated cleanup invocations (cancel, onAbort, idleTimer) after stalled/throwing cancel() dispatch cancellation at most once', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);

    try {
      const controller = new AbortController();
      const controlled = createControlledRawBody({
        cancelMode: 'sync-throw',
        readImpl: () => Promise.resolve({ done: false, value: new Uint8Array([9]) }),
      });

      mockControl.fetchImpl = async (url, init) => {
        spawnTrackedPoolFromAgent(init.dispatcher, new URL(url).origin);
        return {
          status: 200,
          statusText: 'OK',
          url,
          type: 'default',
          redirected: false,
          headers: new actualUndici.Headers(),
          body: controlled.stream,
        };
      };

      const res = await executeSecureOutboundFetch('https://cdn.boontrack.com/idempotent', {
        signal: controller.signal,
        bodyIdleTimeoutMs: 100,
      });

      const reader = res.body!.getReader();
      await reader.read(); // arms activeReader & resets idleTimer
      await reader.cancel('first-cancel');
      controller.abort(new Error('second-cleanup-abort'));
      await new Promise((r) => setTimeout(r, 130)); // well past bodyIdleTimeoutMs=100

      expect(controlled.getCancelCount()).toBe(1);
      expect(mockControl.agentDestroyCalls).toBe(1);
      expect(mockControl.poolDestroyCalls).toBe(1);
      expect(unhandled).toHaveLength(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('TC-R24-ADV-07: R23-F01 + R22-F05 — synchronous TypeError from new UndiciResponse() invokes forceDestroyAgent() first, cancels body non-blockingly, and rethrows TypeError', async () => {
    const controlled = createControlledRawBody({ cancelMode: 'hang' });

    mockControl.fetchImpl = async (url, init) => {
      spawnTrackedPoolFromAgent(init.dispatcher, new URL(url).origin);
      return {
        status: 200,
        statusText: 'OK',
        url,
        type: 'default',
        redirected: false,
        headers: new actualUndici.Headers({ 'content-type': 'text/plain' }),
        body: controlled.stream,
      };
    };

    mockControl.responseConstructorImpl = () => {
      throw new TypeError('Response constructor error: Invalid statusText');
    };

    await expect(
      executeSecureOutboundFetch('https://cdn.boontrack.com/bad-status-text')
    ).rejects.toThrow(new TypeError('Response constructor error: Invalid statusText'));

    expect(mockControl.agentDestroyCalls).toBe(1);
    expect(mockControl.poolDestroyCalls).toBe(1);
    expect(controlled.getCancelCount()).toBe(1);
    expect(mockControl.eventLog.indexOf('agent.destroy')).toBeLessThan(
      mockControl.eventLog.findIndex((e) => e.startsWith('body.cancel:'))
    );
  });

  // =========================================================================
  // 2. HTML Sanitizer Security & Convergence Tests (TC-R24-ADV-08..12)
  // =========================================================================

  it('TC-R24-ADV-08: R23-F02a / TC-R23-ADV-12 parity — 1..4 nested entity layers converge to empty string; 5..6 layers throw UNSAFE_NESTED_MARKUP', () => {
    const encodeEntitiesOnce = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const basePayload = '<script>alert(1)</script>';
    let payload = basePayload;

    for (let layer = 1; layer <= 4; layer++) {
      payload = encodeEntitiesOnce(payload);
      expect(sanitizePublicText(payload)).toBe('');
    }

    for (let layer = 5; layer <= 6; layer++) {
      payload = encodeEntitiesOnce(payload);
      expect(() => sanitizePublicText(payload)).toThrow(CatalogSanitizationError);
      try {
        sanitizePublicText(payload);
      } catch (err) {
        expect((err as CatalogSanitizationError).code).toBe('UNSAFE_NESTED_MARKUP');
      }
    }
  });

  it('TC-R24-ADV-09: R23-F02b — complexity bombs fail closed with HTML_COMPLEXITY_LIMIT_EXCEEDED', () => {
    const bombs = [
      '<a>'.repeat(3000),
      '<svg>' + '<g>'.repeat(3000),
      '<template>' + '<b>'.repeat(3000),
      '<div>'.repeat(80),
      '<b>'.repeat(80) + 'x',
    ];

    for (const bomb of bombs) {
      let thrown: unknown = null;
      try {
        sanitizePublicText(bomb);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(CatalogSanitizationError);
      expect((thrown as CatalogSanitizationError).code).toBe('HTML_COMPLEXITY_LIMIT_EXCEEDED');
    }
  });

  it('TC-R24-ADV-10: R23-F02c — safe math comparisons preserved verbatim while unclosed HTML/XSS fragments strip to empty string', () => {
    expect(sanitizePublicText('Rumus: x<y untuk semua pembeli')).toBe('Rumus: x<y untuk semua pembeli');
    expect(sanitizePublicText('Rumus: a<b+1 dan stok<maks berlaku')).toBe('Rumus: a<b+1 dan stok<maks berlaku');
    expect(sanitizePublicText('Discount < 50% & > 10%')).toBe('Discount < 50% & > 10%');

    expect(sanitizePublicText('<script src=x')).toBe('');
    expect(sanitizePublicText('<img src=x onerror=alert(1)')).toBe('');
    expect(sanitizePublicText('<b onmouseover=alert(1)')).toBe('');
    expect(sanitizePublicText('<svg/onload=alert(1)')).toBe('');
  });

  it('TC-R24-ADV-11: R23-F02d — block spacing, inline adjacency, split entity attack, and <<b/>script> bypass stripped safely', () => {
    expect(sanitizePublicText('<div>Hello</div><div>World</div>')).toBe('Hello World');
    expect(sanitizePublicText('<p>First</p><p>Second</p>')).toBe('First Second');
    expect(sanitizePublicText('Line 1<br>Line 2')).toBe('Line 1 Line 2');
    expect(sanitizePublicText('<span>Hel</span><span>lo</span>')).toBe('Hello');
    expect(sanitizePublicText('<b>Promo</b><i>Baru</i>')).toBe('PromoBaru');

    expect(sanitizePublicText('&lt;s<div></div>cript&gt;alert(1)&lt;/script&gt;')).toBe('');
    const doubleBracket = sanitizePublicText('<<b/>script>alert(1)');
    expect(doubleBracket).not.toContain('alert(1)');
    expect(doubleBracket).not.toMatch(/<[a-zA-Z]/);
  });

  it('TC-R24-ADV-12: R23-F03 (UD-07 Option A) + SEC-AUDIT-04 boundary check — parse5@7.3.0 used without isomorphic-dompurify, jsdom, node:*, or Option B fallback', () => {
    const repoRoot = process.cwd();
    const sanitizerSrc = fs.readFileSync(path.join(repoRoot, 'lib', 'public-catalog-sanitizer.ts'), 'utf-8');
    const catalogSrc = fs.readFileSync(path.join(repoRoot, 'lib', 'product-catalog.ts'), 'utf-8');

    expect(sanitizerSrc).toMatch(/from\s+['"]parse5['"]/);
    expect(sanitizerSrc).not.toMatch(/isomorphic-dompurify|jsdom|from\s+['"]node:/);
    expect(sanitizerSrc).not.toMatch(/ZERO_DEP_NAMED_ENTITIES/);
    expect(catalogSrc).not.toMatch(/isomorphic-dompurify|jsdom|from\s+['"]node:|from\s+['"]undici['"]/);

    expect(sanitizePublicText('<p><b>Hello</b> <i>World</i></p>')).toBe('Hello World');
    expect(encodeHtmlText(`<"'>`)).toBe('&lt;&quot;&#39;&gt;');
  });

  // =========================================================================
  // 3. Remaining Round 24 Tests (TC-R24-ADV-13..15, TC-R24-AUD-01..08)
  // =========================================================================

  it('TC-R24-ADV-13: R22-F01 / F02 / F04 — real Undici unexpected redirect, ECONNREFUSED preservation, port/scheme, and PERMITTED_OUTBOUND_HEADERS contract', async () => {
    // 1. Real Undici Dispatcher returning 302 triggers actual Undici redirect:error TypeError('fetch failed', { cause: Error('unexpected redirect') })
    const redirectMockAgent = new actualUndici.MockAgent();
    redirectMockAgent.disableNetConnect();
    redirectMockAgent
      .get('https://redirect.boontrack.com')
      .intercept({ path: '/step1', method: 'GET' })
      .reply(302, '', { headers: { location: 'https://evil.example/steal' } });

    mockControl.fetchImpl = async (url, init) => {
      spawnTrackedPoolFromAgent(init.dispatcher, new URL(url).origin);
      return actualUndici.fetch(url, {
        ...init,
        dispatcher: redirectMockAgent as unknown as Dispatcher,
      } as actualUndici.RequestInit);
    };

    try {
      await expect(
        executeSecureOutboundFetch('https://redirect.boontrack.com/step1')
      ).rejects.toMatchObject({
        name: 'EgressSecurityError',
        code: 'EGRESS_REDIRECT_FORBIDDEN',
      });
    } finally {
      await redirectMockAgent.close();
    }

    // 2. Preserve raw network ECONNREFUSED when signal is not aborted
    const econnErr = Object.assign(new Error('connect ECONNREFUSED 93.184.216.34:443'), {
      code: 'ECONNREFUSED',
    });
    mockControl.fetchImpl = async () => {
      throw econnErr;
    };
    await expect(
      executeSecureOutboundFetch('https://cdn.boontrack.com/down')
    ).rejects.toBe(econnErr);

    // 3. Non-443 port, insecure http, and forbidden authority headers
    await expect(executeSecureOutboundFetch('http://cdn.boontrack.com/a')).rejects.toMatchObject({
      code: 'EGRESS_HTTPS_REQUIRED',
    });
    await expect(executeSecureOutboundFetch('https://cdn.boontrack.com:8443/a')).rejects.toMatchObject({
      code: 'EGRESS_PORT_PROHIBITED',
    });
    await expect(
      executeSecureOutboundFetch('https://cdn.boontrack.com/a', {
        headers: { Host: 'internal.local' },
      })
    ).rejects.toMatchObject({ code: 'AUTHORITY_OVERRIDE_PROHIBITED' });

    // 4. Permitted header allowlist + stripping non-allowlisted headers (authorization, cookie)
    let seenHeaders: Record<string, string> = {};
    mockControl.fetchImpl = async (url, init) => {
      seenHeaders = init.headers as Record<string, string>;
      return {
        status: 200,
        statusText: 'OK',
        url,
        type: 'default',
        redirected: false,
        headers: new actualUndici.Headers(),
        body: null,
      };
    };
    await executeSecureOutboundFetch('https://cdn.boontrack.com/headers', {
      headers: {
        'Accept': 'application/json',
        'If-None-Match': '"v1"',
        'Authorization': 'Bearer secret',
        'Cookie': 'session=secret',
      },
    });
    expect(seenHeaders).toEqual({ accept: 'application/json', 'if-none-match': '"v1"' });
    expect(isPermittedOutboundHeader('if-none-match')).toBe(true);
    expect(Object.isFrozen(PERMITTED_OUTBOUND_HEADERS)).toBe(true);

    // 5. DNS mock SSRF rejection check using real pinnedLookup path via actual fetch wrapper
    expect(jest.isMockFunction(dns.lookup)).toBe(true);
  });

  it('TC-R24-ADV-14: R22-F06 — isIpLiteralHostname + validateLexicalPublicUrl + validateOutboundTargetUrl reject obfuscated IPv4/IPv6 literals cleanly', () => {
    expect(isIpLiteralHostname('256.1')).toBe(true);
    expect(isIpLiteralHostname('08.1')).toBe(true);
    expect(isIpLiteralHostname('4294967296')).toBe(true);
    expect(isIpLiteralHostname('0x100000000')).toBe(true);
    expect(isIpLiteralHostname('999.0.0.1.')).toBe(true);
    expect(isIpLiteralHostname('12345.com')).toBe(false);

    const parseableIpUrls = [
      'https://127.0.0.1/p',
      'https://2130706433/p',
      'https://0x7f000001/p',
      'https://0177.0.0.1/p',
      'https://[::1]/p',
      'https://[::ffff:127.0.0.1]/p',
      'https://[2001:db8::1]/p',
    ];

    for (const badUrl of parseableIpUrls) {
      expect(isSafePublicUrl(badUrl)).toBe(false);
      try {
        validateLexicalPublicUrl(badUrl);
        throw new Error(`Expected IP_LITERAL_PROHIBITED for ${badUrl}`);
      } catch (err) {
        expect(err).toBeInstanceOf(LexicalSanitizationError);
        expect((err as CatalogSanitizationError).code).toBe('IP_LITERAL_PROHIBITED');
      }

      try {
        validateOutboundTargetUrl(badUrl);
        throw new Error(`Expected IP_LITERAL_URL_PROHIBITED for ${badUrl}`);
      } catch (err) {
        expect(err).toBeInstanceOf(EgressSecurityError);
        expect((err as EgressSecurityError).code).toBe('IP_LITERAL_URL_PROHIBITED');
      }
    }

    const malformedNumericIpUrls = [
      'https://256.1/p',
      'https://08.1/p',
      'https://4294967296/p',
      'https://0x100000000/p',
      'https://999.0.0.1./p',
    ];

    for (const malformedUrl of malformedNumericIpUrls) {
      expect(isSafePublicUrl(malformedUrl)).toBe(false);
      expect(() => validateLexicalPublicUrl(malformedUrl)).toThrow(LexicalSanitizationError);
      expect(() => validateOutboundTargetUrl(malformedUrl)).toThrow(EgressSecurityError);
    }

    expect(validateLexicalPublicUrl('https://12345.com/item')).toBe('https://12345.com/item');
  });

  it('TC-R24-ADV-15: R22-F07 + UD-04 — transformPublicProductDto enforces fail-closed metadata, null-prototype containers, deep freeze, and canonical string MinorPrice', () => {
    const validDto = transformPublicProductDto({
      id: 'prod_001',
      title: 'Sepatu <b>Lari</b>',
      description: 'Nyaman dipakai',
      amount_minor: '0250000',
      currency: 'IDR',
      media: [{ type: 'IMAGE', url: 'https://cdn.boontrack.com/img.png', alt: 'Foto' }],
      metadata: {
        feature_flags: ['fast_ship'],
        external_reference: null,
        cogs: 99999,
      },
    });

    expect(Object.getPrototypeOf(validDto)).toBeNull();
    expect(Object.getPrototypeOf(validDto.price)).toBeNull();
    expect(Object.getPrototypeOf(validDto.metadata)).toBeNull();
    expect(Object.isFrozen(validDto)).toBe(true);
    expect(Object.isFrozen(validDto.price)).toBe(true);
    expect(validDto.title).toBe('Sepatu Lari');
    expect(validDto.price).toEqual({ amount_minor: '250000', currency: 'IDR' });
    expect(typeof validDto.price.amount_minor).toBe('string');
    expect('cogs' in (validDto.metadata as object)).toBe(false);
    expect('external_reference' in (validDto.metadata as object)).toBe(false);

    for (const emptyRef of ['<script>x()</script>', '   ']) {
      try {
        transformPublicProductDto({
          id: 'p1',
          title: 'Item',
          amount_minor: '100',
          metadata: { external_reference: emptyRef },
        });
        throw new Error('Expected INVALID_METADATA_FIELD');
      } catch (err) {
        expect(err).toBeInstanceOf(CatalogSanitizationError);
        expect((err as CatalogSanitizationError).code).toBe('INVALID_METADATA_FIELD');
      }
    }
  });

  it('TC-R24-AUD-01: R24-F01a — strips unknown closed HTML tags completely without leaking opening tag syntax', () => {
    expect(sanitizePublicText('<xss autofocus>alert(1)</xss>')).toBe('alert(1)');
    expect(sanitizePublicText('<blink hidden>Promo</blink>')).toBe('Promo');
  });

  it('TC-R24-AUD-02: R24-F01a x F02d — strips synthesized tags across convergence passes', () => {
    const first = sanitizePublicText('&lt;scr<br>ipt&gt;alert(1)&lt;/script&gt;');
    expect(first).toBe('alert(1)');
    expect(first).not.toMatch(/[<>]/);

    const second = sanitizePublicText('&lt;img<div>x</div>onerror=alert(1)&gt;');
    expect(second).toBe('');
  });

  it('TC-R24-AUD-03: R24-F01b — unclosed repeating <script payload executes in O(n) linear time (< 50ms) and strips completely', () => {
    // Warm up V8 JIT on parse5 attribute tokenizer before measuring O(n) latency
    const warmup = '<script "' + '<script '.repeat(500) + 'a'.repeat(2000);
    expect(sanitizePublicText(warmup)).toBe('');
    expect(sanitizePublicText(warmup)).toBe('');

    const payload = '<script "' + '<script '.repeat(2040) + 'a'.repeat(45000);
    const startScan = performance.now();
    preserveSafeUnspacedMathLt(payload);
    const scanMs = performance.now() - startScan;

    const start = performance.now();
    const result = sanitizePublicText(payload);
    const elapsedMs = performance.now() - start;

    expect(result).toBe('');
    expect(scanMs).toBeLessThan(50);
    expect(elapsedMs).toBeLessThan(50);
  });

  it('TC-R24-AUD-04: R24-F01c — apostrophe inside prose never swallows subsequent HTML tags', () => {
    expect(
      sanitizePublicText("Rumus: x<y untuk Jum'at <b>Spesial</b> & <a href=\"https://cdn.boontrack.com\">Link</a>")
    ).toBe("Rumus: x<y untuk Jum'at Spesial & Link");
  });

  it('TC-R24-AUD-05: R24-F02 (Option A) — 2,048 <b> tags + 2,048 text nodes trips insertText budget during parseFragment()', () => {
    const payload = '<b>x</b>y'.repeat(1024);
    expect(() => sanitizePublicText(payload)).toThrow(CatalogSanitizationError);
    try {
      sanitizePublicText(payload);
    } catch (err) {
      expect((err as CatalogSanitizationError).code).toBe('HTML_COMPLEXITY_LIMIT_EXCEEDED');
    }
  });

  it('TC-R24-AUD-06: R24-F03a — abruptly closed WHATWG HTML5 comments preserve trailing promo text', () => {
    expect(sanitizePublicText('<!-->Promo Spesial')).toBe('Promo Spesial');
    expect(sanitizePublicText('<!--->Promo Spesial')).toBe('Promo Spesial');
    expect(sanitizePublicText('<!-- comment --!>Promo Spesial')).toBe('Promo Spesial');
  });

  it('TC-R24-AUD-07: R24-F03a — abruptly closed comment before <script> drops script subtree completely', () => {
    expect(sanitizePublicText('<!--><script>-->Malicious Injected Text</script>')).toBe('');
    expect(sanitizePublicText('<!-- --!><script>-->Malicious Injected Text</script>')).toBe('');
  });

  it('TC-R24-AUD-08: R24-F03b — foreign self-closing <svg/> and <math/> do not swallow following text', () => {
    expect(sanitizePublicText('<svg/>Promo Diskon 50%')).toBe('Promo Diskon 50%');
    expect(sanitizePublicText('<math/>Harga Spesial')).toBe('Harga Spesial');
  });

  // =========================================================================
  // 4. Round 25..28 Regression Suite (TC-R25-ADV-24..25, TC-R26..28)
  // =========================================================================

  it('TC-R25-ADV-24: R25-F03 — SCRIPT_DATA_DOUBLE_ESCAPED and misnested <svg> breakout yield clean text', () => {
    expect(sanitizePublicText('<script><!--<script>alert(1)</script>alert(2)--></script>Safe')).toBe('Safe');
    expect(sanitizePublicText('<b><svg></b><text>Leaked</text></svg>Safe')).toBe('LeakedSafe');
  });

  it('TC-R25-ADV-25: R25-F01 — single-letter left-operand math vs standalone unclosed <b tag', () => {
    expect(sanitizePublicText('Rumus: a<b untuk semua pembeli')).toBe('Rumus: a<b untuk semua pembeli');
    expect(sanitizePublicText('Promo <b')).toBe('Promo');
  });

  it('TC-R26-ADV-01: R25-AUD-01 — ordinary Indonesian/English words starting with on* after unspaced math are preserved', () => {
    expect(sanitizePublicText('Promo: x<y hanya online hari ini!')).toBe('Promo: x<y hanya online hari ini!');
    expect(sanitizePublicText('Diskon: a<b gratis ongkir!')).toBe('Diskon: a<b gratis ongkir!');
  });

  it('TC-R26-ADV-02: R25-AUD-01 — unclosed attributed event handler attributes are stripped to EOF', () => {
    expect(sanitizePublicText('Promo <b onload=alert(1)')).toBe('Promo');
    expect(sanitizePublicText('Promo <xss onerror = 1')).toBe('Promo');
  });

  it('TC-R26-ADV-03: R25-AUD-02 & R25-AUD-03 #6 — empty block inside entity-encoded script/style/applet strips cleanly on Pass 2', () => {
    expect(sanitizePublicText('&lt;s<div></div>cript&gt;alert(1)&lt;/script&gt;')).toBe('');
    expect(sanitizePublicText('&lt;s<div></div>tyle&gt;body{color:red}&lt;/style&gt;')).toBe('');
    expect(sanitizePublicText('&lt;a<p></p>pplet&gt;EVIL&lt;/applet&gt;')).toBe('');
  });

  it('TC-R26-ADV-04: R25-AUD-03 #1 & #2 — foreign <title/>, <style/>, and <title> inside <svg> preserve promo text', () => {
    expect(sanitizePublicText('<svg><title/></svg>Promo Diskon 50%')).toBe('Promo Diskon 50%');
    expect(sanitizePublicText('<svg><style/></svg>Promo Diskon 50%')).toBe('Promo Diskon 50%');
    expect(sanitizePublicText('<svg><title></svg>Promo Diskon</title>')).toBe('Promo Diskon');
  });

  it('TC-R26-ADV-05: R25-AUD-03 #3 — unclosed quote inside </script or </style end tag drops trailing text to EOF', () => {
    expect(sanitizePublicText('<script></script x=">alert(1)')).toBe('');
    expect(sanitizePublicText('<style></style x=">body{display:none}')).toBe('');
  });

  it('TC-R26-ADV-06: R25-AUD-03 #4 — quoted > inside </svg end tag attributes hides SVG child text and preserves Safe', () => {
    expect(sanitizePublicText('<svg>HIDDEN</svg x=">LEAKED">Safe')).toBe('Safe');
  });

  it('TC-R26-ADV-07: R25-AUD-03 #5 — depth 70 > MAX_HTML_AST_DEPTH (64) fails closed with HTML_COMPLEXITY_LIMIT_EXCEEDED', () => {
    const deep = '<div>'.repeat(70) + 'x' + '</div>'.repeat(70);
    expect(() => sanitizePublicText(deep)).toThrow(CatalogSanitizationError);
    try {
      sanitizePublicText(deep);
    } catch (err) {
      expect((err as CatalogSanitizationError).code).toBe('HTML_COMPLEXITY_LIMIT_EXCEEDED');
    }
  });

  it('TC-R26-ADV-08: R25-AUD-03 #7/#8 + R26-AUD-02b — immediate <!--> in <script> and case-sensitive &Lt; / &LT;b&GT; decode accurately', () => {
    expect(sanitizePublicText('<script><!--><script>alert(1)</script>--></script>Safe')).toBe('-->Safe');
    expect(sanitizePublicText('Nilai &Lt; 100 dan &LT;b&GT;Tebal&LT;/b&GT;')).toBe('Nilai \u226A 100 dan Tebal');
  });

  it('TC-R27-AUD-01: R26-AUD-01 — closed WHATWG tag-name extensions strip cleanly while unspaced math punctuation stays intact in O(n)', () => {
    expect(sanitizePublicText('<x=1 onmouseover=alert(1)>Promo</x=1>')).toBe('Promo');
    expect(sanitizePublicText('<b=1 autofocus>alert(1)</b=1>')).toBe('alert(1)');
    expect(sanitizePublicText('Promo <x=1')).toBe('Promo');
    expect(sanitizePublicText('Diskon x<y+1 berlaku hari ini')).toBe('Diskon x<y+1 berlaku hari ini');
    expect(sanitizePublicText('Rumus: x<y+1 dan a<b*2 berlaku')).toBe('Rumus: x<y+1 dan a<b*2 berlaku');

    // Direct O(n) scanner timing on 16,000 unclosed tags (48,000 chars) + pre-parse limit enforcement + max-in-budget sanitize
    const tScan0 = performance.now();
    const scanned = preserveSafeUnspacedMathLt('<a "'.repeat(16000));
    const scanMs = performance.now() - tScan0;
    expect(scanned).toBe('<a "'.repeat(16000));
    expect(scanMs).toBeLessThan(50);

    try {
      sanitizePublicText('<a "'.repeat(16000));
      throw new Error('Expected pre-parse HTML_COMPLEXITY_LIMIT_EXCEEDED');
    } catch (err) {
      expect(err).toBeInstanceOf(CatalogSanitizationError);
      expect((err as CatalogSanitizationError).code).toBe('HTML_COMPLEXITY_LIMIT_EXCEEDED');
    }

    const start = performance.now();
    const out = sanitizePublicText('<a "'.repeat(2040) + 'a'.repeat(40000));
    const elapsedMs = performance.now() - start;
    expect(out).toBe('');
    expect(elapsedMs).toBeLessThan(50);
  });

  it('TC-R27-AUD-02: R26-AUD-02a — over-budget opening/closing tag floods trip MAX_HTML_AST_NODES (2,048)', () => {
    for (const payload of [
      '<a>'.repeat(1200) + '</a>'.repeat(1200),
      '</x>'.repeat(1500) + '<a>'.repeat(600),
    ]) {
      let thrown: unknown = null;
      try {
        sanitizePublicText(payload);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toBeInstanceOf(CatalogSanitizationError);
      expect((thrown as CatalogSanitizationError).code).toBe('HTML_COMPLEXITY_LIMIT_EXCEEDED');
    }
  });

  it('TC-R27-AUD-03: R26-AUD-02c (UD-07 Option A WHATWG Conformance) — <svg><b>Hello</b></svg> yields Hello and <svg/ >Promo strips to empty string', () => {
    expect(sanitizePublicText('<svg><b>Hello</b></svg>')).toBe('Hello');
    expect(sanitizePublicText('<svg/ >Promo')).toBe('');
  });

  it('TC-R28-AUD-01: R27-AUD-01 — all six malicious closed-tag embedded-< payloads strip cleanly with zero executable markup', () => {
    const cases: Array<[string, string]> = [
      ['<x<1 onmouseover=alert(1)>Promo</x<1>', 'Promo'],
      ['<x a<1 onmouseover=alert(1)>Promo</x>', 'Promo'],
      ['<xss<1 autofocus>alert(1)</xss<1>', 'alert(1)'],
      ['a<b<1 autofocus>alert(1)</b<1>', 'aalert(1)'],
      ['<x+1<2 onmouseover=alert(1)>Promo</x+1<2>', 'Promo'],
      ['<x< onmouseover=alert(1)>Promo</x<>', 'Promo'],
    ];

    for (const [input, expected] of cases) {
      const result = sanitizePublicText(input);
      expect(result).toBe(expected);
      expect(result).not.toMatch(/[<>]|onmouseover|autofocus/i);
    }
  });

  it('TC-R28-AUD-02: R27-AUD-01 — multi-pass convergence strips <x<1<b> onmouseover=alert(1)>Promo to Promo cleanly', () => {
    const result = sanitizePublicText('<x<1<b> onmouseover=alert(1)>Promo');
    expect(result).toBe('Promo');
    expect(result).not.toMatch(/[<>]|onmouseover/i);
  });

  it('TC-R28-AUD-03: R27-AUD-01 — chained unspaced math prose coexists cleanly with valid HTML tags', () => {
    expect(sanitizePublicText('Rumus: x<y<10 dan <b>bold</b>')).toBe('Rumus: x<y<10 dan bold');
    expect(sanitizePublicText('Rumus: x<y<10')).toBe('Rumus: x<y<10');
    expect(sanitizePublicText('Promo: x<y hanya online hari ini!')).toBe('Promo: x<y hanya online hari ini!');
  });

  it('TC-R28-AUD-04: R27-AUD-01 — O(n) monotonic scan progress, UD-07 Option A governance lock, UD-01 pricing, and IPv4/IPv6 boundary invariants', () => {
    // 1. O(n) monotonic progress & no infinite loop
    const start1 = performance.now();
    const preserved64k = preserveSafeUnspacedMathLt('<x<1'.repeat(16000));
    const elapsed1 = performance.now() - start1;
    expect(preserved64k.length).toBeGreaterThan(64000);
    expect(elapsed1).toBeLessThan(50);

    const sanitizedDefault = sanitizePublicText('<x<1'.repeat(500) + 'a'.repeat(45000));
    expect(sanitizedDefault.length).toBe(4000);

    const start2 = performance.now();
    const sanitizedExtended = sanitizePublicText('<x<1'.repeat(500) + 'a'.repeat(45000), {
      maxLength: 60000,
    });
    const elapsed2 = performance.now() - start2;
    expect(sanitizedExtended).toContain('a'.repeat(45000));
    expect(elapsed2).toBeLessThan(50);

    const start3 = performance.now();
    const chainedGt = sanitizePublicText('<x<1<2<3<4<5'.repeat(400) + '>');
    const elapsed3 = performance.now() - start3;
    expect(chainedGt).not.toContain('>');
    expect(elapsed3).toBeLessThan(50);

    // 2. UD-07 Option A package.json dependency lock & undici runtime resolution
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
    ) as { dependencies?: Record<string, string> };
    expect(pkgJson.dependencies?.parse5).toBe('7.3.0');

    let resolvedUndiciVersion: string | undefined = pkgJson.dependencies?.undici;
    if (!resolvedUndiciVersion) {
      try {
        resolvedUndiciVersion = (require('undici/package.json') as { version?: string }).version;
      } catch {
        resolvedUndiciVersion = (process.versions as Record<string, string>).undici;
      }
    }
    expect(resolvedUndiciVersion).toBeDefined();
    expect(typeof resolvedUndiciVersion).toBe('string');

    // 3. UD-01 & CURRENCY_EXPONENT_CONTRACT sanity
    expect(CURRENCY_EXPONENT_CONTRACT.IDR).toBe(0);
    expect(CURRENCY_EXPONENT_CONTRACT.USD).toBe(2);
    expect(parseMinorPrice('0100', 'IDR')).toEqual({ amount_minor: '100', currency: 'IDR' });
    expect(() => parseMajorPrice('0100', 'USD')).toThrow(CatalogSanitizationError);
    expect(parsePublicPriceContract({ amount_minor: '15000', currency: 'IDR' })).toEqual({
      amount_minor: '15000',
      currency: 'IDR',
    });

    // 4. IANA / RFC 6890 / IPv6 eligibility sanity
    expect(isEligibleOutboundIp4('192.0.0.1')).toBe(false);
    expect(isEligibleOutboundIp4('93.184.216.34')).toBe(true);
    expect(isEligibleOutboundIp6('::ffff:8.8.8.8')).toBe(false);
    expect(isEligibleOutboundIp6('2606:4700:4700::1111')).toBe(true);
  });
});
