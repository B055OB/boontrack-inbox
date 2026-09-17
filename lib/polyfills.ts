/**
 * Polyfills and runtime compatibility guards for older Safari / WebKit engines (iOS 15 - 16.x).
 * Ensures absence of modern ES features (structuredClone, requestIdleCallback) doesn't crash execution.
 */

if (typeof window !== 'undefined') {
  // 1. structuredClone polyfill for Safari < 15.4
  if (typeof (window as any).structuredClone !== 'function') {
    (window as any).structuredClone = function <T>(value: T): T {
      if (value === undefined) return undefined as unknown as T;
      if (value === null || typeof value !== 'object') return value;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch {
        if (Array.isArray(value)) return [...value] as unknown as T;
        return { ...value };
      }
    };
  }

  // 2. requestIdleCallback polyfill for Safari < 16.4
  if (typeof (window as any).requestIdleCallback !== 'function') {
    (window as any).requestIdleCallback = function (
      cb: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void
    ) {
      const start = Date.now();
      return setTimeout(() => {
        cb({
          didTimeout: false,
          timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
        });
      }, 1);
    };
  }

  // 3. cancelIdleCallback polyfill for Safari < 16.4
  if (typeof (window as any).cancelIdleCallback !== 'function') {
    (window as any).cancelIdleCallback = function (id: any) {
      clearTimeout(id);
    };
  }
}

export {};
