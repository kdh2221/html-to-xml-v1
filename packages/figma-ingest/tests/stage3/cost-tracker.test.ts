import { describe, expect, it } from 'vitest';
import { CostTracker } from '../../src/stage3/cost-tracker';

describe('CostTracker', () => {
  it('record() 후 getTotal() 누적', () => {
    const tracker = new CostTracker();
    tracker.record({
      model: 'claude-sonnet-4-6',
      inputTokens: 1000,
      cachedInputTokens: 0,
      cacheCreationTokens: 0,
      outputTokens: 500,
    });
    // input: 1000 × $3/M = $0.003
    // output: 500 × $15/M = $0.0075
    // total: $0.0105
    expect(tracker.getTotal()).toBeCloseTo(0.0105, 4);
  });

  it('cached input + cache creation 가격 계산', () => {
    const tracker = new CostTracker();
    tracker.record({
      model: 'claude-sonnet-4-6',
      inputTokens: 0,
      cachedInputTokens: 10000,           // × $0.30/M = $0.003
      cacheCreationTokens: 5000,           // × $3.75/M = $0.01875
      outputTokens: 100,                   // × $15/M = $0.0015
    });
    expect(tracker.getTotal()).toBeCloseTo(0.003 + 0.01875 + 0.0015, 4);
  });

  it('checkConversionThreshold() 단일 conversion 임계값 초과 시 warn', () => {
    const tracker = new CostTracker({ perConversionWarnUsd: 0.01 });
    tracker.record({
      model: 'claude-sonnet-4-6',
      inputTokens: 10000, cachedInputTokens: 0, cacheCreationTokens: 0,
      outputTokens: 5000,
    });
    // total = $0.03 + $0.075 = $0.105 > $0.01
    expect(tracker.checkConversionThreshold()).toBe('warn');
  });

  it('세션 누적 상한 초과 시 throw', () => {
    const tracker = new CostTracker({ sessionCapUsd: 0.005 });
    tracker.record({
      model: 'claude-sonnet-4-6',
      inputTokens: 10000, cachedInputTokens: 0, cacheCreationTokens: 0,
      outputTokens: 5000,
    });
    expect(() => tracker.checkSessionCap()).toThrow(/세션 누적/);
  });

  it('알 수 없는 model → throw', () => {
    const tracker = new CostTracker();
    expect(() => tracker.record({
      model: 'gpt-4',
      inputTokens: 100, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 100,
    })).toThrow(/Unknown model/);
  });

  it('getEntries() 모든 entry 시간순 반환', () => {
    const tracker = new CostTracker();
    tracker.record({
      model: 'claude-sonnet-4-6',
      inputTokens: 100, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 50,
    });
    tracker.record({
      model: 'claude-sonnet-4-6',
      inputTokens: 200, cachedInputTokens: 0, cacheCreationTokens: 0, outputTokens: 100,
    });
    const entries = tracker.getEntries();
    expect(entries.length).toBe(2);
    expect(entries[0].timestamp).toBeLessThanOrEqual(entries[1].timestamp);
  });
});
