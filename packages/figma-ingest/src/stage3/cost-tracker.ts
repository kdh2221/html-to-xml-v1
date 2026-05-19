/**
 * 토큰 사용량 + USD 비용 추적. 임계값 가드 포함.
 */
import { getPricing } from './pricing';
import type { UsageEntry } from '../types';

export interface RecordInput {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationTokens: number;
  outputTokens: number;
}

export interface CostTrackerOptions {
  perConversionWarnUsd?: number;   // 기본 $1.00
  sessionCapUsd?: number;          // 기본 $10.00
}

const DEFAULT_PER_CONVERSION_WARN = 1.00;
const DEFAULT_SESSION_CAP = 10.00;

export class CostTracker {
  private entries: UsageEntry[] = [];
  private perConversionWarnUsd: number;
  private sessionCapUsd: number;

  constructor(options: CostTrackerOptions = {}) {
    this.perConversionWarnUsd = options.perConversionWarnUsd ?? DEFAULT_PER_CONVERSION_WARN;
    this.sessionCapUsd = options.sessionCapUsd ?? DEFAULT_SESSION_CAP;
  }

  record(input: RecordInput): UsageEntry {
    const pricing = getPricing(input.model);
    const costUsd =
      (input.inputTokens / 1_000_000) * pricing.inputPerMillion +
      (input.cachedInputTokens / 1_000_000) * pricing.cachedInputPerMillion +
      (input.cacheCreationTokens / 1_000_000) * pricing.cacheCreationPerMillion +
      (input.outputTokens / 1_000_000) * pricing.outputPerMillion;

    const entry: UsageEntry = {
      timestamp: Date.now(),
      model: input.model,
      inputTokens: input.inputTokens,
      cachedInputTokens: input.cachedInputTokens,
      cacheCreationTokens: input.cacheCreationTokens,
      outputTokens: input.outputTokens,
      costUsd,
    };
    this.entries.push(entry);
    return entry;
  }

  getTotal(): number {
    return this.entries.reduce((sum, e) => sum + e.costUsd, 0);
  }

  getEntries(): readonly UsageEntry[] {
    return this.entries;
  }

  /** 가장 최근 record의 비용이 conversion 경고 임계값 초과? */
  checkConversionThreshold(): 'ok' | 'warn' {
    const last = this.entries[this.entries.length - 1];
    if (!last) return 'ok';
    return last.costUsd >= this.perConversionWarnUsd ? 'warn' : 'ok';
  }

  /** 세션 누적이 상한을 초과하면 throw. */
  checkSessionCap(): void {
    const total = this.getTotal();
    if (total >= this.sessionCapUsd) {
      throw new Error(
        `세션 누적 LLM 비용 ${total.toFixed(4)} USD가 상한 ${this.sessionCapUsd.toFixed(2)} USD를 초과. ` +
        `환경변수 LLM_COST_CAP_USD로 상한 조정 가능.`
      );
    }
  }
}
