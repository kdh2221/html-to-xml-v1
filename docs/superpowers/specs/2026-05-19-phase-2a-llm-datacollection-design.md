# Phase 2A: LLM Semantic Enricher (DataCollection 추론) 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-19 |
| 상태 | Draft v1.0 |
| 작성 컨텍스트 | 인스웨이브 UX 팀 |
| 선행 spec | `2026-05-13-html-to-websquare-design.md` (전체 5단계 파이프라인 설계) |
| 선행 구현 | Phase 0+1 (74/74 tests PASS, 결정론적 변환 작동) |

## 0. 관련 자산

- 부모 spec: [`2026-05-13-html-to-websquare-design.md`](2026-05-13-html-to-websquare-design.md) — Stage 3 Semantic Enricher 윤곽
- Phase 0+1 구현: `packages/figma-ingest/` (74/74 tests), `packages/legacy-converter/`
- 메모리: `project-phase1-implementation`, `reference-websquare-deepsquare`
- deepsquare 가드레일: `<WRM>/deepsquare/codeRule/CodeRules.md`, `<WRM>/deepsquare/publishing/Component_Catalog.md`

---

## 1. 배경과 문제 정의

### 1-1. 현재 상태 (Phase 0+1 끝)

`convertHtmlToWebSquare()`는 HTML → 컴파일 가능한 WebSquare XML을 생성하지만, **`<w2:dataCollection>`이 비어있다**. 즉:

- DataMap (검색 폼 입력값 컨테이너) 미생성
- DataList (그리드 데이터 컨테이너) 미생성
- 컴포넌트에 `ref="data:..."` 바인딩 부재 → SSOT 미작동
- Submission 미생성 → 서버 통신 불가

결과 XML은 *눈에 보이는 화면*은 그려지지만 *살아있지 않다*.

### 1-2. Phase 2 전체에서 2A의 위치

Phase 2 전체는 4개 독립 기능 묶음:
1. **LLM 인프라** ← **Plan 2A**
2. **DataCollection 추론** (DataMap + DataList) ← **Plan 2A**
3. Submission + ref 바인딩 ← Plan 2B (후속)
4. Semantic ID + scwin skeleton + MSG codes ← Plan 2C (후속)

이 스펙은 **Plan 2A**만 정의한다. Plan 2A는 LLM 인프라를 깔고, DataCollection만 채운다.

### 1-3. 목표

- Stage 3 (LLM Semantic Enricher) 인프라를 첫 도입
- 입력 XML의 schbox/gvwbox 영역을 LLM이 분석해서 적절한 DataMap/DataList를 자동 생성
- 출력 XML의 `<w2:dataCollection>` 블록이 채워짐
- 비용 통제: 단일 conversion ≤ $1, 세션 누적 ≤ $10
- 결정론성: 테스트는 mock LLM, 골든 회귀는 deterministic 응답으로 작동

성공 기준은 §9에 정의.

---

## 2. 파이프라인 — Stage 3 삽입 위치

Phase 0+1 파이프라인:
```
Stage 0 → Stage 1 → Stage 2 → [Phase 1 rules] → 최종 XML
                                    └─ id-renamer, button-modifier
```

Plan 2A 후:
```
Stage 0 → Stage 1 → Stage 2 → [Stage 3] → [Phase 1 rules] → 최종 XML
                                ↑
                                NEW — LLM DataCollection 추론
```

**삽입 위치 근거**: Stage 3가 생성하는 `dma_search` / `dlt_list` 같은 ID는 이미 deepsquare UI-01 규격이라 Phase 1의 id-renamer를 통과해도 변하지 않는다. 컴포넌트 레벨 ID(`edt_001` → `ibx_001`)는 Phase 1에서 계속 처리. 두 단계가 충돌하지 않음.

**`--no-llm` CLI 옵션**: Stage 3를 건너뛰는 escape hatch. Phase 0+1과 동일 동작 보장.

---

## 3. 모듈 분해

```
packages/figma-ingest/src/
├── stage3/                                    # NEW 디렉터리
│   ├── llm-client.ts                Anthropic SDK 래퍼 (캐싱+재시도+tool use)
│   ├── llm-mock.ts                  MockLLMClient (테스트용 canned response 주입)
│   ├── cost-tracker.ts              토큰 카운트 + $ 추정 + 임계값 가드
│   ├── ir-schema.ts                 Zod 스키마 (DataCollection IR 런타임 검증)
│   ├── prompt-builder.ts            deepsquare 컨텍스트 + region prompt 조립
│   ├── xml-region-parser.ts         XML에서 schbox/gvwbox region 추출
│   ├── data-collection-inferrer.ts  Stage 3 메인 로직 — 모든 모듈 wire
│   └── xml-injector.ts              inferred DataCollection을 XML에 주입
│
├── types.ts                                   # MODIFIED — Phase 2 IR 타입 추가
├── pipeline.ts                                # MODIFIED — Stage 3 단계 삽입
└── cli.ts                                     # MODIFIED — --no-llm 플래그
```

각 파일은 단일 책임. 8개 신규 파일, 모두 100~200줄 예상. 큰 파일 금지.

### 3-1. 각 모듈의 역할 (1줄 인터페이스)

| 모듈 | export | 의존 |
|---|---|---|
| `llm-client.ts` | `class LLMClient { async inferDataCollection(xml, options): Promise<RawLLMResponse> }` | `@anthropic-ai/sdk` |
| `llm-mock.ts` | `class MockLLMClient { recordResponse(key, response); inferDataCollection() — matches against recorded` | (테스트 전용) |
| `cost-tracker.ts` | `class CostTracker { record(usage); getTotal(); checkThreshold() }` | (없음) |
| `ir-schema.ts` | `dataCollectionSchema: z.ZodSchema; validate(raw): DataCollectionIR` | `zod` |
| `prompt-builder.ts` | `buildPrompt(xml, regions, deepsquareContext): { system, user, tools }` | (없음) |
| `xml-region-parser.ts` | `extractRegions(xml): Array<{ kind: 'schbox' \| 'gvwbox', innerXml, labels }>` | `cheerio` 또는 정규식 |
| `data-collection-inferrer.ts` | `async inferDataCollection(xml, llmClient, costTracker): Promise<DataCollectionIR>` | 모든 stage3 모듈 |
| `xml-injector.ts` | `injectDataCollection(xml, ir): string` | (없음) |

---

## 4. LLM 통합

### 4-1. Provider / Model

- **Anthropic Claude Sonnet 4.6** (`claude-sonnet-4-6`)
- SDK: `@anthropic-ai/sdk` (Node SDK)
- API key: `process.env.ANTHROPIC_API_KEY`
- 누락 시: Stage 3 활성화된 conversion 시작점에 throw (with-LLM 모드에서만). `--no-llm` 모드에서는 throw 안 함

### 4-2. 구조화 출력 — Forced Tool Use

JSON 모드 대신 Anthropic의 tool use 강제. LLM이 `submit_data_collection` 도구를 반드시 호출하도록 `tool_choice: { type: 'tool', name: 'submit_data_collection' }`.

도구 정의:

```typescript
const submitDataCollectionTool = {
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
                  id: { type: 'string', pattern: '^[A-Z][A-Z0-9_]*$', description: 'EMP_CD 같은 UPPER_SNAKE_CASE' },
                  name: { type: 'string', description: '한글 라벨 — 예: "사번"' },
                  dataType: { type: 'string', enum: ['text', 'number', 'date'] }
                },
                required: ['id', 'name', 'dataType']
              }
            }
          },
          required: ['id', 'name', 'keys']
        }
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
                  id: { type: 'string', pattern: '^[A-Z][A-Z0-9_]*$|^chk$' },
                  name: { type: 'string' },
                  dataType: { type: 'string', enum: ['text', 'number', 'date'] }
                },
                required: ['id', 'name', 'dataType']
              }
            }
          },
          required: ['id', 'name', 'columns']
        }
      },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      notes: { type: 'string', description: '추론 근거 — 디버그용, 1~2문장' }
    },
    required: ['dataMaps', 'dataLists', 'confidence']
  }
};
```

런타임에 Zod로 한 번 더 검증 (Anthropic schema enforcement + Zod = 이중 안전망).

### 4-3. 프롬프트 캐싱

시스템 프롬프트에 deepsquare 문서 동봉 → `cache_control: { type: 'ephemeral' }`. 5분 TTL.

**시스템 프롬프트 구성** (캐싱 대상):
1. WebSquare DataCollection 작성 규칙 요약 (CodeRules.md의 DL-01 ~ DL-10)
2. Component_Catalog.md의 DataMap/DataList 섹션
3. userspec 5개 (사원정보/메뉴/공휴일/코드/팝업) — few-shot 패턴
4. 명명 규칙 강조 (dma_/dlt_/UPPER_SNAKE)

추정 크기: ~15K 토큰 (캐싱 후 hit는 ~$0.045/M cached input)

**유저 프롬프트** (캐싱 안 함):
- 입력 XML (Stage 2 출력) — region 부분만 추출해서 첨부 (`xml-region-parser`)
- 작업 지시: "위 화면 XML을 분석해서 DataMap/DataList를 추론하고 `submit_data_collection` 도구를 호출하세요."

### 4-4. temperature / top_p

- `temperature: 0` — 결정론성 우선. 골든 회귀 가능.
- `top_p: 1` — 기본값.
- `max_tokens: 2000` — 충분 + 비용 cap.

### 4-5. 재시도 정책

- Anthropic SDK의 기본 재시도 (3회, exponential backoff) 활용
- 추가 로직: Zod validation 실패 시 1회 재시도 + 더 명시적인 프롬프트 ("앞서 출력은 schema 위반: X. 다시 시도")
- 누적 재시도 3회 후에도 실패: throw (Stage 3 실패 → conversion 중단 OR `--no-llm` fallback?)

**실패 모드 결정**: Stage 3 LLM 호출 최종 실패 시 **빈 DataCollection으로 fallback** (Phase 0+1 수준 출력) + 리포트에 RED FLAG. conversion 중단 아님. 이유: Phase 2A는 "보조 기능"이라 실패 시 graceful degradation이 옳다.

---

## 5. 데이터 플로우 상세

```
                  Stage 2 출력 RELATIVE XML
                            │
                            ▼
            ┌───────────────────────────────┐
            │  xml-region-parser            │
            │  • schbox 영역 추출 (id+labels) │
            │  • gvwbox 영역 추출 (header)    │
            │  • Page meta (screenName)      │
            └───────────┬───────────────────┘
                        │ regions
                        ▼
            ┌───────────────────────────────┐
            │  prompt-builder               │
            │  • system: deepsquare context │
            │  • user: regions + task       │
            │  • tools: submit_data_coll.   │
            └───────────┬───────────────────┘
                        │ prompt
                        ▼
            ┌───────────────────────────────┐
            │  llm-client (or llm-mock)     │
            │  • Anthropic API 호출         │
            │  • cost-tracker 기록          │
            │  • Zod validate               │
            └───────────┬───────────────────┘
                        │ DataCollectionIR
                        ▼
            ┌───────────────────────────────┐
            │  xml-injector                 │
            │  • <w2:dataCollection> 안에    │
            │    DataMap/DataList 주입      │
            └───────────┬───────────────────┘
                        │
                        ▼
                  Stage 3 출력 XML → Phase 1 rules
```

---

## 6. 테스팅 전략

### 6-1. 단위 테스트 (mock LLM 기본)

각 stage3 모듈의 단위 테스트:

| 모듈 | 테스트 케이스 (대표) |
|---|---|
| `cost-tracker` | record() 누적, 임계값 throw, 캐싱된 토큰 가격 적용 |
| `ir-schema` | 유효 입력 통과, 잘못된 prefix 거부, 잘못된 dataType 거부 |
| `xml-region-parser` | schbox 1개+gvwbox 1개 XML에서 region 2개 추출, 라벨 보존 |
| `prompt-builder` | system prompt에 deepsquare 마커 포함, user prompt에 region 포함, tool 1개 |
| `llm-mock` | recordResponse → inferDataCollection 매칭, 매칭 안 되면 throw |
| `data-collection-inferrer` | mock LLM 주입 시 IR 반환, validation 실패 시 fallback, 재시도 |
| `xml-injector` | 빈 dataCollection에 DataMap 1개 + DataList 1개 주입, 다른 XML 영역 미변경 |

### 6-2. 통합 테스트

`MockLLMClient`에 3개 fixture에 대응하는 응답을 사전 녹화:

```typescript
mockLLM.recordResponse('simple-form', {
  dataMaps: [{ id: 'dma_search', name: '검색조건',
    keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }, { id: 'DEPT_CD', name: '부서', dataType: 'text' }] }],
  dataLists: [{ id: 'dlt_list', name: '사원목록',
    columns: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }, ...] }],
  confidence: 0.9
});

const xml = await convertHtmlToWebSquare(simpleFormHtml, { llmClient: mockLLM });
expect(xml).toContain('<w2:dataMap id="dma_search">');
expect(xml).toContain('<w2:key id="EMP_CD"');
```

### 6-3. 골든 회귀 확장

기존 3개 골든 XML을 Stage 3 통과 결과로 재생성 + 검토 + 채택. mock 응답이 deterministic이므로 골든도 deterministic.

### 6-4. (옵션) Live API 테스트

- 환경 변수 `LIVE_LLM=true`에서만 실행
- 실제 API 호출 → 추론 정확도 검증
- CI 기본 skip, 로컬 검증용
- 비용 ~$0.05 / 1회 (3 fixture)

---

## 7. 비용 가드레일

### 7-1. 토큰 추적

매 LLM 호출 후 `cost-tracker.record(usage)`:

```typescript
interface UsageEntry {
  timestamp: number;
  model: string;
  inputTokens: number;        // 캐시 미스 부분
  cachedInputTokens: number;  // 캐시 히트 부분
  outputTokens: number;
  costUsd: number;
  conversionId?: string;       // 어느 conversion에 속하는지
}
```

### 7-2. 가격 표 (2026-05 기준 — pricing.ts에 상수로)

```typescript
const PRICING = {
  'claude-sonnet-4-6': {
    inputPerMillion: 3.00,
    cachedInputPerMillion: 0.30,
    outputPerMillion: 15.00,
  },
};
```

### 7-3. 임계값

- 단일 conversion ≥ $1.00 → `console.warn` + 결과 리포트에 RED FLAG
- 세션 누적 ≥ $10.00 → throw (안전 차단). 사용자가 환경변수로 상한 override 가능: `LLM_COST_CAP_USD=50`

### 7-4. 예상 비용

| 시나리오 | 캐시 시작 | 캐시 히트 | 추정 |
|---|---|---|---|
| 첫 conversion (콜드) | 15K 입력 × $3/M | 0 cached | ~$0.05 |
| 후속 (5분 내) | 2K user 입력 × $3/M | 15K × $0.3/M | ~$0.011 |
| Sonnet 출력 500토큰 | × $15/M | | $0.0075 |
| 합계 (warm) | | | **~$0.018 / conversion** |

100건 변환 시 ~$1.8. 충분히 운영 가능.

---

## 8. Task 분해 (12개)

| # | Task | TDD | 산출 파일 |
|---|---|---|---|
| 1 | `@anthropic-ai/sdk` + `zod` 설치 + types.ts에 Phase2 IR 타입 추가 | N | package.json, types.ts |
| 2 | `ir-schema.ts` (Zod 스키마) | Y | ir-schema.ts + .test.ts |
| 3 | `cost-tracker.ts` (record + threshold) | Y | cost-tracker.ts + .test.ts |
| 4 | `llm-mock.ts` (MockLLMClient) — 인프라 먼저 | Y | llm-mock.ts + .test.ts |
| 5 | `xml-region-parser.ts` (schbox/gvwbox 추출) | Y | xml-region-parser.ts + .test.ts |
| 6 | `prompt-builder.ts` (system + user + tools) | Y | prompt-builder.ts + .test.ts |
| 7 | `llm-client.ts` (Anthropic SDK 래퍼) | Y (mock으로) | llm-client.ts + .test.ts |
| 8 | `xml-injector.ts` (IR → XML 주입) | Y | xml-injector.ts + .test.ts |
| 9 | `data-collection-inferrer.ts` (메인 통합) | Y | data-collection-inferrer.ts + .test.ts |
| 10 | `pipeline.ts` 수정 — Stage 3 삽입 + `cli.ts` `--no-llm` 플래그 | Y | pipeline.ts, cli.ts |
| 11 | E2E: 3 fixture에 mock LLM 통합 + DataCollection 검증 | Y | pipeline.e2e.test.ts 확장 |
| 12 | 골든 재생성 + 회귀 통과 + Live API smoke (옵션) | Y | golden/*.expected.xml 업데이트 |

각 task는 5~9 step 단위, 평균 2~3시간. 총 ~1.5주.

---

## 9. 성공 기준

Plan 2A 완료 게이트:

1. 모든 unit test PASS (mock LLM, ~40개 신규 테스트 + 기존 74개 유지)
2. E2E: 3개 fixture HTML → 출력 XML의 `<w2:dataCollection>`이 비어있지 않음
   - schbox 키 수 ≥ 1
   - gvwbox 컬럼 수 ≥ 1
   - DataMap ID prefix `dma_`, DataList ID prefix `dlt_`, 키/컬럼 ID UPPER_SNAKE
3. 골든 회귀 PASS (mock 응답 deterministic)
4. CLI `--no-llm` 플래그 작동 — Phase 0+1과 동일 출력 (regression baseline 유지)
5. `cost-tracker` 출력이 콘솔에 표시되고 임계값에서 멈춤
6. Live API smoke (옵션): `LIVE_LLM=true pnpm test:llm:live` 실행 시 실제 API로 3 fixture 통과, 누적 비용 < $0.20

---

## 10. 리스크와 미해결 질문

| 리스크 | 영향 | 완화 |
|---|---|---|
| Anthropic API 변경 (도구 정의/스키마 강제 동작) | LLM 호출 실패 | SDK 버전 pin, CHANGELOG 추적 |
| LLM 환각 (없는 필드 추론) | 잘못된 DataMap 생성 | Tool use 스키마 + Zod + sanity check (DataMap 키가 폼 라벨과 매칭되는지) |
| LLM 비결정성 (temp=0에서도) | 골든 회귀 깨짐 | Mock LLM 기본 사용, Live는 옵트인 |
| deepsquare 문서 크기 증가 | 캐싱 효과 감소 | 캐시 히트율 모니터링, 필요 시 system prompt 압축 |
| API key 누락 | 시작 실패 | `--no-llm` 모드로 fallback 가능 |
| 비용 과다 | 운영 부담 | 임계값 가드 + 사용자 override |

미해결:
1. **데이터 타입 추론 정확도** — `IS_*` → text+Y/N, `_SEQ` → number 같은 deepsquare DL-01 매핑은 LLM이 못 잡을 수 있음. Plan 2A에서는 `text` 기본, Plan 2B에서 후처리 룰 추가
2. **공통 코드 감지** (`$c.data.setCommonCode`) — select1 옵션이 정적 데이터인지 공통 코드 로드 대상인지 LLM이 판단해야 함. Plan 2A에서는 표시 안 함, Plan 2C에서 처리
3. **다중 schbox / 다중 gvwbox** — 외환송금처럼 한 화면에 schbox 여러 개일 수 있음. LLM은 처리 가능하지만 `dma_search1`, `dma_search2` 같은 명명이 정착할지 검증 필요
4. **`saveRemovedData="true"` 자동 여부** — 그리드가 수정 가능한지 LLM이 판단. 일단 `true` default + 사용자가 후속 수정

---

## 11. 부록 — IR 타입 (`types.ts` 추가분)

```typescript
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
```

---

## 12. 부록 — 기대 출력 XML 변화

**Phase 0+1 출력** (simple-form.html):
```xml
<xf:model>
  <w2:dataCollection></w2:dataCollection>
</xf:model>
```

**Plan 2A 통과 후 기대 출력**:
```xml
<xf:model>
  <w2:dataCollection baseNode="map">
    <w2:dataMap id="dma_search">
      <w2:keyInfo>
        <w2:key id="EMP_CD" name="사번" dataType="text"/>
        <w2:key id="DEPT_CD" name="부서 코드" dataType="text"/>
      </w2:keyInfo>
    </w2:dataMap>
    <w2:dataList id="dlt_list" baseNode="list" saveRemovedData="true">
      <w2:columnInfo>
        <w2:column id="EMP_CD" name="사번" dataType="text"/>
        <w2:column id="EMP_NM" name="성명" dataType="text"/>
        <w2:column id="DEPT_NM" name="부서명" dataType="text"/>
      </w2:columnInfo>
    </w2:dataList>
  </w2:dataCollection>
</xf:model>
```

ref 바인딩과 Submission은 **Plan 2B에서 추가**. Plan 2A 출력은 그것만 빠진 상태로 컴파일 가능.

---

*문서 끝.*
