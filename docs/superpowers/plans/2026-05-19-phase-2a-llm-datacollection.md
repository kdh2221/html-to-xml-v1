# Phase 2A: LLM Semantic Enricher (DataCollection 추론) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage 3 (LLM Semantic Enricher)을 파이프라인에 도입해서, 출력 XML의 `<w2:dataCollection>`이 자동으로 `<w2:dataMap>` / `<w2:dataList>`로 채워지도록 한다. ref 바인딩과 Submission은 후속 Plan 2B에서.

**Architecture:** Stage 2와 Phase 1 rules 사이에 Stage 3 삽입. LLM은 Anthropic Claude Sonnet 4.6 + forced tool use + 프롬프트 캐싱. 모든 테스트는 `MockLLMClient` 주입으로 결정론적. `--no-llm` 플래그로 escape hatch 제공.

**Tech Stack:** `@anthropic-ai/sdk@^0.27`, `zod@^3.23`, Vitest + Mock LLM, TypeScript strict mode.

**Spec reference:** [`docs/superpowers/specs/2026-05-19-phase-2a-llm-datacollection-design.md`](../specs/2026-05-19-phase-2a-llm-datacollection-design.md)

---

## File Structure (이 플랜에서 생성·수정되는 파일 전체)

```
kdh-proj-0513-1/
├── packages/figma-ingest/
│   ├── package.json                                  # MODIFIED — anthropic-ai/sdk + zod 추가
│   ├── src/
│   │   ├── types.ts                                  # MODIFIED — Phase2 IR 타입 추가
│   │   ├── pipeline.ts                               # MODIFIED — Stage 3 삽입
│   │   ├── cli.ts                                    # MODIFIED — --no-llm 플래그
│   │   └── stage3/                                   # NEW 디렉터리
│   │       ├── pricing.ts                            # NEW — 모델별 가격표
│   │       ├── cost-tracker.ts                       # NEW
│   │       ├── ir-schema.ts                          # NEW — Zod 스키마
│   │       ├── llm-mock.ts                           # NEW — MockLLMClient
│   │       ├── xml-region-parser.ts                  # NEW
│   │       ├── prompt-builder.ts                     # NEW
│   │       ├── llm-client.ts                         # NEW — Anthropic SDK 래퍼
│   │       ├── xml-injector.ts                       # NEW
│   │       └── data-collection-inferrer.ts           # NEW — Stage 3 orchestrator
│   ├── tests/
│   │   ├── fixtures/
│   │   │   └── llm-responses/                        # NEW — 3개 mock 응답
│   │   │       ├── simple-form.json
│   │   │       ├── search-grid.json
│   │   │       └── master-detail.json
│   │   ├── stage3/                                   # NEW 디렉터리
│   │   │   ├── cost-tracker.test.ts
│   │   │   ├── ir-schema.test.ts
│   │   │   ├── llm-mock.test.ts
│   │   │   ├── xml-region-parser.test.ts
│   │   │   ├── prompt-builder.test.ts
│   │   │   ├── llm-client.test.ts
│   │   │   ├── xml-injector.test.ts
│   │   │   └── data-collection-inferrer.test.ts
│   │   ├── pipeline.e2e.test.ts                      # MODIFIED — Stage 3 통합 검증
│   │   └── golden/                                   # MODIFIED — DataCollection 포함된 expected XML
│   │       ├── simple-form.expected.xml
│   │       ├── search-grid.expected.xml
│   │       └── master-detail.expected.xml
```

---

### Task 1: 의존성 설치 + Phase2 IR 타입 추가

**Files:**
- Modify: `packages/figma-ingest/package.json` — dependencies에 anthropic-ai/sdk + zod 추가
- Modify: `packages/figma-ingest/src/types.ts` — IR 타입 추가

- [ ] **Step 1: 의존성 추가**

Edit `packages/figma-ingest/package.json` — `dependencies` 블록에 추가:

```json
"@anthropic-ai/sdk": "^0.27.0",
"zod": "^3.23.0"
```

전체 dependencies 블록은 이렇게 되어야 함:
```json
"dependencies": {
  "@anthropic-ai/sdk": "^0.27.0",
  "@kdh/legacy-converter": "workspace:*",
  "cheerio": "^1.0.0",
  "puppeteer": "^22.0.0",
  "zod": "^3.23.0"
}
```

- [ ] **Step 2: 설치 실행**

Run: `corepack pnpm install`
Expected: `+ @anthropic-ai/sdk` + `+ zod`. 에러 없음.

- [ ] **Step 3: types.ts에 IR 타입 추가**

Append to `packages/figma-ingest/src/types.ts`:

```typescript
// ─── Phase 2A: LLM Semantic Enricher IR 타입 ─────────────────────────────

export interface DataMapKeyIR {
  id: string;         // UPPER_SNAKE, e.g., "EMP_CD"
  name: string;       // 한글 라벨, e.g., "사번"
  dataType: 'text' | 'number' | 'date';
}

export interface DataMapIR {
  id: string;         // ^dma_
  name: string;
  keys: DataMapKeyIR[];
}

export interface DataListColumnIR {
  id: string;         // UPPER_SNAKE | 'chk'
  name: string;
  dataType: 'text' | 'number' | 'date';
}

export interface DataListIR {
  id: string;         // ^dlt_
  name: string;
  saveRemovedData?: boolean;
  columns: DataListColumnIR[];
}

export interface DataCollectionIR {
  dataMaps: DataMapIR[];
  dataLists: DataListIR[];
  confidence: number;
  notes?: string;
}

export interface UsageEntry {
  timestamp: number;
  model: string;
  inputTokens: number;          // 캐시 미스 부분
  cachedInputTokens: number;    // 캐시 히트 부분
  cacheCreationTokens: number;  // 캐시 첫 작성 시 (입력가 + 25%)
  outputTokens: number;
  costUsd: number;
}
```

- [ ] **Step 4: 빌드 검증**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
Expected: tsc 클린, dist/ 갱신.

- [ ] **Step 5: 기존 테스트 회귀 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 74/74 PASS (변동 없음).

- [ ] **Step 6: 커밋**

```bash
git add packages/figma-ingest/package.json packages/figma-ingest/src/types.ts pnpm-lock.yaml
git commit -m "feat(phase-2a): add @anthropic-ai/sdk + zod, Phase2 IR types

- DataMapIR, DataListIR, DataCollectionIR 타입 정의
- UsageEntry 타입 (cost-tracker용)
- 74/74 기존 테스트 회귀 통과"
```

---

### Task 2: pricing 상수 + Zod IR 스키마

**Files:**
- Create: `packages/figma-ingest/src/stage3/pricing.ts`
- Create: `packages/figma-ingest/src/stage3/ir-schema.ts`
- Create: `packages/figma-ingest/tests/stage3/ir-schema.test.ts`

- [ ] **Step 1: pricing.ts 작성**

Create `packages/figma-ingest/src/stage3/pricing.ts`:

```typescript
/**
 * 모델별 가격표 (USD per million tokens).
 * 2026-05 기준 Anthropic 공시 가격. 출처: https://docs.anthropic.com/pricing
 */

export interface ModelPricing {
  inputPerMillion: number;
  cachedInputPerMillion: number;       // 캐시 read
  cacheCreationPerMillion: number;     // 캐시 첫 write (25% premium)
  outputPerMillion: number;
}

export const PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': {
    inputPerMillion: 3.00,
    cachedInputPerMillion: 0.30,
    cacheCreationPerMillion: 3.75,
    outputPerMillion: 15.00,
  },
  'claude-opus-4-7': {
    inputPerMillion: 15.00,
    cachedInputPerMillion: 1.50,
    cacheCreationPerMillion: 18.75,
    outputPerMillion: 75.00,
  },
};

export function getPricing(model: string): ModelPricing {
  const p = PRICING[model];
  if (!p) {
    throw new Error(`Unknown model "${model}". Available: ${Object.keys(PRICING).join(', ')}`);
  }
  return p;
}
```

- [ ] **Step 2: 실패 테스트 작성 (ir-schema)**

Create `packages/figma-ingest/tests/stage3/ir-schema.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { dataCollectionSchema, validateDataCollection } from '../../src/stage3/ir-schema';

describe('dataCollectionSchema (Zod)', () => {
  it('유효한 DataCollection 통과', () => {
    const valid = {
      dataMaps: [{
        id: 'dma_search',
        name: '검색조건',
        keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }],
      }],
      dataLists: [{
        id: 'dlt_list',
        name: '사원목록',
        columns: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }],
      }],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(valid)).not.toThrow();
  });

  it('dma_ prefix 누락 → 거부', () => {
    const invalid = {
      dataMaps: [{ id: 'search', name: 'X', keys: [{ id: 'X', name: 'X', dataType: 'text' }] }],
      dataLists: [],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(invalid)).toThrow(/dma_/);
  });

  it('dlt_ prefix 누락 → 거부', () => {
    const invalid = {
      dataMaps: [],
      dataLists: [{ id: 'list', name: 'X', columns: [{ id: 'X', name: 'X', dataType: 'text' }] }],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(invalid)).toThrow(/dlt_/);
  });

  it('소문자 key id → 거부 (UPPER_SNAKE만 허용)', () => {
    const invalid = {
      dataMaps: [{ id: 'dma_search', name: 'X',
        keys: [{ id: 'empCd', name: 'X', dataType: 'text' }] }],
      dataLists: [],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(invalid)).toThrow();
  });

  it('chk는 column id로 허용', () => {
    const valid = {
      dataMaps: [],
      dataLists: [{ id: 'dlt_list', name: 'X',
        columns: [{ id: 'chk', name: '선택', dataType: 'text' }] }],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(valid)).not.toThrow();
  });

  it('dataType 다른 값 → 거부', () => {
    const invalid = {
      dataMaps: [{ id: 'dma_search', name: 'X',
        keys: [{ id: 'EMP_CD', name: 'X', dataType: 'string' }] }],
      dataLists: [],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(invalid)).toThrow();
  });

  it('confidence 범위 벗어남 → 거부', () => {
    const invalid = {
      dataMaps: [],
      dataLists: [],
      confidence: 1.5,
    };
    expect(() => validateDataCollection(invalid)).toThrow();
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test ir-schema`
Expected: FAIL (`Cannot find module '../../src/stage3/ir-schema'`)

- [ ] **Step 4: ir-schema.ts 구현**

Create `packages/figma-ingest/src/stage3/ir-schema.ts`:

```typescript
/**
 * Zod 스키마: LLM이 tool use로 제출한 DataCollection 응답을 런타임 검증한다.
 * Anthropic의 schema enforcement + 이 Zod 검증 = 이중 안전망.
 */
import { z } from 'zod';
import type { DataCollectionIR } from '../types';

const UPPER_SNAKE = /^[A-Z][A-Z0-9_]*$/;
const COLUMN_ID = /^([A-Z][A-Z0-9_]*|chk)$/;

const dataTypeSchema = z.enum(['text', 'number', 'date']);

const dataMapKeySchema = z.object({
  id: z.string().regex(UPPER_SNAKE, 'key.id는 UPPER_SNAKE_CASE여야 함'),
  name: z.string().min(1),
  dataType: dataTypeSchema,
});

const dataMapSchema = z.object({
  id: z.string().regex(/^dma_[a-zA-Z0-9_]+$/, 'DataMap.id는 dma_ prefix가 있어야 함'),
  name: z.string().min(1),
  keys: z.array(dataMapKeySchema),
});

const dataListColumnSchema = z.object({
  id: z.string().regex(COLUMN_ID, 'column.id는 UPPER_SNAKE 또는 "chk"여야 함'),
  name: z.string().min(1),
  dataType: dataTypeSchema,
});

const dataListSchema = z.object({
  id: z.string().regex(/^dlt_[a-zA-Z0-9_]+$/, 'DataList.id는 dlt_ prefix가 있어야 함'),
  name: z.string().min(1),
  saveRemovedData: z.boolean().optional(),
  columns: z.array(dataListColumnSchema),
});

export const dataCollectionSchema = z.object({
  dataMaps: z.array(dataMapSchema),
  dataLists: z.array(dataListSchema),
  confidence: z.number().min(0).max(1),
  notes: z.string().optional(),
});

export function validateDataCollection(raw: unknown): DataCollectionIR {
  return dataCollectionSchema.parse(raw);
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test ir-schema`
Expected: 7개 테스트 PASS.

- [ ] **Step 6: 커밋**

```bash
git add packages/figma-ingest/src/stage3/pricing.ts \
        packages/figma-ingest/src/stage3/ir-schema.ts \
        packages/figma-ingest/tests/stage3/ir-schema.test.ts
git commit -m "feat(phase-2a): pricing 상수 + Zod IR schema

- pricing.ts: claude-sonnet-4-6 / claude-opus-4-7 가격표
- ir-schema.ts: DataMap/DataList prefix + UPPER_SNAKE + dataType enum 검증
- 7개 테스트 PASS"
```

---

### Task 3: cost-tracker.ts

**Files:**
- Create: `packages/figma-ingest/src/stage3/cost-tracker.ts`
- Create: `packages/figma-ingest/tests/stage3/cost-tracker.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/cost-tracker.test.ts`:

```typescript
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

  it('checkThreshold() 단일 conversion 임계값 초과 시 warn', () => {
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
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test cost-tracker`
Expected: FAIL

- [ ] **Step 3: cost-tracker.ts 구현**

Create `packages/figma-ingest/src/stage3/cost-tracker.ts`:

```typescript
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test cost-tracker`
Expected: 6개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/stage3/cost-tracker.ts \
        packages/figma-ingest/tests/stage3/cost-tracker.test.ts
git commit -m "feat(phase-2a): cost-tracker + 임계값 가드

- record(usage): 모델별 가격 적용 후 USD 누적
- checkConversionThreshold(): 단일 conversion 경고
- checkSessionCap(): 세션 상한 초과 시 throw
- 6개 테스트 PASS"
```

---

### Task 4: MockLLMClient (테스트 인프라 우선)

**Files:**
- Create: `packages/figma-ingest/src/stage3/llm-mock.ts`
- Create: `packages/figma-ingest/tests/stage3/llm-mock.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/llm-mock.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { MockLLMClient } from '../../src/stage3/llm-mock';
import type { DataCollectionIR } from '../../src/types';

const sampleIR: DataCollectionIR = {
  dataMaps: [{ id: 'dma_search', name: '검색',
    keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }] }],
  dataLists: [],
  confidence: 0.85,
};

describe('MockLLMClient', () => {
  it('recordResponse() 후 inferDataCollection() 매칭', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('TEST_KEY', sampleIR);
    const result = await mock.inferDataCollection('xml', { matchKey: 'TEST_KEY' });
    expect(result).toEqual(sampleIR);
  });

  it('매칭되는 응답 없으면 throw', async () => {
    const mock = new MockLLMClient();
    await expect(mock.inferDataCollection('xml', { matchKey: 'NONE' }))
      .rejects.toThrow(/no recorded response/i);
  });

  it('matchKey 미지정 시 마지막 record로 fallback', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('A', { ...sampleIR, confidence: 0.1 });
    mock.recordResponse('B', { ...sampleIR, confidence: 0.99 });
    const result = await mock.inferDataCollection('xml');
    expect(result.confidence).toBe(0.99);
  });

  it('getCallLog() 호출 기록', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('K', sampleIR);
    await mock.inferDataCollection('xml1', { matchKey: 'K' });
    await mock.inferDataCollection('xml2', { matchKey: 'K' });
    const log = mock.getCallLog();
    expect(log.length).toBe(2);
    expect(log[0].xml).toBe('xml1');
    expect(log[1].xml).toBe('xml2');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test llm-mock`
Expected: FAIL

- [ ] **Step 3: llm-mock.ts 구현**

Create `packages/figma-ingest/src/stage3/llm-mock.ts`:

```typescript
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test llm-mock`
Expected: 4개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/stage3/llm-mock.ts \
        packages/figma-ingest/tests/stage3/llm-mock.test.ts
git commit -m "feat(phase-2a): MockLLMClient — 테스트용 결정론적 LLM mock

- recordResponse(key, response) 사전 녹화
- inferDataCollection(xml, options): matchKey로 응답 매칭
- LLMClientLike 인터페이스 (실제 LLMClient도 같은 shape)
- getCallLog() — 호출 추적
- 4개 테스트 PASS"
```

---

### Task 5: xml-region-parser

**Files:**
- Create: `packages/figma-ingest/src/stage3/xml-region-parser.ts`
- Create: `packages/figma-ingest/tests/stage3/xml-region-parser.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/xml-region-parser.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { extractRegions } from '../../src/stage3/xml-region-parser';

const SCHBOX_XML = `
<xf:group class="schbox">
  <xf:group class="schbox_inner" id="tbl_search">
    <xf:group class="w2tb tbl" tagname="table">
      <xf:group tagname="tr">
        <xf:group class="w2tb_th" tagname="th"><w2:textbox label="사번"/></xf:group>
        <xf:group class="w2tb_td" tagname="td"><xf:input id="ibx_empCd"/></xf:group>
        <xf:group class="w2tb_th" tagname="th"><w2:textbox label="부서"/></xf:group>
        <xf:group class="w2tb_td" tagname="td"><xf:select1 id="sbx_deptCd"/></xf:group>
      </xf:group>
    </xf:group>
  </xf:group>
</xf:group>
`;

const GVWBOX_XML = `
<xf:group class="gvwbox">
  <w2:gridView id="grd_list">
    <w2:header id="header1"><w2:row>
      <w2:column id="column1" inputType="text" value="사번"/>
      <w2:column id="column2" inputType="text" value="성명"/>
      <w2:column id="column3" inputType="text" value="부서명"/>
    </w2:row></w2:header>
    <w2:gBody id="gBody1"><w2:row>
      <w2:column id="EMP_CD" inputType="text"/>
      <w2:column id="EMP_NM" inputType="text"/>
      <w2:column id="DEPT_NM" inputType="text"/>
    </w2:row></w2:gBody>
  </w2:gridView>
</xf:group>
`;

describe('extractRegions', () => {
  it('schbox 영역에서 라벨 추출', () => {
    const xml = `<root>${SCHBOX_XML}</root>`;
    const regions = extractRegions(xml);
    const sch = regions.find(r => r.kind === 'schbox');
    expect(sch).toBeDefined();
    expect(sch!.labels).toEqual(['사번', '부서']);
  });

  it('gvwbox 영역에서 컬럼 정보 추출', () => {
    const xml = `<root>${GVWBOX_XML}</root>`;
    const regions = extractRegions(xml);
    const gvw = regions.find(r => r.kind === 'gvwbox');
    expect(gvw).toBeDefined();
    expect(gvw!.columns).toEqual([
      { label: '사번', bodyId: 'EMP_CD' },
      { label: '성명', bodyId: 'EMP_NM' },
      { label: '부서명', bodyId: 'DEPT_NM' },
    ]);
  });

  it('schbox + gvwbox 모두 있는 XML → 2개 region', () => {
    const xml = `<root>${SCHBOX_XML}${GVWBOX_XML}</root>`;
    const regions = extractRegions(xml);
    expect(regions.length).toBe(2);
    expect(regions.map(r => r.kind).sort()).toEqual(['gvwbox', 'schbox']);
  });

  it('region 없는 XML → 빈 배열', () => {
    const xml = `<root><xf:group class="tblbox"><xf:input id="x"/></xf:group></root>`;
    expect(extractRegions(xml)).toEqual([]);
  });

  it('screenName meta 추출', () => {
    const xml = `<root><head meta_screenName="사원 조회"/>${SCHBOX_XML}</root>`;
    const regions = extractRegions(xml);
    expect(regions[0].screenName).toBe('사원 조회');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test xml-region-parser`
Expected: FAIL

- [ ] **Step 3: xml-region-parser.ts 구현**

Create `packages/figma-ingest/src/stage3/xml-region-parser.ts`:

```typescript
/**
 * Stage 2 출력 XML에서 schbox/gvwbox region을 추출한다.
 * LLM에게 전달할 입력 데이터를 좁힌다 (페이지 전체 대신 region만).
 */
import * as cheerio from 'cheerio';

export interface SchboxRegion {
  kind: 'schbox';
  labels: string[];
  innerXml: string;
  screenName?: string;
}

export interface GvwboxRegion {
  kind: 'gvwbox';
  columns: Array<{ label: string; bodyId: string }>;
  innerXml: string;
  screenName?: string;
}

export type Region = SchboxRegion | GvwboxRegion;

export function extractRegions(xml: string): Region[] {
  const $ = cheerio.load(xml, { xmlMode: true });

  const head = $('head').first();
  const screenName = head.attr('meta_screenName') || undefined;

  const regions: Region[] = [];

  $('[class*="schbox"]').each((_, el) => {
    const $el = $(el);
    // class="schbox" 정확히 매칭 (schbox_inner 같은 변형 제외)
    const cls = ($el.attr('class') || '').split(/\s+/);
    if (!cls.includes('schbox')) return;

    const labels: string[] = [];
    $el.find('w2\\:textbox[label]').each((_, tb) => {
      const lbl = $(tb).attr('label');
      if (lbl) labels.push(lbl);
    });

    regions.push({
      kind: 'schbox',
      labels,
      innerXml: $.xml($el),
      screenName,
    });
  });

  $('[class*="gvwbox"]').each((_, el) => {
    const $el = $(el);
    const cls = ($el.attr('class') || '').split(/\s+/);
    if (!cls.includes('gvwbox')) return;

    const columns: Array<{ label: string; bodyId: string }> = [];
    const headerCols = $el.find('w2\\:header w2\\:column');
    const bodyCols = $el.find('w2\\:gBody w2\\:column');

    const len = Math.min(headerCols.length, bodyCols.length);
    for (let i = 0; i < len; i++) {
      const label = $(headerCols[i]).attr('value') || '';
      const bodyId = $(bodyCols[i]).attr('id') || '';
      columns.push({ label, bodyId });
    }

    regions.push({
      kind: 'gvwbox',
      columns,
      innerXml: $.xml($el),
      screenName,
    });
  });

  return regions;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test xml-region-parser`
Expected: 5개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/stage3/xml-region-parser.ts \
        packages/figma-ingest/tests/stage3/xml-region-parser.test.ts
git commit -m "feat(phase-2a): xml-region-parser — schbox/gvwbox 영역 추출

- schbox: 라벨 목록 수집 (w2:textbox label 속성)
- gvwbox: header label + gBody id 페어 수집
- screenName meta 동봉
- 5개 테스트 PASS"
```

---

### Task 6: prompt-builder

**Files:**
- Create: `packages/figma-ingest/src/stage3/prompt-builder.ts`
- Create: `packages/figma-ingest/tests/stage3/prompt-builder.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/prompt-builder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { buildPrompt, submitDataCollectionTool } from '../../src/stage3/prompt-builder';
import type { Region } from '../../src/stage3/xml-region-parser';

const regions: Region[] = [
  {
    kind: 'schbox',
    labels: ['사번', '부서'],
    innerXml: '<xf:group class="schbox">...</xf:group>',
    screenName: '사원 조회',
  },
  {
    kind: 'gvwbox',
    columns: [
      { label: '사번', bodyId: 'EMP_CD' },
      { label: '성명', bodyId: 'EMP_NM' },
    ],
    innerXml: '<xf:group class="gvwbox">...</xf:group>',
    screenName: '사원 조회',
  },
];

describe('buildPrompt', () => {
  it('system prompt에 deepsquare 지침 포함', () => {
    const p = buildPrompt(regions);
    const sysText = p.system.map(b => b.text).join('\n');
    expect(sysText).toContain('UI-01');     // ID prefix 규칙
    expect(sysText).toContain('dma_');
    expect(sysText).toContain('dlt_');
    expect(sysText).toContain('UPPER_SNAKE');
  });

  it('system 블록에 cache_control 설정', () => {
    const p = buildPrompt(regions);
    expect(p.system[0].cache_control).toEqual({ type: 'ephemeral' });
  });

  it('user prompt에 region 정보 포함', () => {
    const p = buildPrompt(regions);
    expect(p.user).toContain('사번');
    expect(p.user).toContain('부서');
    expect(p.user).toContain('EMP_CD');
    expect(p.user).toContain('사원 조회');
  });

  it('tools에 submit_data_collection 1개', () => {
    const p = buildPrompt(regions);
    expect(p.tools.length).toBe(1);
    expect(p.tools[0].name).toBe('submit_data_collection');
  });

  it('region 없는 경우 → user prompt는 비어있지 않음 (LLM에게 빈 결과 요청)', () => {
    const p = buildPrompt([]);
    expect(p.user.length).toBeGreaterThan(0);
  });

  it('submitDataCollectionTool 도구 스키마 검증', () => {
    const tool = submitDataCollectionTool;
    expect(tool.input_schema.required).toContain('dataMaps');
    expect(tool.input_schema.required).toContain('dataLists');
    expect(tool.input_schema.required).toContain('confidence');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test prompt-builder`
Expected: FAIL

- [ ] **Step 3: prompt-builder.ts 구현**

Create `packages/figma-ingest/src/stage3/prompt-builder.ts`:

```typescript
/**
 * LLM에게 보낼 프롬프트와 tool 정의를 조립한다.
 * 시스템 프롬프트는 deepsquare 지침 — 프롬프트 캐싱 대상.
 */
import type { Region } from './xml-region-parser';

export const submitDataCollectionTool = {
  name: 'submit_data_collection',
  description: '입력된 화면 XML 영역을 분석해서 적합한 WebSquare DataCollection (DataMap + DataList)을 제출한다',
  input_schema: {
    type: 'object',
    properties: {
      dataMaps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^dma_[a-zA-Z0-9_]+$' },
            name: { type: 'string', description: 'DataMap의 한글 의미 — 예: "검색조건"' },
            keys: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', pattern: '^[A-Z][A-Z0-9_]*$', description: 'UPPER_SNAKE_CASE' },
                  name: { type: 'string', description: '한글 라벨 — 예: "사번"' },
                  dataType: { type: 'string', enum: ['text', 'number', 'date'] },
                },
                required: ['id', 'name', 'dataType'],
              },
            },
          },
          required: ['id', 'name', 'keys'],
        },
      },
      dataLists: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', pattern: '^dlt_[a-zA-Z0-9_]+$' },
            name: { type: 'string' },
            saveRemovedData: { type: 'boolean' },
            columns: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', pattern: '^([A-Z][A-Z0-9_]*|chk)$' },
                  name: { type: 'string' },
                  dataType: { type: 'string', enum: ['text', 'number', 'date'] },
                },
                required: ['id', 'name', 'dataType'],
              },
            },
          },
          required: ['id', 'name', 'columns'],
        },
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      notes: { type: 'string', description: '추론 근거 — 디버그용, 1~2문장' },
    },
    required: ['dataMaps', 'dataLists', 'confidence'],
  },
} as const;

export interface SystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

export interface BuiltPrompt {
  system: SystemBlock[];
  user: string;
  tools: typeof submitDataCollectionTool[];
}

const SYSTEM_INSTRUCTIONS = `당신은 WebSquare 화면 XML을 분석해서 적절한 DataCollection(DataMap + DataList)을 추론하는 전문가입니다.

## 출력 규칙 (deepsquare CodeRules 기반)

### DataMap (검색조건 등 단일 객체 컨테이너)
- ID는 \`dma_\` prefix + 의미 식별자 (예: \`dma_search\`, \`dma_detail\`)
- name은 한글 의미명 (예: "검색조건", "상세 정보")
- keys[].id는 UPPER_SNAKE_CASE (예: \`EMP_CD\`, \`DEPT_CD\`)
- keys[].name은 한글 라벨 — UI에 표시되는 라벨에서 가져옴
- keys[].dataType은 \`text\` | \`number\` | \`date\` 중 하나. 라벨에 "코드"/"명" 있으면 text, "금액"/"건수" 있으면 number, "일자"/"날짜" 있으면 date

### DataList (그리드 데이터 컨테이너)
- ID는 \`dlt_\` prefix + 의미 식별자 (예: \`dlt_list\`, \`dlt_memberBasic\`)
- name은 한글 의미명
- columns[].id는 UPPER_SNAKE_CASE 또는 \`chk\` (선택 체크박스 컬럼)
- columns는 그리드 header label과 body column ID에서 가져옴 — body의 id 그대로 column.id로 사용

## 명명 규칙 (UI-01)
- ID prefix는 반드시 \`dma_\` (DataMap), \`dlt_\` (DataList) 사용
- 키/컬럼 ID는 UPPER_SNAKE_CASE만 사용 (소문자 금지)
- \`saveRemovedData\`는 그리드가 수정 가능하면 true (기본 true)

## 작업 절차
1. 화면의 schbox 영역을 보고 → 검색조건 DataMap을 만든다
2. 화면의 gvwbox 영역을 보고 → DataList를 만든다
3. 확신도를 0~1로 반환 (라벨이 명확하면 높음, 추측이 많으면 낮음)
4. 반드시 \`submit_data_collection\` 도구를 호출해서 결과를 제출한다`;

export function buildPrompt(regions: Region[]): BuiltPrompt {
  const system: SystemBlock[] = [
    { type: 'text', text: SYSTEM_INSTRUCTIONS, cache_control: { type: 'ephemeral' } },
  ];

  const screenName = regions[0]?.screenName ?? '(미지정)';
  const parts: string[] = [`# 화면명: ${screenName}\n`];

  const schboxes = regions.filter(r => r.kind === 'schbox');
  const gvwboxes = regions.filter(r => r.kind === 'gvwbox');

  if (schboxes.length === 0 && gvwboxes.length === 0) {
    parts.push('## 영역\n현재 화면에 schbox나 gvwbox가 없습니다. 빈 DataCollection을 반환하세요 (dataMaps: [], dataLists: []).');
  } else {
    schboxes.forEach((r, i) => {
      if (r.kind !== 'schbox') return;
      parts.push(`\n## 검색조건 영역 ${i + 1} (schbox)`);
      parts.push(`라벨 목록: ${r.labels.join(', ')}`);
    });
    gvwboxes.forEach((r, i) => {
      if (r.kind !== 'gvwbox') return;
      parts.push(`\n## 그리드 영역 ${i + 1} (gvwbox)`);
      const colDesc = r.columns.map(c => `${c.label} (body id: ${c.bodyId})`).join(', ');
      parts.push(`컬럼: ${colDesc}`);
    });

    parts.push(`\n위 영역들을 바탕으로 적절한 DataMap/DataList를 만들어 \`submit_data_collection\` 도구를 호출하세요.`);
  }

  return {
    system,
    user: parts.join('\n'),
    tools: [submitDataCollectionTool],
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test prompt-builder`
Expected: 6개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/stage3/prompt-builder.ts \
        packages/figma-ingest/tests/stage3/prompt-builder.test.ts
git commit -m "feat(phase-2a): prompt-builder + submitDataCollection tool

- 시스템 프롬프트: deepsquare 규칙 (UI-01, dma_/dlt_, UPPER_SNAKE, dataType 추론)
- cache_control: ephemeral로 캐싱 대상 표시
- 유저 프롬프트: region 라벨/컬럼 + screen name 동봉
- submit_data_collection tool: JSON schema for forced tool use
- 6개 테스트 PASS"
```

---

### Task 7: llm-client (Anthropic SDK 래퍼)

**Files:**
- Create: `packages/figma-ingest/src/stage3/llm-client.ts`
- Create: `packages/figma-ingest/tests/stage3/llm-client.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/llm-client.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { LLMClient } from '../../src/stage3/llm-client';
import { CostTracker } from '../../src/stage3/cost-tracker';

function makeMockAnthropic(toolUseInput: any, usage = {
  input_tokens: 1000,
  cache_read_input_tokens: 5000,
  cache_creation_input_tokens: 0,
  output_tokens: 200,
}) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'tool_use', name: 'submit_data_collection', input: toolUseInput }],
        usage,
      }),
    },
  };
}

const sampleResponse = {
  dataMaps: [{ id: 'dma_search', name: '검색',
    keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }] }],
  dataLists: [],
  confidence: 0.9,
};

describe('LLMClient', () => {
  it('Anthropic API 호출 후 Zod 검증된 IR 반환', async () => {
    const anthropic = makeMockAnthropic(sampleResponse);
    const tracker = new CostTracker();
    const client = new LLMClient({ client: anthropic as any, tracker, model: 'claude-sonnet-4-6' });

    const result = await client.inferDataCollection('<root/>');
    expect(result.dataMaps[0].id).toBe('dma_search');
    expect(anthropic.messages.create).toHaveBeenCalledOnce();
  });

  it('cost-tracker에 usage 기록', async () => {
    const anthropic = makeMockAnthropic(sampleResponse);
    const tracker = new CostTracker();
    const client = new LLMClient({ client: anthropic as any, tracker, model: 'claude-sonnet-4-6' });

    await client.inferDataCollection('<root/>');
    const entries = tracker.getEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].inputTokens).toBe(1000);
    expect(entries[0].cachedInputTokens).toBe(5000);
    expect(entries[0].outputTokens).toBe(200);
  });

  it('tool_use 응답이 없으면 throw', async () => {
    const anthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'no tool used' }],
          usage: { input_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 10 },
        }),
      },
    };
    const tracker = new CostTracker();
    const client = new LLMClient({ client: anthropic as any, tracker, model: 'claude-sonnet-4-6' });

    await expect(client.inferDataCollection('<root/>')).rejects.toThrow(/tool_use/i);
  });

  it('Zod validation 실패 시 1회 재시도', async () => {
    const anthropic = {
      messages: {
        create: vi.fn()
          .mockResolvedValueOnce({
            content: [{ type: 'tool_use', name: 'submit_data_collection',
              input: { dataMaps: [{ id: 'search', name: 'X', keys: [] }], dataLists: [], confidence: 0.9 } }],
            usage: { input_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 100 },
          })
          .mockResolvedValueOnce({
            content: [{ type: 'tool_use', name: 'submit_data_collection', input: sampleResponse }],
            usage: { input_tokens: 1100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 100 },
          }),
      },
    };
    const tracker = new CostTracker();
    const client = new LLMClient({ client: anthropic as any, tracker, model: 'claude-sonnet-4-6' });

    const result = await client.inferDataCollection('<root/>');
    expect(result.dataMaps[0].id).toBe('dma_search');
    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
  });

  it('Zod validation 2회 연속 실패 시 throw', async () => {
    const badInput = { dataMaps: [{ id: 'search', name: 'X', keys: [] }], dataLists: [], confidence: 0.9 };
    const anthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'tool_use', name: 'submit_data_collection', input: badInput }],
          usage: { input_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 100 },
        }),
      },
    };
    const tracker = new CostTracker();
    const client = new LLMClient({ client: anthropic as any, tracker, model: 'claude-sonnet-4-6' });

    await expect(client.inferDataCollection('<root/>')).rejects.toThrow();
    expect(anthropic.messages.create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test llm-client`
Expected: FAIL

- [ ] **Step 3: llm-client.ts 구현**

Create `packages/figma-ingest/src/stage3/llm-client.ts`:

```typescript
/**
 * Anthropic Claude SDK 래퍼.
 *
 * - forced tool use (submit_data_collection)
 * - 시스템 프롬프트 캐싱
 * - Zod 검증 실패 시 1회 재시도 (구체적 에러 피드백 동봉)
 * - cost-tracker 기록
 */
import Anthropic from '@anthropic-ai/sdk';
import { validateDataCollection } from './ir-schema';
import { buildPrompt } from './prompt-builder';
import { extractRegions } from './xml-region-parser';
import { CostTracker } from './cost-tracker';
import type { DataCollectionIR } from '../types';
import type { LLMClientLike, InferOptions } from './llm-mock';

export interface LLMClientOptions {
  client?: Anthropic;                              // 주입 가능 (테스트용)
  tracker: CostTracker;
  model?: string;                                  // 기본 claude-sonnet-4-6
  apiKey?: string;                                 // 기본 process.env.ANTHROPIC_API_KEY
  maxTokens?: number;                              // 기본 2000
  maxRetries?: number;                             // 기본 1 (총 2회 호출)
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_MAX_RETRIES = 1;

export class LLMClient implements LLMClientLike {
  private readonly client: any;        // Anthropic 또는 mock
  private readonly tracker: CostTracker;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly maxRetries: number;

  constructor(options: LLMClientOptions) {
    this.tracker = options.tracker;
    this.model = options.model ?? DEFAULT_MODEL;
    this.maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

    if (options.client) {
      this.client = options.client;
    } else {
      const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'ANTHROPIC_API_KEY 환경변수가 없습니다. ' +
          '`--no-llm` 플래그로 LLM 단계 우회하거나 환경변수를 설정하세요.'
        );
      }
      this.client = new Anthropic({ apiKey });
    }
  }

  async inferDataCollection(xml: string, _options: InferOptions = {}): Promise<DataCollectionIR> {
    const regions = extractRegions(xml);
    const prompt = buildPrompt(regions);

    let lastError: unknown = null;
    let extraInstruction = '';

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const userMessage = extraInstruction
        ? `${prompt.user}\n\n## 이전 응답 검증 오류\n${extraInstruction}\n다시 시도하세요.`
        : prompt.user;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: 0,
        system: prompt.system as any,
        messages: [{ role: 'user', content: userMessage }],
        tools: prompt.tools as any,
        tool_choice: { type: 'tool', name: 'submit_data_collection' },
      });

      this.tracker.record({
        model: this.model,
        inputTokens: response.usage.input_tokens ?? 0,
        cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
      });
      this.tracker.checkSessionCap();

      const toolUse = response.content.find((c: any) => c.type === 'tool_use');
      if (!toolUse) {
        lastError = new Error('LLM 응답에 tool_use 블록이 없음');
        extraInstruction = '도구를 호출하지 않았습니다. 반드시 submit_data_collection 도구를 호출하세요.';
        continue;
      }

      try {
        return validateDataCollection(toolUse.input);
      } catch (zodErr) {
        lastError = zodErr;
        extraInstruction = `Zod 검증 실패: ${(zodErr as Error).message}`;
      }
    }

    throw new Error(
      `LLMClient: ${this.maxRetries + 1}회 시도 후에도 검증 실패. 마지막 오류: ${(lastError as Error).message}`
    );
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test llm-client`
Expected: 5개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/stage3/llm-client.ts \
        packages/figma-ingest/tests/stage3/llm-client.test.ts
git commit -m "feat(phase-2a): llm-client — Anthropic SDK 래퍼

- forced tool use (submit_data_collection)
- temperature=0 + cache_control 활용
- Zod 검증 실패 시 1회 재시도 (구체 에러 피드백)
- cost-tracker 자동 기록 + 세션 cap 체크
- API key 없으면 시작 시점에 throw
- 의존성 주입으로 테스트 가능 (5개 테스트 PASS)"
```

---

### Task 8: xml-injector

**Files:**
- Create: `packages/figma-ingest/src/stage3/xml-injector.ts`
- Create: `packages/figma-ingest/tests/stage3/xml-injector.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/xml-injector.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { injectDataCollection } from '../../src/stage3/xml-injector';
import type { DataCollectionIR } from '../../src/types';

const EMPTY_DC_XML = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:w2="http://www.inswave.com/websquare" xmlns:xf="http://www.w3.org/2002/xforms">
  <head>
    <xf:model>
      <w2:dataCollection>
      </w2:dataCollection>
    </xf:model>
  </head>
  <body><xf:group>test</xf:group></body>
</html>`;

const sampleIR: DataCollectionIR = {
  dataMaps: [{
    id: 'dma_search',
    name: '검색조건',
    keys: [
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'DEPT_CD', name: '부서 코드', dataType: 'text' },
    ],
  }],
  dataLists: [{
    id: 'dlt_list',
    name: '사원목록',
    saveRemovedData: true,
    columns: [
      { id: 'chk', name: '선택', dataType: 'text' },
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'EMP_NM', name: '성명', dataType: 'text' },
    ],
  }],
  confidence: 0.9,
};

describe('injectDataCollection', () => {
  it('빈 dataCollection에 DataMap + DataList 주입', () => {
    const out = injectDataCollection(EMPTY_DC_XML, sampleIR);
    expect(out).toContain('<w2:dataMap id="dma_search">');
    expect(out).toContain('<w2:key id="EMP_CD" name="사번" dataType="text"');
    expect(out).toContain('<w2:dataList id="dlt_list"');
    expect(out).toContain('saveRemovedData="true"');
    expect(out).toContain('<w2:column id="EMP_CD" name="사번" dataType="text"');
    expect(out).toContain('<w2:column id="chk" name="선택" dataType="text"');
  });

  it('dataMap에 baseNode="map" 부여', () => {
    const out = injectDataCollection(EMPTY_DC_XML, sampleIR);
    expect(out).toContain('baseNode="map"');
  });

  it('dataList에 baseNode="list" + repeatNode="map" 부여', () => {
    const out = injectDataCollection(EMPTY_DC_XML, sampleIR);
    expect(out).toMatch(/baseNode="list".*repeatNode="map"/s);
  });

  it('빈 IR (dataMaps/dataLists 모두 빈 배열) → dataCollection 빈 채로 유지', () => {
    const emptyIR: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 0 };
    const out = injectDataCollection(EMPTY_DC_XML, emptyIR);
    expect(out).not.toContain('<w2:dataMap');
    expect(out).not.toContain('<w2:dataList');
    expect(out).toContain('<w2:dataCollection>');  // 비어있지만 태그는 보존
  });

  it('XML 다른 부분은 변경되지 않음', () => {
    const out = injectDataCollection(EMPTY_DC_XML, sampleIR);
    expect(out).toContain('<body><xf:group>test</xf:group></body>');
    expect(out).toContain('<?xml version="1.0"?>');
  });

  it('이미 채워진 dataCollection이 있어도 덮어씀', () => {
    const filled = EMPTY_DC_XML.replace(
      '<w2:dataCollection>\n      </w2:dataCollection>',
      '<w2:dataCollection><w2:dataMap id="dma_old"/></w2:dataCollection>'
    );
    const out = injectDataCollection(filled, sampleIR);
    expect(out).not.toContain('dma_old');
    expect(out).toContain('dma_search');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test xml-injector`
Expected: FAIL

- [ ] **Step 3: xml-injector.ts 구현**

Create `packages/figma-ingest/src/stage3/xml-injector.ts`:

```typescript
/**
 * Inferred DataCollection IR을 XML의 <w2:dataCollection>...</w2:dataCollection>
 * 안에 주입한다. 다른 영역은 건드리지 않는다.
 */
import type {
  DataCollectionIR, DataMapIR, DataMapKeyIR, DataListIR, DataListColumnIR,
} from '../types';

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderKey(k: DataMapKeyIR): string {
  return `\t\t\t\t\t<w2:key id="${escapeXml(k.id)}" name="${escapeXml(k.name)}" dataType="${k.dataType}"/>`;
}

function renderDataMap(dm: DataMapIR): string {
  const keys = dm.keys.map(renderKey).join('\n');
  return [
    `\t\t\t<w2:dataMap id="${escapeXml(dm.id)}" baseNode="map">`,
    `\t\t\t\t<w2:keyInfo>`,
    keys,
    `\t\t\t\t</w2:keyInfo>`,
    `\t\t\t</w2:dataMap>`,
  ].join('\n');
}

function renderColumn(c: DataListColumnIR): string {
  return `\t\t\t\t\t<w2:column id="${escapeXml(c.id)}" name="${escapeXml(c.name)}" dataType="${c.dataType}"/>`;
}

function renderDataList(dl: DataListIR): string {
  const cols = dl.columns.map(renderColumn).join('\n');
  const saveAttr = dl.saveRemovedData !== false ? ' saveRemovedData="true"' : '';
  return [
    `\t\t\t<w2:dataList id="${escapeXml(dl.id)}" baseNode="list" repeatNode="map"${saveAttr}>`,
    `\t\t\t\t<w2:columnInfo>`,
    cols,
    `\t\t\t\t</w2:columnInfo>`,
    `\t\t\t</w2:dataList>`,
  ].join('\n');
}

export function injectDataCollection(xml: string, ir: DataCollectionIR): string {
  // 빈 IR → dataCollection 비어있는 채로 유지
  if (ir.dataMaps.length === 0 && ir.dataLists.length === 0) {
    return xml;
  }

  const inner = [
    ...ir.dataMaps.map(renderDataMap),
    ...ir.dataLists.map(renderDataList),
  ].join('\n');

  // <w2:dataCollection>...</w2:dataCollection> 통째 교체.
  // 정규식: <w2:dataCollection [attrs]>...</w2:dataCollection>
  const pattern = /<w2:dataCollection\b[^>]*>[\s\S]*?<\/w2:dataCollection>/;

  if (!pattern.test(xml)) {
    throw new Error('XML에 <w2:dataCollection> 블록이 없음. Phase 0+1 출력 형식이 깨졌을 수 있음.');
  }

  const newBlock = `<w2:dataCollection baseNode="map">\n${inner}\n\t\t</w2:dataCollection>`;
  return xml.replace(pattern, newBlock);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test xml-injector`
Expected: 6개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/stage3/xml-injector.ts \
        packages/figma-ingest/tests/stage3/xml-injector.test.ts
git commit -m "feat(phase-2a): xml-injector — IR → XML 주입

- <w2:dataCollection>...</> 블록 통째 교체
- DataMap: <w2:keyInfo>/<w2:key>, baseNode=\"map\"
- DataList: <w2:columnInfo>/<w2:column>, baseNode=\"list\" repeatNode=\"map\"
- 빈 IR이면 dataCollection 빈 채로 유지
- 6개 테스트 PASS"
```

---

### Task 9: data-collection-inferrer (orchestrator)

**Files:**
- Create: `packages/figma-ingest/src/stage3/data-collection-inferrer.ts`
- Create: `packages/figma-ingest/tests/stage3/data-collection-inferrer.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/data-collection-inferrer.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { inferDataCollection } from '../../src/stage3/data-collection-inferrer';
import { MockLLMClient } from '../../src/stage3/llm-mock';
import type { DataCollectionIR } from '../../src/types';

const XML_WITH_REGIONS = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:w2="http://www.inswave.com/websquare" xmlns:xf="http://www.w3.org/2002/xforms">
  <head><xf:model><w2:dataCollection></w2:dataCollection></xf:model></head>
  <body>
    <xf:group class="schbox"><w2:textbox label="사번"/></xf:group>
    <xf:group class="gvwbox">
      <w2:gridView><w2:header><w2:row><w2:column value="사번"/></w2:row></w2:header>
        <w2:gBody><w2:row><w2:column id="EMP_CD"/></w2:row></w2:gBody>
      </w2:gridView>
    </xf:group>
  </body>
</html>`;

const sampleIR: DataCollectionIR = {
  dataMaps: [{ id: 'dma_search', name: '검색', keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }] }],
  dataLists: [{ id: 'dlt_list', name: '목록', columns: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }] }],
  confidence: 0.85,
};

describe('inferDataCollection (orchestrator)', () => {
  it('Mock LLM 호출 후 IR 반환', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('any', sampleIR);
    const result = await inferDataCollection(XML_WITH_REGIONS, mock);
    expect(result.dataMaps[0].id).toBe('dma_search');
    expect(mock.getCallLog().length).toBe(1);
  });

  it('region 없는 XML → LLM 호출 안 함 + 빈 IR 반환', async () => {
    const xmlNoRegions = `<root><body><xf:input/></body></root>`;
    const mock = new MockLLMClient();
    const result = await inferDataCollection(xmlNoRegions, mock);
    expect(result.dataMaps).toEqual([]);
    expect(result.dataLists).toEqual([]);
    expect(result.confidence).toBe(1.0);   // 빈 페이지는 확신
    expect(mock.getCallLog().length).toBe(0);
  });

  it('LLM이 throw → fallback IR (빈 + confidence 0)', async () => {
    class FailingClient {
      async inferDataCollection(): Promise<DataCollectionIR> {
        throw new Error('mock LLM failure');
      }
    }
    const result = await inferDataCollection(XML_WITH_REGIONS, new FailingClient() as any);
    expect(result.dataMaps).toEqual([]);
    expect(result.dataLists).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.notes).toContain('failure');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test data-collection-inferrer`
Expected: FAIL

- [ ] **Step 3: data-collection-inferrer.ts 구현**

Create `packages/figma-ingest/src/stage3/data-collection-inferrer.ts`:

```typescript
/**
 * Stage 3 메인 orchestrator.
 *
 * 입력 XML에서 region이 없으면 LLM 호출 없이 빈 IR 반환.
 * LLM 호출이 실패하면 graceful degradation — 빈 IR + confidence=0 + 오류 notes.
 */
import { extractRegions } from './xml-region-parser';
import type { LLMClientLike } from './llm-mock';
import type { DataCollectionIR } from '../types';

const EMPTY_IR_CONFIDENT: DataCollectionIR = {
  dataMaps: [],
  dataLists: [],
  confidence: 1.0,
  notes: '추출된 region 없음 — DataCollection 불필요',
};

export async function inferDataCollection(
  xml: string,
  llmClient: LLMClientLike,
): Promise<DataCollectionIR> {
  const regions = extractRegions(xml);
  if (regions.length === 0) {
    return EMPTY_IR_CONFIDENT;
  }

  try {
    return await llmClient.inferDataCollection(xml);
  } catch (e) {
    return {
      dataMaps: [],
      dataLists: [],
      confidence: 0,
      notes: `LLM 추론 실패 — fallback 빈 IR. 원인: ${(e as Error).message}`,
    };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test data-collection-inferrer`
Expected: 3개 테스트 PASS.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/stage3/data-collection-inferrer.ts \
        packages/figma-ingest/tests/stage3/data-collection-inferrer.test.ts
git commit -m "feat(phase-2a): data-collection-inferrer orchestrator

- region 없으면 LLM 호출 skip + 빈 IR (confidence 1.0)
- LLM 호출 실패 시 fallback 빈 IR (confidence 0 + 오류 notes)
- graceful degradation — Phase 0+1 수준 출력 보장
- 3개 테스트 PASS"
```

---

### Task 10: pipeline 통합 + CLI 플래그

**Files:**
- Modify: `packages/figma-ingest/src/pipeline.ts`
- Modify: `packages/figma-ingest/src/cli.ts`
- Create: `packages/figma-ingest/tests/stage3/pipeline-stage3.test.ts`

- [ ] **Step 1: 실패 테스트 작성 (Stage 3 통합 동작 검증)**

Create `packages/figma-ingest/tests/stage3/pipeline-stage3.test.ts`:

```typescript
import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../../src/pipeline';
import { closeBrowser } from '../../src/dom-extractor';
import { MockLLMClient } from '../../src/stage3/llm-mock';
import type { DataCollectionIR } from '../../src/types';

const FIX_DIR = path.join(__dirname, '..', 'fixtures');
const simpleFormHtml = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');

const simpleFormIR: DataCollectionIR = {
  dataMaps: [{
    id: 'dma_search', name: '검색조건',
    keys: [
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'DEPT_CD', name: '부서 코드', dataType: 'text' },
    ],
  }],
  dataLists: [{
    id: 'dlt_list', name: '사원목록',
    columns: [
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'EMP_NM', name: '성명', dataType: 'text' },
      { id: 'DEPT_NM', name: '부서명', dataType: 'text' },
    ],
  }],
  confidence: 0.9,
};

describe('pipeline with Stage 3 (Mock LLM)', () => {
  afterAll(async () => { await closeBrowser(); });

  it('MockLLMClient 주입 시 DataCollection이 채워짐', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('simple-form', simpleFormIR);

    const xml = await convertHtmlToWebSquare(simpleFormHtml, { llmClient: mock });

    expect(xml).toContain('<w2:dataMap id="dma_search"');
    expect(xml).toContain('<w2:key id="EMP_CD"');
    expect(xml).toContain('<w2:dataList id="dlt_list"');
    expect(xml).toContain('<w2:column id="EMP_CD"');
  }, 60000);

  it('noLlm: true → Stage 3 skip, Phase 0+1 동작과 동일', async () => {
    const xml = await convertHtmlToWebSquare(simpleFormHtml, { noLlm: true });
    expect(xml).not.toContain('<w2:dataMap');
    expect(xml).not.toContain('<w2:dataList');
    expect(xml).toMatch(/<w2:dataCollection[^>]*>\s*<\/w2:dataCollection>/);
  }, 60000);

  it('llmClient도 noLlm도 없으면 → noLlm 기본 동작 (안전)', async () => {
    const xml = await convertHtmlToWebSquare(simpleFormHtml);
    expect(xml).not.toContain('<w2:dataMap');
  }, 60000);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline-stage3`
Expected: FAIL (pipeline은 아직 Stage 3 미통합)

- [ ] **Step 3: pipeline.ts 수정 — Stage 3 통합**

Edit `packages/figma-ingest/src/pipeline.ts`. 다음 import 추가:

```typescript
import { inferDataCollection } from './stage3/data-collection-inferrer';
import { injectDataCollection } from './stage3/xml-injector';
import type { LLMClientLike } from './stage3/llm-mock';
```

`PipelineOptions`에 필드 추가:

```typescript
export interface PipelineOptions extends RelativeOptions {
  /** 디버그용: 중간 단계 결과를 반환받기 위한 콜백 */
  onStage?: (name: string, payload: unknown) => void;
  /** Stage 3 LLM 클라이언트 (없으면 Stage 3 skip) */
  llmClient?: LLMClientLike;
  /** Stage 3를 명시적으로 건너뛰는 escape hatch */
  noLlm?: boolean;
}
```

함수 본체 수정 — Stage 2 다음, Phase 1 룰 *앞*에 Stage 3 삽입:

```typescript
export async function convertHtmlToWebSquare(
  html: string,
  options: PipelineOptions = {}
): Promise<string> {
  // Stage 0: HTML → 컴포넌트 추출
  const extraction = await extractFromHtml(html);
  options.onStage?.('stage0-extraction', extraction);

  // Stage 1: 컴포넌트 → ABSOLUTE XML
  const absoluteXml = buildAbsoluteXml(extraction.meta, extraction.components);
  options.onStage?.('stage1-absolute', absoluteXml);

  // Stage 2: ABSOLUTE → RELATIVE
  const relativeXml = convertAbsoluteToRelative(absoluteXml, {
    adaptive: options.adaptive ?? false,
  });
  options.onStage?.('stage2-relative', relativeXml);

  // Stage 3: LLM Semantic Enricher (skip if --no-llm or no llmClient)
  let enrichedXml = relativeXml;
  if (!options.noLlm && options.llmClient) {
    const ir = await inferDataCollection(relativeXml, options.llmClient);
    enrichedXml = injectDataCollection(relativeXml, ir);
    options.onStage?.('stage3-enriched', { ir, xml: enrichedXml });
  }

  // Phase 1 룰: ID prefix UI-01 + 버튼 modifier
  let result = renameIdToUi01(enrichedXml);
  result = applyButtonModifiersInXml(result);
  options.onStage?.('phase1-finalized', result);

  return result;
}
```

- [ ] **Step 4: cli.ts 수정 — --no-llm 플래그 + LLM client 생성**

Edit `packages/figma-ingest/src/cli.ts`. 다음 import 추가:

```typescript
import { LLMClient } from './stage3/llm-client';
import { CostTracker } from './stage3/cost-tracker';
```

`main()` 본문 수정:

```typescript
async function main() {
  const args = process.argv.slice(2);
  const adaptive = args.includes('--adaptive');
  const noLlm = args.includes('--no-llm');
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length < 2) {
    console.error('Usage: figma-to-ws <input.html> <output.xml> [--adaptive] [--no-llm]');
    process.exit(1);
  }

  const [inputPath, outputPath] = positional;
  const absInput = path.resolve(inputPath);
  const absOutput = path.resolve(outputPath);

  if (!fs.existsSync(absInput)) {
    console.error(`Input not found: ${absInput}`);
    process.exit(1);
  }

  const html = fs.readFileSync(absInput, 'utf-8');
  console.log(`Converting ${absInput} → ${absOutput} (adaptive=${adaptive}, noLlm=${noLlm})`);

  let tracker: CostTracker | null = null;
  let llmClient: LLMClient | undefined = undefined;
  if (!noLlm) {
    tracker = new CostTracker();
    try {
      llmClient = new LLMClient({ tracker });
    } catch (e) {
      console.error(`LLM client 초기화 실패 — --no-llm 모드로 진행: ${(e as Error).message}`);
      llmClient = undefined;
    }
  }

  try {
    const xml = await convertHtmlToWebSquare(html, { adaptive, noLlm, llmClient });
    fs.writeFileSync(absOutput, xml, 'utf-8');
    console.log(`✓ Wrote ${xml.length} chars`);
    if (tracker) {
      const total = tracker.getTotal();
      console.log(`💰 LLM 비용 (이번 conversion): $${total.toFixed(4)}`);
      if (tracker.checkConversionThreshold() === 'warn') {
        console.warn(`⚠️  비용이 단일 conversion 경고 임계값 초과`);
      }
    }
  } catch (e) {
    console.error('Conversion failed:', e);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}
```

- [ ] **Step 5: 빌드 검증**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
Expected: tsc 클린.

- [ ] **Step 6: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline-stage3`
Expected: 3개 테스트 PASS.

전체 회귀:

Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 모든 unit + integration 테스트 PASS. 골든 테스트는 아직 업데이트 안 됐으므로 통과해야 함 (noLlm 기본).

- [ ] **Step 7: 커밋**

```bash
git add packages/figma-ingest/src/pipeline.ts \
        packages/figma-ingest/src/cli.ts \
        packages/figma-ingest/tests/stage3/pipeline-stage3.test.ts
git commit -m "feat(phase-2a): pipeline에 Stage 3 통합 + CLI --no-llm 플래그

- PipelineOptions.llmClient + noLlm 필드 추가
- Stage 3 위치: Stage 2 다음, Phase 1 룰 앞
- noLlm 기본값 — Mock 없이 호출하면 Stage 3 skip (안전)
- CLI: --no-llm 플래그, API key 없으면 자동 fallback
- 비용 출력 + 경고
- 3개 통합 테스트 PASS"
```

---

### Task 11: E2E — 3개 fixture에 Mock LLM 통합 + DataCollection 검증

**Files:**
- Create: `packages/figma-ingest/tests/fixtures/llm-responses/simple-form.json`
- Create: `packages/figma-ingest/tests/fixtures/llm-responses/search-grid.json`
- Create: `packages/figma-ingest/tests/fixtures/llm-responses/master-detail.json`
- Modify: `packages/figma-ingest/tests/pipeline.e2e.test.ts`

- [ ] **Step 1: 3개 mock 응답 fixture 작성**

Create `packages/figma-ingest/tests/fixtures/llm-responses/simple-form.json`:

```json
{
  "dataMaps": [{
    "id": "dma_search",
    "name": "검색조건",
    "keys": [
      { "id": "EMP_CD", "name": "사번", "dataType": "text" },
      { "id": "DEPT_CD", "name": "부서 코드", "dataType": "text" }
    ]
  }],
  "dataLists": [{
    "id": "dlt_list",
    "name": "사원목록",
    "saveRemovedData": true,
    "columns": [
      { "id": "EMP_CD", "name": "사번", "dataType": "text" },
      { "id": "EMP_NM", "name": "성명", "dataType": "text" },
      { "id": "DEPT_NM", "name": "부서명", "dataType": "text" }
    ]
  }],
  "confidence": 0.9,
  "notes": "simple-form fixture: 사번/부서 검색조건 + 사번/성명/부서명 그리드"
}
```

Create `packages/figma-ingest/tests/fixtures/llm-responses/search-grid.json`:

```json
{
  "dataMaps": [{
    "id": "dma_search",
    "name": "주문조회 조건",
    "keys": [
      { "id": "ORDER_NO", "name": "주문번호", "dataType": "text" },
      { "id": "ORDER_DATE", "name": "주문일", "dataType": "date" }
    ]
  }],
  "dataLists": [{
    "id": "dlt_orderList",
    "name": "주문목록",
    "saveRemovedData": true,
    "columns": [
      { "id": "ORDER_NO", "name": "주문번호", "dataType": "text" },
      { "id": "ORDER_DATE", "name": "주문일", "dataType": "date" },
      { "id": "AMOUNT", "name": "금액", "dataType": "number" }
    ]
  }],
  "confidence": 0.92,
  "notes": "주문조회 화면: ORDER_NO + ORDER_DATE schbox, 3컬럼 그리드"
}
```

Create `packages/figma-ingest/tests/fixtures/llm-responses/master-detail.json`:

```json
{
  "dataMaps": [],
  "dataLists": [{
    "id": "dlt_memberBasic",
    "name": "사원목록",
    "saveRemovedData": true,
    "columns": [
      { "id": "EMP_CD", "name": "사번", "dataType": "text" },
      { "id": "EMP_NM", "name": "성명", "dataType": "text" },
      { "id": "DEPT_NM", "name": "부서명", "dataType": "text" }
    ]
  }],
  "confidence": 0.85,
  "notes": "마스터-디테일 화면: 사원 검색 schbox + 사원목록 그리드. dma_search는 단순 성명 입력 1개라 생략 (Phase 2B에서 추가될 수도)"
}
```

(Master-detail에는 schbox에 input이 하나(성명)만 있으므로 LLM이 DataMap 없이 단일 input → DataList의 한 컬럼으로 흡수했다고 가정. Mock이므로 우리가 정함.)

- [ ] **Step 2: pipeline.e2e.test.ts에 Stage 3 검증 추가**

Edit `packages/figma-ingest/tests/pipeline.e2e.test.ts`. 파일 상단 import에 추가:

```typescript
import { MockLLMClient } from '../src/stage3/llm-mock';
import type { DataCollectionIR } from '../src/types';
```

상단에 헬퍼 추가 (기존 describe 블록 위):

```typescript
function loadMockResponse(name: string): DataCollectionIR {
  return JSON.parse(fs.readFileSync(
    path.join(FIX_DIR, 'llm-responses', `${name}.json`), 'utf-8'
  ));
}

function makeMock(name: string): MockLLMClient {
  const mock = new MockLLMClient();
  mock.recordResponse(name, loadMockResponse(name));
  return mock;
}
```

기존 describe 블록 끝에 새 describe 추가:

```typescript
describe('pipeline.convertHtmlToWebSquare with Stage 3 (Mock LLM)', () => {
  afterAll(async () => { await closeBrowser(); });

  it('simple-form: DataMap + DataList 자동 생성', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });

    expect(xml).toContain('<w2:dataMap id="dma_search"');
    expect(xml).toContain('<w2:key id="EMP_CD"');
    expect(xml).toContain('<w2:key id="DEPT_CD"');
    expect(xml).toContain('<w2:dataList id="dlt_list"');
    expect(xml).toContain('<w2:column id="EMP_CD"');
    expect(xml).toContain('<w2:column id="EMP_NM"');
  }, 60000);

  it('search-grid: ORDER_DATE에 date 타입 부여', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'search-grid.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('search-grid') });

    expect(xml).toContain('<w2:dataMap id="dma_search"');
    expect(xml).toContain('id="ORDER_DATE" name="주문일" dataType="date"');
    expect(xml).toContain('id="AMOUNT" name="금액" dataType="number"');
  }, 60000);

  it('master-detail: DataList만 생성 (DataMap 없음)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'master-detail.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('master-detail') });

    expect(xml).not.toContain('<w2:dataMap');
    expect(xml).toContain('<w2:dataList id="dlt_memberBasic"');
  }, 60000);

  it('noLlm: true → Phase 0+1 동작 (DataCollection 비어있음)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { noLlm: true });
    expect(xml).not.toContain('<w2:dataMap');
    expect(xml).not.toContain('<w2:dataList');
  }, 60000);
});
```

- [ ] **Step 3: 테스트 실행**

Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline.e2e`
Expected: 새로 추가된 4개 + 기존 3개 = 7개 PASS.

- [ ] **Step 4: 전체 회귀 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 모든 unit + integration + e2e PASS. **골든 테스트는 일시적으로 실패할 수 있음** (이전 Phase 0+1 골든은 빈 dataCollection을 기대). Task 12에서 골든 업데이트.

만약 골든 테스트가 통과한다면 noLlm 기본값 덕분. golden.regression.test.ts가 `convertHtmlToWebSquare(html)` (옵션 없이) 호출하므로 noLlm 기본 → Stage 3 skip → 골든과 일치. 좋음.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/tests/fixtures/llm-responses/ \
        packages/figma-ingest/tests/pipeline.e2e.test.ts
git commit -m "test(phase-2a): E2E — 3 fixture에 Mock LLM 통합 검증

- fixtures/llm-responses/{simple-form,search-grid,master-detail}.json 추가
- pipeline.e2e.test.ts에 Stage 3 검증 4개 추가:
  · simple-form: DataMap + DataList
  · search-grid: dataType=date/number 추론
  · master-detail: DataMap 없이 DataList만
  · noLlm: Phase 0+1 동작 유지
- 7/7 e2e PASS"
```

---

### Task 12: 골든 회귀 — Stage 3 통과 결과로 재생성 + Live API smoke (옵션)

**Files:**
- Modify: `packages/figma-ingest/tests/golden/simple-form.expected.xml`
- Modify: `packages/figma-ingest/tests/golden/search-grid.expected.xml`
- Modify: `packages/figma-ingest/tests/golden/master-detail.expected.xml`
- Modify: `packages/figma-ingest/tests/golden.regression.test.ts`
- Modify: `packages/figma-ingest/package.json` — `test:llm:live` 스크립트 추가

- [ ] **Step 1: 골든 회귀 테스트를 Mock LLM 사용하도록 수정**

Edit `packages/figma-ingest/tests/golden.regression.test.ts`. 파일 전체 교체:

```typescript
/**
 * Golden Regression Test
 *
 * 이 테스트는 3개 픽스처 HTML에서 변환된 XML이 tests/golden/ 의 expected와 정확히 일치하는지 확인한다.
 *
 * ⚠️ 골든 업데이트 워크플로:
 *   1. legacy converter, pipeline, Stage 3 LLM mock 응답이 의도적으로 변경된 경우만 골든을 업데이트한다.
 *   2. `corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate` 실행 (build 후).
 *      또는 수동으로 CLI 재실행 (Phase 2A부터는 --no-llm으로 골든 = Phase 0+1 동작 유지, OR Mock 사용).
 *   3. **반드시 git diff로 골든 변경사항을 확인하고 PR description에 변경 의도를 적는다.**
 *
 * Phase 2A 메모: 골든은 Mock LLM 응답 (tests/fixtures/llm-responses/*.json)을 사용해서 재생성.
 * Mock 응답이 변하면 골든도 변함.
 */
import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../src/pipeline';
import { closeBrowser } from '../src/dom-extractor';
import { MockLLMClient } from '../src/stage3/llm-mock';
import type { DataCollectionIR } from '../src/types';

const FIX_DIR = path.join(__dirname, 'fixtures');
const GOLDEN_DIR = path.join(__dirname, 'golden');

const cases = [
  { name: 'simple-form', html: 'simple-form.html', expected: 'simple-form.expected.xml' },
  { name: 'search-grid', html: 'search-grid.html', expected: 'search-grid.expected.xml' },
  { name: 'master-detail', html: 'master-detail.html', expected: 'master-detail.expected.xml' },
];

function loadMockResponse(name: string): DataCollectionIR {
  return JSON.parse(fs.readFileSync(
    path.join(FIX_DIR, 'llm-responses', `${name}.json`), 'utf-8'
  ));
}

describe('golden regression (with Stage 3 Mock LLM)', () => {
  afterAll(async () => { await closeBrowser(); });

  cases.forEach(({ name, html, expected }) => {
    it(`${name}: 골든 파일과 일치`, async () => {
      const input = fs.readFileSync(path.join(FIX_DIR, html), 'utf-8');
      const expectedXml = fs.readFileSync(path.join(GOLDEN_DIR, expected), 'utf-8');

      const mock = new MockLLMClient();
      mock.recordResponse(name, loadMockResponse(name));

      const actualXml = await convertHtmlToWebSquare(input, { llmClient: mock });
      expect(actualXml).toBe(expectedXml);
    }, 60000);
  });
});
```

- [ ] **Step 2: 빌드 + CLI 재생성 (Mock 응답 활용)**

CLI는 실제 LLM API key를 요구하므로 Mock으로 골든 재생성하려면 별도 스크립트가 필요. 새 헬퍼 스크립트:

Create `packages/figma-ingest/scripts/regenerate-goldens.ts`:

```typescript
/**
 * Mock LLM으로 골든 XML 재생성.
 * 사용: corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate
 */
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../src/pipeline';
import { closeBrowser } from '../src/dom-extractor';
import { MockLLMClient } from '../src/stage3/llm-mock';
import type { DataCollectionIR } from '../src/types';

const FIX_DIR = path.join(__dirname, '..', 'tests', 'fixtures');
const GOLDEN_DIR = path.join(__dirname, '..', 'tests', 'golden');

const cases = [
  { name: 'simple-form', html: 'simple-form.html', expected: 'simple-form.expected.xml' },
  { name: 'search-grid', html: 'search-grid.html', expected: 'search-grid.expected.xml' },
  { name: 'master-detail', html: 'master-detail.html', expected: 'master-detail.expected.xml' },
];

function loadMockResponse(name: string): DataCollectionIR {
  return JSON.parse(fs.readFileSync(
    path.join(FIX_DIR, 'llm-responses', `${name}.json`), 'utf-8'
  ));
}

async function main() {
  for (const { name, html, expected } of cases) {
    const inputPath = path.join(FIX_DIR, html);
    const outputPath = path.join(GOLDEN_DIR, expected);
    console.log(`Regenerating ${name} → ${outputPath}`);

    const inputHtml = fs.readFileSync(inputPath, 'utf-8');
    const mock = new MockLLMClient();
    mock.recordResponse(name, loadMockResponse(name));

    const xml = await convertHtmlToWebSquare(inputHtml, { llmClient: mock });
    fs.writeFileSync(outputPath, xml, 'utf-8');
    console.log(`  ✓ ${xml.length} chars`);
  }
  await closeBrowser();
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: package.json에 새 스크립트 등록**

Edit `packages/figma-ingest/package.json`. `scripts` 블록에서 기존 `test:golden:regenerate` 교체 + 새로 추가:

```json
"scripts": {
  "build": "tsc",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:golden:regenerate": "tsx scripts/regenerate-goldens.ts",
  "test:llm:live": "LIVE_LLM=true vitest run pipeline-stage3",
  "cli": "node dist/cli.js"
}
```

기존에는 `test:golden:regenerate`가 `node dist/cli.js ...` 직렬화였는데, 이제 Mock을 사용하려면 TS 스크립트 직접 실행이 필요 → `tsx` 추가.

- [ ] **Step 4: tsx 의존성 추가**

Edit `packages/figma-ingest/package.json` — devDependencies에 추가:

```json
"tsx": "^4.7.0"
```

Run: `corepack pnpm install`
Expected: tsx 설치.

- [ ] **Step 5: 골든 재생성 실행**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
Run: `corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate`

Expected output:
```
Regenerating simple-form → .../golden/simple-form.expected.xml
  ✓ NNNN chars
Regenerating search-grid → ...
Regenerating master-detail → ...
```

- [ ] **Step 6: 골든 파일들 검토**

`git diff packages/figma-ingest/tests/golden/` 결과 확인.

기대 변화: 각 골든 XML의 `<w2:dataCollection>` 블록이 비어있던 것에서 `<w2:dataMap>` + `<w2:dataList>`로 채워짐.

각 파일을 사람 눈으로 확인:
- `simple-form.expected.xml`: dma_search + dlt_list 보임
- `search-grid.expected.xml`: dma_search (ORDER_NO + ORDER_DATE) + dlt_orderList
- `master-detail.expected.xml`: dlt_memberBasic만 (DataMap 없음)

만약 합리적으로 보이지 않으면 (예: 누락된 컬럼, 잘못된 attribute) Mock 응답 JSON을 조정 후 다시 재생성.

- [ ] **Step 7: 골든 회귀 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test golden`
Expected: 3/3 PASS.

- [ ] **Step 8: 전체 테스트 실행**

Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 모든 테스트 PASS. 신규 unit ~37개 + 기존 74개 + e2e 추가 4개 = ~115개.

- [ ] **Step 9: Live API smoke (옵션 — API key가 있을 때만)**

`ANTHROPIC_API_KEY`가 환경변수에 설정되어 있다면:

Run: `corepack pnpm --filter @kdh/figma-ingest test:llm:live`
Expected: 실제 API 호출로 3개 fixture 통과. 비용 ≤ $0.20.

설정되지 않았으면 skip. CI는 기본 skip.

- [ ] **Step 10: 커밋**

```bash
git add packages/figma-ingest/scripts/regenerate-goldens.ts \
        packages/figma-ingest/package.json \
        packages/figma-ingest/tests/golden.regression.test.ts \
        packages/figma-ingest/tests/golden/ \
        pnpm-lock.yaml
git commit -m "test(phase-2a): 골든 재생성 (Stage 3 포함) + test:llm:live 스크립트

- regenerate-goldens.ts: Mock LLM으로 골든 결정적 재생성
- golden.regression.test.ts: Mock LLM 주입 (Stage 3 통과)
- 3개 골든 XML 업데이트 — DataCollection 채워짐
- test:llm:live: ANTHROPIC_API_KEY 있을 때 실제 API smoke
- tsx devDep 추가
- 모든 테스트 PASS"
```

---

## Self-Review Notes

**Spec coverage:**

- §1 (배경/문제/목표) → 플랜 도입부 + Task 11 e2e 검증 ✓
- §2 (Stage 3 삽입 위치) → Task 10 pipeline.ts 수정 ✓
- §3 (모듈 분해) → Tasks 2~9 각 모듈 ✓
- §4 (LLM 통합 — Anthropic + tool use + 캐싱 + temp=0 + retry) → Task 7 llm-client ✓
- §4-5 (실패 시 graceful fallback) → Task 9 data-collection-inferrer ✓
- §5 (데이터 플로우) → Task 9 + Task 10 통합 ✓
- §6 (테스팅 — Mock 기본, Live 옵트인) → Task 4 mock, Task 12 test:llm:live ✓
- §7 (비용 가드) → Task 3 cost-tracker + Task 10 cli.ts 출력 ✓
- §8 (12 task 분해) → 이 플랜의 12개 task ✓ (1:1 매핑)
- §9 (성공 기준) → 각 task의 expected에 분산 ✓
- §10 (리스크와 미해결) → 플랜 자체에 명시 없음. spec에서 참조

**Placeholder scan:** TBD/TODO 없음. 모든 step에 실제 코드/명령/기대 출력 있음.

**Type consistency:**
- `LLMClientLike` 인터페이스 (llm-mock.ts) ↔ `MockLLMClient`/`LLMClient` 양쪽 모두 동일 시그니처 `inferDataCollection(xml: string, options?: InferOptions): Promise<DataCollectionIR>` ✓
- `UsageEntry` (types.ts) ↔ cost-tracker.ts에서 사용 ✓
- `DataCollectionIR` (types.ts) ↔ ir-schema validate 반환값 ✓
- `Region` (xml-region-parser.ts) ↔ prompt-builder buildPrompt 입력 ✓
- `PipelineOptions.llmClient` ↔ `LLMClientLike` 타입 ✓

**경로 일관성 확인:**
- Task 5 ~ 9 모두 `src/stage3/*.ts` 경로 ✓
- 테스트 모두 `tests/stage3/*.test.ts` 경로 ✓
- Mock fixture 모두 `tests/fixtures/llm-responses/*.json` ✓

**의존성 순서:**
1. Task 1 (deps + types) — foundation
2. Task 2 (pricing + ir-schema) — pricing은 cost-tracker가 소비, ir-schema는 llm-client가 소비
3. Task 3 (cost-tracker) — llm-client가 소비
4. Task 4 (llm-mock) — llm-client는 같은 인터페이스
5. Task 5 (xml-region-parser) — prompt-builder가 소비
6. Task 6 (prompt-builder) — llm-client가 소비
7. Task 7 (llm-client) — 모든 dep 만족 후
8. Task 8 (xml-injector) — 독립적, data-collection-inferrer가 소비
9. Task 9 (data-collection-inferrer) — Task 5 + Task 8 통합, llm-mock or llm-client 주입
10. Task 10 (pipeline + cli) — Task 9 + Task 8 통합
11. Task 11 (e2e) — Task 10 결과 검증
12. Task 12 (골든) — Task 11 후

각 task가 이전 task에 명시적으로 의존하며 forward reference 없음 ✓

---

*문서 끝.*
