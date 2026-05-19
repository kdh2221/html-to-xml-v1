/**
 * 테스트용 LLM 클라이언트 mock.
 * 사전 녹화된 응답을 매칭 키로 반환한다. 비결정적인 진짜 LLM 대체.
 */
import type { DataCollectionIR } from '../types';

export interface InferOptions {
  matchKey?: string;
}

export interface CallLogEntry {
  xml: string;
  options: InferOptions;
  timestamp: number;
}

export interface LLMClientLike {
  inferDataCollection(xml: string, options?: InferOptions): Promise<DataCollectionIR>;
}

export class MockLLMClient implements LLMClientLike {
  private responses = new Map<string, DataCollectionIR>();
  private callLog: CallLogEntry[] = [];
  private lastRecordedKey: string | null = null;

  recordResponse(key: string, response: DataCollectionIR): void {
    this.responses.set(key, response);
    this.lastRecordedKey = key;
  }

  async inferDataCollection(xml: string, options: InferOptions = {}): Promise<DataCollectionIR> {
    this.callLog.push({ xml, options, timestamp: Date.now() });

    const key = options.matchKey ?? this.lastRecordedKey;
    if (!key) {
      throw new Error('MockLLMClient: no recorded response (call recordResponse first)');
    }
    const response = this.responses.get(key);
    if (!response) {
      throw new Error(`MockLLMClient: no recorded response for key "${key}"`);
    }
    return response;
  }

  getCallLog(): readonly CallLogEntry[] {
    return this.callLog;
  }
}
