/**
 * lib/outbox/adapters/mock-adapter.ts
 * Mock Provider Adapter for unit testing.
 *
 * Supports two modes:
 *   1. Always succeed (default)
 *   2. Fail until a given attempt number, then succeed
 *
 * Usage:
 *   const adapter = new MockProviderAdapter({ shouldFail: true, failUntilAttempt: 3 });
 */

import type { IProviderAdapter, OutboxMessage, SendResult } from '../types';

export interface MockAdapterOptions {
  /**
   * If true, all sends will fail. Combine with `failUntilAttempt` for partial failure.
   */
  shouldFail?: boolean;
  /**
   * If set, adapter will fail for the first N calls, then succeed.
   * Takes priority over `shouldFail` once the count is exceeded.
   */
  failUntilAttempt?: number;
  /**
   * Custom error message to return on failure.
   * @default 'Mock provider failure'
   */
  errorMessage?: string;
}

export class MockProviderAdapter implements IProviderAdapter {
  private callCount = 0;
  private readonly shouldFail: boolean;
  private readonly failUntilAttempt: number | undefined;
  private readonly errorMessage: string;

  /** Public record of all sent messages for test assertion */
  public readonly sentMessages: OutboxMessage[] = [];
  /** Public record of all failed sends for test assertion */
  public readonly failedMessages: OutboxMessage[] = [];

  constructor(options: MockAdapterOptions = {}) {
    this.shouldFail = options.shouldFail ?? false;
    this.failUntilAttempt = options.failUntilAttempt;
    this.errorMessage = options.errorMessage ?? 'Mock provider failure';
  }

  async send(message: OutboxMessage): Promise<SendResult> {
    this.callCount++;

    const isFailing = this.failUntilAttempt !== undefined
      ? this.callCount <= this.failUntilAttempt
      : this.shouldFail;

    if (isFailing) {
      this.failedMessages.push(message);
      return { success: false, error: this.errorMessage };
    }

    this.sentMessages.push(message);
    return {
      success: true,
      messageId: `mock-msg-${message.id}-${this.callCount}`,
    };
  }

  /** Reset call counter (useful for multi-run test scenarios) */
  reset() {
    this.callCount = 0;
    this.sentMessages.length = 0;
    this.failedMessages.length = 0;
  }

  get totalCalls() {
    return this.callCount;
  }
}
