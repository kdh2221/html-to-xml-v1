# Phase 2B: ref 바인딩 + Submission 추론 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Phase 2A의 채워진 DataCollection을 화면 컴포넌트에 연결한다 — schbox input에 `ref="data:dma_search.{KEY}"`, gridView에 `dataList=` + 컬럼 id 정렬, `<xf:submission sbm_search>` 선언.

**Architecture:** Stage 3(주입)와 Phase 1 rules 사이에 Stage 3.5(`bindDataCollection`) 삽입. 같은 IR이 inject와 bind에 흐름. LLM이 binding 힌트(`boundComponentId`/`sourceBodyId`)를 방출하고, 결정론적 binder 3종(ref-binder/grid-reconciler/submission-generator)이 XML에 적용 + label/위치 fallback.

**Tech Stack:** TypeScript strict, Vitest, 정규식 기반 XML 조작 (xml-injector와 동일 패턴), cheerio (region 추출 재사용).

**Spec reference:** [`docs/superpowers/specs/2026-05-20-phase-2b-binding-submission-design.md`](../specs/2026-05-20-phase-2b-binding-submission-design.md)

---

## ⚠️ 핵심 순서 디테일 (모든 구현자 필독)

Stage 3.5는 **Phase 1 rename(`renameIdToUi01`) 이전**에 실행된다. 따라서:
- binder가 보는 컴포넌트 id는 **pre-rename**: Edit→`edt_*`, SelectBox→`sel_*`, Calendar→`cal_*`, GridView body 컬럼→`col_1`/`col_2`...
- LLM(Stage 3)도 같은 pre-rename XML을 보므로 `boundComponentId` 힌트도 `edt_`/`sel_` 형태
- ref 값(`data:dma_search.EMP_CD`)·정렬된 컬럼 id(`EMP_CD`)·`dataList=`는 renameIdToUi01이 건드리지 않음 (id/hierarchy/orgid 속성만 변환) → Phase 1이 컴포넌트 id만 `ibx_`/`sbx_`로 바꾸고 binding은 그대로 보존
- 그래서 **E2E/골든의 최종 출력**에는 `<xf:input id="ibx_empCd" ref="data:dma_search.EMP_CD">`처럼 나타남

---

## File Structure

```
packages/figma-ingest/
├── src/
│   ├── types.ts                              # MODIFIED — boundComponentId, sourceBodyId
│   ├── pipeline.ts                           # MODIFIED — Stage 3.5 wiring
│   └── stage3/
│       ├── xml-region-parser.ts              # MODIFIED — schbox fields
│       ├── ir-schema.ts                      # MODIFIED — optional binding 필드
│       ├── prompt-builder.ts                 # MODIFIED — 힌트 요청 + tool schema
│       ├── ref-binder.ts                     # NEW
│       ├── grid-reconciler.ts                # NEW
│       ├── submission-generator.ts           # NEW
│       └── data-binder.ts                    # NEW — Stage 3.5 orchestrator
├── tests/
│   ├── stage3/
│   │   ├── ref-binder.test.ts                # NEW
│   │   ├── grid-reconciler.test.ts           # NEW
│   │   ├── submission-generator.test.ts      # NEW
│   │   └── data-binder.test.ts               # NEW
│   ├── fixtures/llm-responses/*.json         # MODIFIED — binding 힌트
│   ├── pipeline.e2e.test.ts                  # MODIFIED — 바인딩 검증
│   └── golden/*.expected.xml                 # MODIFIED — 재생성
```

---

### Task 1: xml-region-parser — schbox fields 추출

**Files:**
- Modify: `packages/figma-ingest/src/stage3/xml-region-parser.ts`
- Modify: `packages/figma-ingest/tests/stage3/xml-region-parser.test.ts`

- [ ] **Step 1: 기존 테스트에 fields 검증 추가**

Read `packages/figma-ingest/tests/stage3/xml-region-parser.test.ts` 먼저. 기존 SCHBOX_XML fixture에는 `<xf:input id="ibx_empCd"/>`, `<xf:select1 id="sbx_deptCd"/>`가 있고 인접 th에 `<w2:textbox label="사번"/>`, `<w2:textbox label="부서"/>`가 있음.

`describe('extractRegions', ...)` 안에 테스트 추가:

```typescript
  it('schbox fields: label과 componentId 페어링', () => {
    const xml = `<root>${SCHBOX_XML}</root>`;
    const regions = extractRegions(xml);
    const sch = regions.find(r => r.kind === 'schbox');
    expect(sch).toBeDefined();
    if (sch?.kind !== 'schbox') throw new Error('not schbox');
    expect(sch.fields).toEqual([
      { label: '사번', componentId: 'ibx_empCd' },
      { label: '부서', componentId: 'sbx_deptCd' },
    ]);
  });

  it('schbox labels는 하위호환 유지', () => {
    const xml = `<root>${SCHBOX_XML}</root>`;
    const regions = extractRegions(xml);
    const sch = regions.find(r => r.kind === 'schbox');
    if (sch?.kind !== 'schbox') throw new Error('not schbox');
    expect(sch.labels).toEqual(['사번', '부서']);
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test xml-region-parser`
Expected: 새 `fields` 테스트 FAIL (fields 미존재), `labels` 테스트는 PASS.

- [ ] **Step 3: SchboxRegion 타입에 fields 추가 + 추출 로직**

Edit `packages/figma-ingest/src/stage3/xml-region-parser.ts`.

`SchboxRegion` 인터페이스에 `fields` 추가 (labels 유지):

```typescript
export interface SchboxRegion {
  kind: 'schbox';
  labels: string[];
  fields: Array<{ label: string; componentId: string }>;
  innerXml: string;
  screenName?: string;
}
```

schbox 추출 블록에서 fields도 채움. 현재 schbox 처리에서 `labels`를 모으는 부분 근처에, 입력 컴포넌트(`xf:input`/`xf:select1`/`xf:select`/`w2:inputCalendar`/`w2:autoComplete`)를 순회하며 각 컴포넌트의 `label` 속성과 `id`를 페어링한다. label 속성이 없으면 같은 행(`tr` 또는 부모 그룹)의 인접 `w2:textbox` label로 fallback.

cheerio 기반 구현 (xml-region-parser는 tagName 비교 방식 사용 중 — 일관 유지). 기존 `extractRegions`의 schbox 푸시 부분을 다음으로 교체:

```typescript
  $('[class*="schbox"]').each((_, el) => {
    const $el = $(el);
    const cls = ($el.attr('class') || '').split(/\s+/);
    if (!cls.includes('schbox')) return;

    const labels: string[] = [];
    const fields: Array<{ label: string; componentId: string }> = [];

    // 모든 자손 순회 — tagName 기반 (cheerio xmlMode 네임스페이스 셀렉터 회피, Task 5 패턴)
    $el.find('*').each((_, node) => {
      const tag = tagNameOf(node);
      if (tag === 'w2:textbox') {
        const lbl = $(node).attr('label');
        if (lbl) labels.push(lbl);
      }
      const INPUT_TAGS = ['xf:input', 'xf:select1', 'xf:select', 'xf:textarea', 'w2:inputcalendar', 'w2:autocomplete'];
      if (INPUT_TAGS.includes(tag)) {
        const id = $(node).attr('id');
        if (!id) return;
        // label 우선순위: 컴포넌트 자체 label 속성 → 직전에 본 textbox label
        const ownLabel = $(node).attr('label');
        const label = ownLabel || labels[labels.length - 1] || '';
        fields.push({ label, componentId: id });
      }
    });

    regions.push({ kind: 'schbox', labels, fields, innerXml: $.xml($el), screenName });
  });
```

> `tagNameOf` 헬퍼는 Task 5(Phase 2A)에서 이미 이 파일에 정의돼 있음 (`el.tagName ?? el.name`, 소문자화). 재사용. INPUT_TAGS는 소문자로 비교 (tagNameOf가 소문자 반환).

> 주의: 골든의 input은 `label="사번"` 속성을 직접 가지므로 ownLabel 경로로 잡힘. textbox-fallback은 label 속성 없는 케이스 대비.

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test xml-region-parser`
Expected: 기존 + 신규 모두 PASS.

기존 prompt-builder 테스트도 깨지지 않았는지:
Run: `corepack pnpm --filter @kdh/figma-ingest test prompt-builder`
Expected: 6/6 PASS (labels 유지했으므로).

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build` (clean 확인)

```bash
git add packages/figma-ingest/src/stage3/xml-region-parser.ts packages/figma-ingest/tests/stage3/xml-region-parser.test.ts
git commit -m "feat(phase-2b): xml-region-parser schbox fields (label+componentId 페어링)"
```

---

### Task 2: IR 타입 + Zod 확장 (binding 힌트)

**Files:**
- Modify: `packages/figma-ingest/src/types.ts`
- Modify: `packages/figma-ingest/src/stage3/ir-schema.ts`
- Modify: `packages/figma-ingest/tests/stage3/ir-schema.test.ts`

- [ ] **Step 1: 테스트 추가 (binding 필드 허용)**

`packages/figma-ingest/tests/stage3/ir-schema.test.ts`의 `describe('dataCollectionSchema (Zod)', ...)` 안에 추가:

```typescript
  it('boundComponentId / sourceBodyId 힌트 허용 (optional)', () => {
    const valid = {
      dataMaps: [{
        id: 'dma_search', name: '검색',
        keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text', boundComponentId: 'edt_empCd' }],
      }],
      dataLists: [{
        id: 'dlt_list', name: '목록',
        columns: [{ id: 'EMP_CD', name: '사번', dataType: 'text', sourceBodyId: 'col_1' }],
      }],
      confidence: 0.9,
    };
    const parsed = validateDataCollection(valid);
    expect(parsed.dataMaps[0].keys[0].boundComponentId).toBe('edt_empCd');
    expect(parsed.dataLists[0].columns[0].sourceBodyId).toBe('col_1');
  });

  it('binding 힌트 없어도 통과 (하위호환)', () => {
    const valid = {
      dataMaps: [{ id: 'dma_search', name: 'X', keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }] }],
      dataLists: [],
      confidence: 0.9,
    };
    expect(() => validateDataCollection(valid)).not.toThrow();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test ir-schema`
Expected: `boundComponentId` 보존 테스트 FAIL (Zod가 unknown key를 strip하므로 undefined). 하위호환 테스트는 PASS.

- [ ] **Step 3: types.ts 확장**

Edit `packages/figma-ingest/src/types.ts` — 기존 인터페이스에 필드 추가:

```typescript
export interface DataMapKeyIR {
  id: string;
  name: string;
  dataType: 'text' | 'number' | 'date';
  boundComponentId?: string;  // Phase 2B — 바인딩될 컴포넌트 id (pre-rename, 예: "edt_empCd")
}

export interface DataListColumnIR {
  id: string;
  name: string;
  dataType: 'text' | 'number' | 'date';
  sourceBodyId?: string;      // Phase 2B — 원본 grid body 컬럼 id (예: "col_1")
}
```

- [ ] **Step 4: ir-schema.ts Zod 확장**

Edit `packages/figma-ingest/src/stage3/ir-schema.ts`:

`dataMapKeySchema`에 추가:
```typescript
const dataMapKeySchema = z.object({
  id: z.string().regex(UPPER_SNAKE, 'key.id는 UPPER_SNAKE_CASE여야 함'),
  name: z.string().min(1),
  dataType: dataTypeSchema,
  boundComponentId: z.string().optional(),
});
```

`dataListColumnSchema`에 추가:
```typescript
const dataListColumnSchema = z.object({
  id: z.string().regex(COLUMN_ID, 'column.id는 UPPER_SNAKE 또는 "chk"여야 함'),
  name: z.string().min(1),
  dataType: dataTypeSchema,
  sourceBodyId: z.string().optional(),
});
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test ir-schema`
Expected: 모든 ir-schema 테스트 PASS (기존 7 + 신규 2 = 9).

- [ ] **Step 6: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`

```bash
git add packages/figma-ingest/src/types.ts packages/figma-ingest/src/stage3/ir-schema.ts packages/figma-ingest/tests/stage3/ir-schema.test.ts
git commit -m "feat(phase-2b): IR에 boundComponentId/sourceBodyId 힌트 필드 + Zod optional"
```

---

### Task 3: prompt-builder — binding 힌트 요청

**Files:**
- Modify: `packages/figma-ingest/src/stage3/prompt-builder.ts`
- Modify: `packages/figma-ingest/tests/stage3/prompt-builder.test.ts`

- [ ] **Step 1: 테스트 추가**

`packages/figma-ingest/tests/stage3/prompt-builder.test.ts`의 regions fixture를 schbox가 `fields`를 갖도록 수정하고 테스트 추가. 기존 regions 변수 정의를 다음으로 교체 (fields 추가, labels 유지):

```typescript
const regions: Region[] = [
  {
    kind: 'schbox',
    labels: ['사번', '부서'],
    fields: [
      { label: '사번', componentId: 'edt_empCd' },
      { label: '부서', componentId: 'sel_deptCd' },
    ],
    innerXml: '<xf:group class="schbox">...</xf:group>',
    screenName: '사원 조회',
  },
  {
    kind: 'gvwbox',
    columns: [
      { label: '사번', bodyId: 'col_1' },
      { label: '성명', bodyId: 'col_2' },
    ],
    innerXml: '<xf:group class="gvwbox">...</xf:group>',
    screenName: '사원 조회',
  },
];
```

테스트 추가:

```typescript
  it('user prompt에 컴포넌트 id 노출 (binding 힌트용)', () => {
    const p = buildPrompt(regions);
    expect(p.user).toContain('edt_empCd');
    expect(p.user).toContain('sel_deptCd');
    expect(p.user).toContain('col_1');
  });

  it('system prompt가 binding 힌트 반환을 지시', () => {
    const p = buildPrompt(regions);
    const sys = p.system.map(b => b.text).join('\n');
    expect(sys).toContain('boundComponentId');
    expect(sys).toContain('sourceBodyId');
  });

  it('tool schema에 boundComponentId / sourceBodyId 속성', () => {
    const tool = submitDataCollectionTool;
    const keyProps = (tool.input_schema.properties.dataMaps as any).items.properties.keys.items.properties;
    const colProps = (tool.input_schema.properties.dataLists as any).items.properties.columns.items.properties;
    expect(keyProps.boundComponentId).toBeDefined();
    expect(colProps.sourceBodyId).toBeDefined();
  });
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test prompt-builder`
Expected: 새 3개 FAIL (컴포넌트 id 미노출, system 미지시, tool schema 미존재). 기존 6개는 fields 추가 후에도 통과해야 함 (regions에 fields 추가했지만 labels도 유지).

- [ ] **Step 3: tool schema에 binding 필드 추가**

Edit `packages/figma-ingest/src/stage3/prompt-builder.ts`.

`submitDataCollectionTool`의 dataMaps.items.properties.keys.items.properties에 추가:
```typescript
                  boundComponentId: { type: 'string', description: '이 key가 바인딩될 컴포넌트 id (예: edt_empCd) — schbox 영역에 표시된 component id 사용' },
```
(keys.items.required는 그대로 `['id', 'name', 'dataType']` — boundComponentId는 optional)

dataLists.items.properties.columns.items.properties에 추가:
```typescript
                  sourceBodyId: { type: 'string', description: '원본 grid body 컬럼 id (예: col_1) — gvwbox 영역에 표시된 body id 사용' },
```
(columns.items.required도 그대로)

- [ ] **Step 4: SYSTEM_INSTRUCTIONS에 binding 지시 추가**

`SYSTEM_INSTRUCTIONS` 문자열의 "## 작업 절차" 섹션 직전에 추가:

```
## 바인딩 힌트 (Phase 2B)
- 각 DataMap key에는 그 값이 입력될 컴포넌트 id를 `boundComponentId`로 함께 반환하라. schbox 영역에 "(component: edt_empCd)"로 표시된 id를 사용.
- 각 DataList 컬럼에는 대응하는 grid body 컬럼 id를 `sourceBodyId`로 반환하라. gvwbox 영역에 "(body id: col_1)"로 표시된 id를 사용.
- 컴포넌트 id를 모르면 해당 힌트는 생략 가능 (시스템이 라벨/위치로 fallback).
```

- [ ] **Step 5: buildPrompt 유저 프롬프트에 컴포넌트 id 노출**

`buildPrompt`의 schbox 처리 부분 (`라벨 목록: ...` 출력)을 fields 기반으로 교체:

```typescript
    schboxes.forEach((r, i) => {
      if (r.kind !== 'schbox') return;
      parts.push(`\n## 검색조건 영역 ${i + 1} (schbox)`);
      const fieldDesc = r.fields.length > 0
        ? r.fields.map(f => `${f.label} (component: ${f.componentId})`).join(', ')
        : r.labels.join(', ');
      parts.push(`필드: ${fieldDesc}`);
    });
```

gvwbox 처리는 이미 `${c.label} (body id: ${c.bodyId})`를 출력하므로 변경 불필요 (Task 6 Phase 2A에서 확인).

- [ ] **Step 6: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test prompt-builder`
Expected: 9개 모두 PASS.

- [ ] **Step 7: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`

```bash
git add packages/figma-ingest/src/stage3/prompt-builder.ts packages/figma-ingest/tests/stage3/prompt-builder.test.ts
git commit -m "feat(phase-2b): prompt-builder가 binding 힌트 요청 (컴포넌트 id 노출 + tool schema)"
```

---

### Task 4: ref-binder

**Files:**
- Create: `packages/figma-ingest/src/stage3/ref-binder.ts`
- Create: `packages/figma-ingest/tests/stage3/ref-binder.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/ref-binder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { bindRefs } from '../../src/stage3/ref-binder';
import type { DataCollectionIR } from '../../src/types';

// schbox 컴포넌트가 label 속성을 가진 최소 XML
const XML = `<root>
  <xf:group class="schbox">
    <xf:group class="w2tb_th"><w2:textbox label="사번"/></xf:group>
    <xf:input id="edt_empCd" label="사번"/>
    <xf:group class="w2tb_th"><w2:textbox label="부서"/></xf:group>
    <xf:select1 id="sel_deptCd" label="부서"/>
  </xf:group>
</root>`;

function ir(keys: any[]): DataCollectionIR {
  return { dataMaps: [{ id: 'dma_search', name: '검색', keys }], dataLists: [], confidence: 0.9 };
}

describe('bindRefs', () => {
  it('boundComponentId 힌트로 ref 부착', () => {
    const out = bindRefs(XML, ir([
      { id: 'EMP_CD', name: '사번', dataType: 'text', boundComponentId: 'edt_empCd' },
    ]));
    expect(out).toMatch(/<xf:input id="edt_empCd"[^>]*ref="data:dma_search\.EMP_CD"/);
  });

  it('boundComponentId 없으면 label==key.name 매칭 fallback', () => {
    const out = bindRefs(XML, ir([
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
    ]));
    expect(out).toMatch(/<xf:input id="edt_empCd"[^>]*ref="data:dma_search\.EMP_CD"/);
  });

  it('라벨 불일치 케이스 — boundComponentId가 구원 (부서 vs 부서 코드)', () => {
    const out = bindRefs(XML, ir([
      { id: 'DEPT_CD', name: '부서 코드', dataType: 'text', boundComponentId: 'sel_deptCd' },
    ]));
    // label "부서" != name "부서 코드" 이지만 boundComponentId로 정확히 바인딩
    expect(out).toMatch(/<xf:select1 id="sel_deptCd"[^>]*ref="data:dma_search\.DEPT_CD"/);
  });

  it('이미 ref 있으면 보존 (덮어쓰지 않음)', () => {
    const xmlWithRef = `<root><xf:input id="edt_empCd" ref="data:existing.X" label="사번"/></root>`;
    const out = bindRefs(xmlWithRef, ir([
      { id: 'EMP_CD', name: '사번', dataType: 'text', boundComponentId: 'edt_empCd' },
    ]));
    expect(out).toContain('ref="data:existing.X"');
    expect(out).not.toContain('data:dma_search.EMP_CD');
  });

  it('DataMap 없으면 원본 그대로', () => {
    const noMap: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 1 };
    expect(bindRefs(XML, noMap)).toBe(XML);
  });

  it('매칭 컴포넌트 없으면 해당 key skip (crash 없음)', () => {
    const out = bindRefs(XML, ir([
      { id: 'NOPE', name: '없는필드', dataType: 'text', boundComponentId: 'edt_nonexist' },
    ]));
    // edt_nonexist 없음 → ref 미부착, 다른 부분 보존
    expect(out).not.toContain('edt_nonexist');
    expect(out).toContain('id="edt_empCd"');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test ref-binder`
Expected: FAIL (`Cannot find module`)

- [ ] **Step 3: ref-binder.ts 구현**

Create `packages/figma-ingest/src/stage3/ref-binder.ts`:

```typescript
/**
 * Stage 3.5 — schbox 입력 컴포넌트에 ref="data:dma_search.{KEY}" 바인딩.
 *
 * 매칭 우선순위 (각 DataMap key):
 *   1. key.boundComponentId (LLM 힌트)
 *   2. label == key.name 인 schbox field
 *   3. 위치 fallback (i번째 field)
 *   4. 다 실패 → skip
 *
 * 주의: 이 단계는 Phase 1 rename 이전 — 컴포넌트 id는 pre-rename(edt_/sel_).
 */
import { extractRegions } from './xml-region-parser';
import type { DataCollectionIR } from '../types';

const INPUT_TAGS = '(?:xf:input|xf:select1|xf:select|xf:textarea|w2:inputCalendar|w2:autoComplete)';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 컴포넌트 여는 태그를 찾아 ref가 없으면 id 속성 뒤에 삽입. */
function addRefToComponent(xml: string, componentId: string, refValue: string): string {
  const re = new RegExp(
    `(<${INPUT_TAGS}\\b[^>]*?\\bid="${escapeRegex(componentId)}")([^>]*?)(\\/?>)`,
  );
  return xml.replace(re, (full, head, mid, close) => {
    if (/\bref\s*=/.test(head) || /\bref\s*=/.test(mid)) return full; // 이미 ref → 보존
    return `${head} ref="${refValue}"${mid}${close}`;
  });
}

export function bindRefs(xml: string, ir: DataCollectionIR): string {
  if (ir.dataMaps.length === 0) return xml;

  const regions = extractRegions(xml);
  const fields = regions
    .filter((r): r is Extract<typeof r, { kind: 'schbox' }> => r.kind === 'schbox')
    .flatMap(r => r.fields);

  let result = xml;
  for (const dm of ir.dataMaps) {
    dm.keys.forEach((key, i) => {
      let targetId = key.boundComponentId;
      if (!targetId) {
        const byLabel = fields.find(f => f.label === key.name);
        targetId = byLabel?.componentId ?? fields[i]?.componentId;
      }
      if (targetId) {
        result = addRefToComponent(result, targetId, `data:${dm.id}.${key.id}`);
      }
    });
  }
  return result;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test ref-binder`
Expected: 6개 PASS.

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`

```bash
git add packages/figma-ingest/src/stage3/ref-binder.ts packages/figma-ingest/tests/stage3/ref-binder.test.ts
git commit -m "feat(phase-2b): ref-binder — schbox input에 data ref 바인딩 (힌트+fallback)"
```

---

### Task 5: grid-reconciler

**Files:**
- Create: `packages/figma-ingest/src/stage3/grid-reconciler.ts`
- Create: `packages/figma-ingest/tests/stage3/grid-reconciler.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/grid-reconciler.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { reconcileGrids } from '../../src/stage3/grid-reconciler';
import type { DataCollectionIR } from '../../src/types';

const GRID_XML = `<root>
  <w2:gridView ctype="IBSheet" id="grd_007" style="width:100%;">
    <w2:header id="header1"><w2:row>
      <w2:column id="column1" inputType="text" value="사번" width="100"></w2:column>
      <w2:column id="column2" inputType="text" value="성명" width="100"></w2:column>
      <w2:column id="column3" inputType="text" value="부서명" width="100"></w2:column>
    </w2:row></w2:header>
    <w2:gBody id="gBody1"><w2:row>
      <w2:column id="col_1" inputType="text" width="100"></w2:column>
      <w2:column id="col_2" inputType="text" width="100"></w2:column>
      <w2:column id="col_3" inputType="text" width="100"></w2:column>
    </w2:row></w2:gBody>
  </w2:gridView>
</root>`;

function ir(columns: any[]): DataCollectionIR {
  return {
    dataMaps: [],
    dataLists: [{ id: 'dlt_list', name: '목록', columns }],
    confidence: 0.9,
  };
}

const COLS = [
  { id: 'EMP_CD', name: '사번', dataType: 'text' },
  { id: 'EMP_NM', name: '성명', dataType: 'text' },
  { id: 'DEPT_NM', name: '부서명', dataType: 'text' },
];

describe('reconcileGrids', () => {
  it('gridView에 dataList= 추가', () => {
    const out = reconcileGrids(GRID_XML, ir(COLS));
    expect(out).toMatch(/<w2:gridView[^>]*dataList="data:dlt_list"/);
  });

  it('body 컬럼 id를 DataList 컬럼 id로 정렬 (위치순)', () => {
    const out = reconcileGrids(GRID_XML, ir(COLS));
    // gBody 안의 col_1/col_2/col_3 → EMP_CD/EMP_NM/DEPT_NM
    expect(out).not.toContain('id="col_1"');
    expect(out).toMatch(/<w2:gBody[\s\S]*id="EMP_CD"[\s\S]*id="EMP_NM"[\s\S]*id="DEPT_NM"[\s\S]*<\/w2:gBody>/);
  });

  it('header 컬럼 id도 동일하게 정렬', () => {
    const out = reconcileGrids(GRID_XML, ir(COLS));
    expect(out).not.toContain('id="column1"');
    expect(out).toMatch(/<w2:header[\s\S]*id="EMP_CD"[\s\S]*id="EMP_NM"[\s\S]*id="DEPT_NM"[\s\S]*<\/w2:header>/);
  });

  it('header value(표시 라벨)는 보존', () => {
    const out = reconcileGrids(GRID_XML, ir(COLS));
    expect(out).toContain('value="사번"');
    expect(out).toContain('value="성명"');
  });

  it('DataList 없으면 원본 그대로', () => {
    const noList: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 1 };
    expect(reconcileGrids(GRID_XML, noList)).toBe(GRID_XML);
  });

  it('이미 dataList= 있으면 중복 추가 안 함', () => {
    const xml = GRID_XML.replace('<w2:gridView ', '<w2:gridView dataList="data:dlt_existing" ');
    const out = reconcileGrids(xml, ir(COLS));
    expect((out.match(/dataList=/g) || []).length).toBe(1);
    expect(out).toContain('dataList="data:dlt_existing"');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test grid-reconciler`
Expected: FAIL

- [ ] **Step 3: grid-reconciler.ts 구현**

Create `packages/figma-ingest/src/stage3/grid-reconciler.ts`:

```typescript
/**
 * Stage 3.5 — gridView를 DataList에 바인딩.
 *  1. <w2:gridView>에 dataList="data:{dlt_id}" 추가
 *  2. header / gBody 컬럼 id를 DataList 컬럼 id로 위치순 정렬
 *     (DataList 컬럼은 LLM이 grid header 순서대로 생성하므로 위치 정렬이 정합)
 *
 * 단일 DataList 가정 (2B). 다중 DataList는 향후.
 */
import type { DataCollectionIR, DataListIR } from '../types';

/** 한 블록(header row 또는 gBody row) 내 <w2:column>의 id를 위치순으로 교체. */
function rewriteColumnIds(block: string, dl: DataListIR): string {
  let i = 0;
  return block.replace(
    /(<w2:column\b[^>]*?\bid=")[^"]*("[^>]*?\/?>)/g,
    (full, head, tail) => {
      const col = dl.columns[i];
      i++;
      if (!col) return full; // DataList 컬럼보다 많은 그리드 컬럼은 그대로
      return `${head}${col.id}${tail}`;
    },
  );
}

export function reconcileGrids(xml: string, ir: DataCollectionIR): string {
  if (ir.dataLists.length === 0) return xml;
  const dl = ir.dataLists[0];

  return xml.replace(
    /(<w2:gridView\b)([^>]*)(>)([\s\S]*?)(<\/w2:gridView>)/g,
    (full, open, attrs, openClose, inner, closeTag) => {
      // 1. dataList= 추가 (없을 때만)
      let newAttrs = attrs;
      if (!/\bdataList\s*=/.test(attrs)) {
        newAttrs = `${attrs} dataList="data:${dl.id}"`;
      }
      // 2. header / gBody 컬럼 id 정렬
      let newInner = inner.replace(
        /(<w2:header\b[^>]*>)([\s\S]*?)(<\/w2:header>)/,
        (m: string, h: string, body: string, c: string) => `${h}${rewriteColumnIds(body, dl)}${c}`,
      );
      newInner = newInner.replace(
        /(<w2:gBody\b[^>]*>)([\s\S]*?)(<\/w2:gBody>)/,
        (m: string, h: string, body: string, c: string) => `${h}${rewriteColumnIds(body, dl)}${c}`,
      );
      return `${open}${newAttrs}${openClose}${newInner}${closeTag}`;
    },
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test grid-reconciler`
Expected: 6개 PASS.

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`

```bash
git add packages/figma-ingest/src/stage3/grid-reconciler.ts packages/figma-ingest/tests/stage3/grid-reconciler.test.ts
git commit -m "feat(phase-2b): grid-reconciler — gridView dataList= + 컬럼 id 위치 정렬"
```

---

### Task 6: submission-generator

**Files:**
- Create: `packages/figma-ingest/src/stage3/submission-generator.ts`
- Create: `packages/figma-ingest/tests/stage3/submission-generator.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/submission-generator.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { generateSubmissions } from '../../src/stage3/submission-generator';
import type { DataCollectionIR } from '../../src/types';

const MODEL_XML = `<root>
  <xf:model>
    <w2:dataCollection baseNode="map">
      <w2:dataMap id="dma_search"/>
    </w2:dataCollection>
  </xf:model>
</root>`;

describe('generateSubmissions', () => {
  it('DataMap+DataList 있으면 submission 생성 (ref/target/action)', () => {
    const ir: DataCollectionIR = {
      dataMaps: [{ id: 'dma_search', name: '검색', keys: [] }],
      dataLists: [{ id: 'dlt_list', name: '목록', columns: [] }],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    expect(out).toContain('<xf:submission id="sbm_search"');
    expect(out).toContain('ref="data:json,dma_search"');
    expect(out).toContain('target="data:json,dlt_list"');
    expect(out).toContain('action="/TODO_VERIFY"');
    expect(out).toContain('ev:submitdone="scwin.sbm_search_submitdone"');
    expect(out).toContain('TODO: [서버 확인]');
  });

  it('DataList 없으면 target 생략', () => {
    const ir: DataCollectionIR = {
      dataMaps: [{ id: 'dma_search', name: '검색', keys: [] }],
      dataLists: [],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    expect(out).toContain('<xf:submission id="sbm_search"');
    expect(out).not.toContain('target=');
  });

  it('DataMap 없으면 submission 생략 (마스터-디테일)', () => {
    const ir: DataCollectionIR = {
      dataMaps: [],
      dataLists: [{ id: 'dlt_memberBasic', name: '목록', columns: [] }],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    expect(out).toBe(MODEL_XML);
  });

  it('submission은 </w2:dataCollection> 뒤에 주입', () => {
    const ir: DataCollectionIR = {
      dataMaps: [{ id: 'dma_search', name: '검색', keys: [] }],
      dataLists: [{ id: 'dlt_list', name: '목록', columns: [] }],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    const dcEnd = out.indexOf('</w2:dataCollection>');
    const sbm = out.indexOf('<xf:submission');
    expect(sbm).toBeGreaterThan(dcEnd);
    expect(out.indexOf('</xf:model>')).toBeGreaterThan(sbm);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test submission-generator`
Expected: FAIL

- [ ] **Step 3: submission-generator.ts 구현**

Create `packages/figma-ingest/src/stage3/submission-generator.ts`:

```typescript
/**
 * Stage 3.5 — <xf:submission> 선언 생성 + <xf:model>에 주입.
 *
 * DataMap이 있으면 조회 submission(sbm_search) 생성:
 *   - ref  = data:json,{첫 DataMap id}
 *   - target = data:json,{첫 DataList id}  (DataList 있을 때만)
 *   - action = /TODO_VERIFY (placeholder, DL-08 주석 동반)
 *   - ev:submitdone = scwin.sbm_search_submitdone (핸들러는 Plan 2C)
 * DataMap 없으면 생략.
 *
 * </w2:dataCollection> 바로 뒤에 주입 (xf:model 안).
 */
import type { DataCollectionIR } from '../types';

export function generateSubmissions(xml: string, ir: DataCollectionIR): string {
  if (ir.dataMaps.length === 0) return xml;

  const dm = ir.dataMaps[0];
  const target = ir.dataLists.length > 0 ? ` target="data:json,${ir.dataLists[0].id}"` : '';

  const block =
    `\n\t\t\t<!-- TODO: [서버 확인] action URL("/TODO_VERIFY") 확인 필요 -->\n` +
    `\t\t\t<xf:submission id="sbm_search" ref="data:json,${dm.id}"${target}` +
    ` action="/TODO_VERIFY" method="post" mediatype="application/json"` +
    ` ev:submitdone="scwin.sbm_search_submitdone"/>`;

  if (!/<\/w2:dataCollection>/.test(xml)) {
    return xml; // dataCollection 없으면 주입 위치 불명 → no-op
  }
  return xml.replace(/(<\/w2:dataCollection>)/, `$1${block}`);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test submission-generator`
Expected: 4개 PASS.

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`

```bash
git add packages/figma-ingest/src/stage3/submission-generator.ts packages/figma-ingest/tests/stage3/submission-generator.test.ts
git commit -m "feat(phase-2b): submission-generator — sbm_search 선언 + xf:model 주입"
```

---

### Task 7: data-binder orchestrator

**Files:**
- Create: `packages/figma-ingest/src/stage3/data-binder.ts`
- Create: `packages/figma-ingest/tests/stage3/data-binder.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/data-binder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { bindDataCollection } from '../../src/stage3/data-binder';
import type { DataCollectionIR } from '../../src/types';

const FULL_XML = `<root>
  <xf:model>
    <w2:dataCollection baseNode="map">
      <w2:dataMap id="dma_search"/>
    </w2:dataCollection>
  </xf:model>
  <xf:group class="schbox">
    <xf:input id="edt_empCd" label="사번"/>
  </xf:group>
  <w2:gridView id="grd_007">
    <w2:header id="h1"><w2:row><w2:column id="column1" value="사번"></w2:column></w2:row></w2:header>
    <w2:gBody id="b1"><w2:row><w2:column id="col_1"></w2:column></w2:row></w2:gBody>
  </w2:gridView>
</root>`;

const IR: DataCollectionIR = {
  dataMaps: [{ id: 'dma_search', name: '검색',
    keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text', boundComponentId: 'edt_empCd' }] }],
  dataLists: [{ id: 'dlt_list', name: '목록',
    columns: [{ id: 'EMP_CD', name: '사번', dataType: 'text', sourceBodyId: 'col_1' }] }],
  confidence: 0.9,
};

describe('bindDataCollection (Stage 3.5 orchestrator)', () => {
  it('ref + grid 정렬 + submission 모두 적용', () => {
    const out = bindDataCollection(FULL_XML, IR);
    // ref
    expect(out).toMatch(/<xf:input id="edt_empCd"[^>]*ref="data:dma_search\.EMP_CD"/);
    // grid dataList + 컬럼 정렬
    expect(out).toMatch(/<w2:gridView[^>]*dataList="data:dlt_list"/);
    expect(out).toContain('id="EMP_CD"');
    expect(out).not.toContain('id="col_1"');
    // submission
    expect(out).toContain('<xf:submission id="sbm_search"');
  });

  it('빈 IR이면 원본 거의 그대로 (submission/ref 없음)', () => {
    const empty: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 1 };
    const out = bindDataCollection(FULL_XML, empty);
    expect(out).not.toContain('ref="data:');
    expect(out).not.toContain('<xf:submission');
    expect(out).not.toContain('dataList="data:');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test data-binder`
Expected: FAIL

- [ ] **Step 3: data-binder.ts 구현**

Create `packages/figma-ingest/src/stage3/data-binder.ts`:

```typescript
/**
 * Stage 3.5 orchestrator — 채워진 DataCollection IR을 화면 컴포넌트에 바인딩.
 * 순서: ref 부착 → grid 정렬 → submission 주입.
 */
import { bindRefs } from './ref-binder';
import { reconcileGrids } from './grid-reconciler';
import { generateSubmissions } from './submission-generator';
import type { DataCollectionIR } from '../types';

export function bindDataCollection(xml: string, ir: DataCollectionIR): string {
  let result = bindRefs(xml, ir);
  result = reconcileGrids(result, ir);
  result = generateSubmissions(result, ir);
  return result;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test data-binder`
Expected: 2개 PASS.

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`

```bash
git add packages/figma-ingest/src/stage3/data-binder.ts packages/figma-ingest/tests/stage3/data-binder.test.ts
git commit -m "feat(phase-2b): data-binder Stage 3.5 orchestrator (ref→grid→submission)"
```

---

### Task 8: pipeline Stage 3.5 wiring

**Files:**
- Modify: `packages/figma-ingest/src/pipeline.ts`
- Create: `packages/figma-ingest/tests/stage3/pipeline-stage35.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/pipeline-stage35.test.ts`:

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

// boundComponentId는 pre-rename id (edt_/sel_), sourceBodyId는 col_N
const IR: DataCollectionIR = {
  dataMaps: [{ id: 'dma_search', name: '검색조건', keys: [
    { id: 'EMP_CD', name: '사번', dataType: 'text', boundComponentId: 'edt_empCd' },
    { id: 'DEPT_CD', name: '부서 코드', dataType: 'text', boundComponentId: 'sel_deptCd' },
  ] }],
  dataLists: [{ id: 'dlt_list', name: '사원목록', columns: [
    { id: 'EMP_CD', name: '사번', dataType: 'text', sourceBodyId: 'col_1' },
    { id: 'EMP_NM', name: '성명', dataType: 'text', sourceBodyId: 'col_2' },
    { id: 'DEPT_NM', name: '부서명', dataType: 'text', sourceBodyId: 'col_3' },
  ] }],
  confidence: 0.9,
};

describe('pipeline Stage 3.5 binding (Mock LLM)', () => {
  afterAll(async () => { await closeBrowser(); });

  it('최종 출력에 ref + dataList + submission (Phase 1 rename 후)', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('simple-form', IR);
    const xml = await convertHtmlToWebSquare(simpleFormHtml, { llmClient: mock });

    // Phase 1 rename 후 컴포넌트 id는 ibx_/sbx_, ref는 보존
    expect(xml).toMatch(/<xf:input id="ibx_empCd"[^>]*ref="data:dma_search\.EMP_CD"/);
    expect(xml).toMatch(/<xf:select1 id="sbx_deptCd"[^>]*ref="data:dma_search\.DEPT_CD"/);
    // grid
    expect(xml).toMatch(/<w2:gridView[^>]*dataList="data:dlt_list"/);
    expect(xml).not.toContain('id="col_1"');
    // submission
    expect(xml).toContain('<xf:submission id="sbm_search"');
  }, 60000);

  it('noLlm: true → Stage 3.5 skip (ref/submission 없음)', async () => {
    const xml = await convertHtmlToWebSquare(simpleFormHtml, { noLlm: true });
    expect(xml).not.toContain('ref="data:dma_search');
    expect(xml).not.toContain('<xf:submission');
  }, 60000);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline-stage35`
Expected: 첫 테스트 FAIL (Stage 3.5 미연결 → ref 없음), noLlm 테스트는 PASS.

- [ ] **Step 3: pipeline.ts에 Stage 3.5 연결**

Edit `packages/figma-ingest/src/pipeline.ts`.

import 추가:
```typescript
import { bindDataCollection } from './stage3/data-binder';
```

Stage 3 블록을 다음으로 교체 (injectDataCollection 다음 줄에 bindDataCollection 추가):
```typescript
  // Stage 3: LLM Semantic Enricher (skip if --no-llm or no llmClient)
  let enrichedXml = relativeXml;
  if (!options.noLlm && options.llmClient) {
    const ir = await inferDataCollection(relativeXml, options.llmClient);
    enrichedXml = injectDataCollection(relativeXml, ir);
    enrichedXml = bindDataCollection(enrichedXml, ir);   // Stage 3.5: ref + grid + submission
    options.onStage?.('stage3-enriched', { ir, xml: enrichedXml });
  }
```

(docblock의 단계 설명에도 Stage 3.5 추가)

- [ ] **Step 4: 빌드 + 테스트 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest build` (clean)
Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline-stage35`
Expected: 2개 PASS.

전체 회귀:
Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 골든 회귀가 **FAIL할 수 있음** — 골든은 Task 9에서 binding 힌트 추가 + Task 10에서 재생성하기 전까지 옛 mock(힌트 없음)으로 생성된 상태. 단, golden.regression.test.ts는 `tests/fixtures/llm-responses/*.json`을 mock 응답으로 쓰는데, 그 json에 binding 힌트가 아직 없으므로 ref-binder가 label/위치 fallback으로 ref를 부착 → 출력이 기존 골든과 달라짐. **이 경우 골든 회귀 3개 FAIL이 예상됨** → Task 10에서 해결. report에 명시하고 진행.

만약 골든 외 다른 테스트가 깨지면 그건 진짜 문제 → 조사.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/src/pipeline.ts packages/figma-ingest/tests/stage3/pipeline-stage35.test.ts
git commit -m "feat(phase-2b): pipeline에 Stage 3.5(bindDataCollection) 연결

- Stage 3 inject 다음에 bindDataCollection 호출
- noLlm/llmClient 없으면 skip (Phase 0+1 동작)
- 골든 회귀는 Task 9(힌트)+Task 10(재생성)에서 정합"
```

---

### Task 9: mock fixtures에 binding 힌트 추가 + E2E

**Files:**
- Modify: `packages/figma-ingest/tests/fixtures/llm-responses/simple-form.json`
- Modify: `packages/figma-ingest/tests/fixtures/llm-responses/search-grid.json`
- Modify: `packages/figma-ingest/tests/fixtures/llm-responses/master-detail.json`
- Modify: `packages/figma-ingest/tests/pipeline.e2e.test.ts`

- [ ] **Step 1: 실제 pre-rename 컴포넌트 id 확인**

각 fixture의 schbox 컴포넌트 id와 grid body id를 정확히 알아야 binding 힌트가 정합한다. 스크래치 스크립트로 Stage 2 출력을 캡처:

Create temp `packages/figma-ingest/scripts/inspect-ids.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../src/pipeline';
import { closeBrowser } from '../src/dom-extractor';

const FIX = path.join(__dirname, '..', 'tests', 'fixtures');
async function main() {
  for (const name of ['simple-form', 'search-grid', 'master-detail']) {
    const html = fs.readFileSync(path.join(FIX, `${name}.html`), 'utf-8');
    await convertHtmlToWebSquare(html, {
      noLlm: true,
      onStage: (stage, payload) => {
        if (stage === 'stage2-relative') {
          const xml = payload as string;
          const inputs = [...xml.matchAll(/<(?:xf:input|xf:select1|xf:select)\b[^>]*\bid="([^"]+)"[^>]*?(?:label="([^"]*)")?/g)]
            .map(m => `${m[1]}${m[2] ? ` (label=${m[2]})` : ''}`);
          const bodyCols = [...xml.matchAll(/<w2:gBody[\s\S]*?<\/w2:gBody>/g)]
            .flatMap(b => [...b[0].matchAll(/<w2:column\b[^>]*\bid="([^"]+)"/g)].map(m => m[1]));
          console.log(`\n=== ${name} ===`);
          console.log('schbox/inputs:', inputs);
          console.log('grid body cols:', bodyCols);
        }
      },
    });
  }
  await closeBrowser();
}
main().catch(e => { console.error(e); process.exit(1); });
```

Run (build 먼저 — dist import 회피 위해 tsx로 src 직접; dom-extractor `__name` 이슈 있으면 dist 경유):
```
corepack pnpm --filter @kdh/figma-ingest build
cd packages/figma-ingest && corepack pnpm exec tsx scripts/inspect-ids.ts ; cd ../..
```

만약 tsx가 dom-extractor `__name` 에러를 내면, 스크립트 import를 `../dist/pipeline.js` / `../dist/dom-extractor.js`로 바꿔서 재실행 (Task 12 Phase 2A에서 확인된 회피책).

출력에서 각 fixture의 input id (예: `edt_empCd`, `sel_deptCd`, `cal_orderDate`)와 body col id (`col_1`...)를 기록.

- [ ] **Step 2: 확인된 id로 fixture 갱신**

Step 1에서 얻은 실제 id로 3개 json에 `boundComponentId`/`sourceBodyId` 추가.

`simple-form.json` (관찰된 id 기준 — 보통 edt_empCd/sel_deptCd, col_1~3):
```json
{
  "dataMaps": [{
    "id": "dma_search", "name": "검색조건",
    "keys": [
      { "id": "EMP_CD", "name": "사번", "dataType": "text", "boundComponentId": "edt_empCd" },
      { "id": "DEPT_CD", "name": "부서 코드", "dataType": "text", "boundComponentId": "sel_deptCd" }
    ]
  }],
  "dataLists": [{
    "id": "dlt_list", "name": "사원목록", "saveRemovedData": true,
    "columns": [
      { "id": "EMP_CD", "name": "사번", "dataType": "text", "sourceBodyId": "col_1" },
      { "id": "EMP_NM", "name": "성명", "dataType": "text", "sourceBodyId": "col_2" },
      { "id": "DEPT_NM", "name": "부서명", "dataType": "text", "sourceBodyId": "col_3" }
    ]
  }],
  "confidence": 0.9,
  "notes": "simple-form: binding 힌트 포함"
}
```

`search-grid.json` — Step 1에서 얻은 id로 (예상: edt_orderNo, cal_orderDate; body col_1~3):
```json
{
  "dataMaps": [{
    "id": "dma_search", "name": "주문조회 조건",
    "keys": [
      { "id": "ORDER_NO", "name": "주문번호", "dataType": "text", "boundComponentId": "edt_orderNo" },
      { "id": "ORDER_DATE", "name": "주문일", "dataType": "date", "boundComponentId": "cal_orderDate" }
    ]
  }],
  "dataLists": [{
    "id": "dlt_orderList", "name": "주문목록", "saveRemovedData": true,
    "columns": [
      { "id": "ORDER_NO", "name": "주문번호", "dataType": "text", "sourceBodyId": "col_1" },
      { "id": "ORDER_DATE", "name": "주문일", "dataType": "date", "sourceBodyId": "col_2" },
      { "id": "AMOUNT", "name": "금액", "dataType": "number", "sourceBodyId": "col_3" }
    ]
  }],
  "confidence": 0.92,
  "notes": "search-grid: binding 힌트 포함"
}
```
> Step 1의 실제 id와 다르면 그 값으로 맞출 것. `boundComponentId`/`sourceBodyId`가 실제 id와 안 맞아도 binder의 label/위치 fallback이 동작하므로 ref/정렬 자체는 되지만, 정확한 id를 넣어야 boundComponentId 경로가 검증됨.

`master-detail.json` — DataMap 없음 유지 (dataLists만), columns에 sourceBodyId 추가 (Step 1에서 얻은 body col id):
```json
{
  "dataMaps": [],
  "dataLists": [{
    "id": "dlt_memberBasic", "name": "사원목록", "saveRemovedData": true,
    "columns": [
      { "id": "EMP_CD", "name": "사번", "dataType": "text", "sourceBodyId": "col_1" },
      { "id": "EMP_NM", "name": "성명", "dataType": "text", "sourceBodyId": "col_2" },
      { "id": "DEPT_NM", "name": "부서명", "dataType": "text", "sourceBodyId": "col_3" }
    ]
  }],
  "confidence": 0.85,
  "notes": "master-detail: DataList만, DataMap 없음 → submission 생략"
}
```

- [ ] **Step 3: E2E 테스트에 바인딩 검증 추가**

`packages/figma-ingest/tests/pipeline.e2e.test.ts`의 Stage 3 describe 블록(2A에서 추가됨) 안에 바인딩 검증 it 추가:

```typescript
  it('simple-form: ref 바인딩 + grid dataList + submission (Phase 2B)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });
    expect(xml).toMatch(/<xf:input id="ibx_empCd"[^>]*ref="data:dma_search\.EMP_CD"/);
    expect(xml).toMatch(/<xf:select1 id="sbx_deptCd"[^>]*ref="data:dma_search\.DEPT_CD"/);
    expect(xml).toMatch(/<w2:gridView[^>]*dataList="data:dlt_list"/);
    expect(xml).toContain('<xf:submission id="sbm_search"');
    expect(xml).not.toContain('id="col_1"');
  }, 60000);

  it('master-detail: grid 바인딩 O, submission 생략 (DataMap 없음)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'master-detail.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('master-detail') });
    expect(xml).toMatch(/<w2:gridView[^>]*dataList="data:dlt_memberBasic"/);
    expect(xml).not.toContain('<xf:submission');
  }, 60000);
```

> `makeMock` 헬퍼는 2A의 pipeline.e2e.test.ts에 이미 정의됨. `ibx_empCd`/`sbx_deptCd`는 Phase 1 rename 후 최종 id.

- [ ] **Step 4: E2E 실행**

Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline.e2e`
Expected: 기존 + 신규 모두 PASS. (만약 boundComponentId가 실제 pre-rename id와 안 맞으면 fallback으로라도 ref 부착되므로 ref 존재 검증은 통과. select1의 정확 매칭이 안 되면 Step 2의 id를 재확인.)

- [ ] **Step 5: 스크래치 스크립트 삭제 + 커밋**

```
rm packages/figma-ingest/scripts/inspect-ids.ts
git add packages/figma-ingest/tests/fixtures/llm-responses/ packages/figma-ingest/tests/pipeline.e2e.test.ts
git commit -m "test(phase-2b): mock fixtures에 binding 힌트 + E2E 바인딩 검증"
```

---

### Task 10: 골든 재생성 + 전체 회귀 + final

**Files:**
- Modify: `packages/figma-ingest/tests/golden/*.expected.xml`

- [ ] **Step 1: 골든 재생성**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
Run: `corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate`
Expected: 3개 골든 재생성, char count 출력 (Phase 2A보다 커짐 — ref/dataList/submission 추가).

- [ ] **Step 2: 골든 검토**

각 골든을 Read로 열어 확인:
- `simple-form.expected.xml`: `<xf:input id="ibx_empCd" ... ref="data:dma_search.EMP_CD">`, `<xf:select1 id="sbx_deptCd" ... ref="data:dma_search.DEPT_CD">`, `<w2:gridView ... dataList="data:dlt_list">`, body/header 컬럼 id가 EMP_CD/EMP_NM/DEPT_NM, `<xf:submission id="sbm_search">`
- `search-grid.expected.xml`: 유사 + ORDER_DATE date, AMOUNT number
- `master-detail.expected.xml`: gridView dataList="data:dlt_memberBasic", submission 없음

XML well-formed 확인 (들여쓰기 탭/스페이스 섞임 무방). 합리적이면 채택.

**부서/부서코드 케이스 검증**: sbx_deptCd에 `ref="data:dma_search.DEPT_CD"`가 정확히 붙었는지 (라벨 "부서" ≠ key name "부서 코드"인데 boundComponentId 힌트로 바인딩됨) 확인.

- [ ] **Step 3: 골든 회귀 통과**

Run: `corepack pnpm --filter @kdh/figma-ingest test golden`
Expected: 3/3 PASS.

- [ ] **Step 4: 전체 테스트**

Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 전체 PASS. 신규 unit (ref-binder 6 + grid-reconciler 6 + submission-generator 4 + data-binder 2 + xml-region-parser 2 + ir-schema 2 + prompt-builder 3 + pipeline-stage35 2 + e2e 2) + 기존 123 ≈ 152개.

- [ ] **Step 5: 커밋**

```bash
git add packages/figma-ingest/tests/golden/
git commit -m "test(phase-2b): 골든 재생성 (ref 바인딩 + dataList + submission 포함)"
```

---

## Self-Review Notes

**Spec coverage:**
- §2 (Stage 3.5 삽입) → Task 8 ✓
- §3 (모듈 분해) → Task 4(ref-binder)/5(grid-reconciler)/6(submission-generator)/7(data-binder) ✓
- §4 (IR 확장) → Task 2 ✓; §4-1 (region parser) → Task 1 ✓
- §5-1 (ref-binder 매칭 + fallback) → Task 4 ✓
- §5-2 (grid 정렬) → Task 5 ✓ (위치 기반; sourceBodyId는 IR에 보존하되 위치 정렬 사용 — 단순화, DataList 컬럼이 header 순서로 생성되므로 정합)
- §5-3 (submission) → Task 6 ✓
- §6 (데이터 플로우) → Task 7 + 8 ✓
- §7 (테스팅) → 각 Task의 테스트 + Task 9 E2E + Task 10 골든 ✓
- §8 (성공 기준) → Task 10 전체 회귀 + 부서/부서코드 검증 ✓
- §9 미해결 (상세영역/저장 submission) → 2C 연기 (plan 범위 외 명시)

**주의 — sourceBodyId 단순화**: 스펙 §5-2는 sourceBodyId 우선 매칭을 기술하나, 구현은 위치 정렬(header[i]/body[i] ↔ columns[i])을 사용. 이유: DataList 컬럼이 grid header 순서대로 생성되므로 위치 정렬이 정합하고 단순/견고. sourceBodyId는 IR에 보존되어 향후 비순차 케이스에 활용 가능. **이 단순화는 chk 같은 선행 컬럼이 있으면 어긋날 수 있음** — 현재 fixture에는 chk 없음. final review에서 재평가.

**Placeholder scan:** `/TODO_VERIFY`는 의도된 출력 placeholder (DL-08). 코드 step에 실제 코드 모두 존재. "TBD" 없음.

**Type consistency:**
- `bindRefs(xml, ir)` / `reconcileGrids(xml, ir)` / `generateSubmissions(xml, ir)` / `bindDataCollection(xml, ir)` — 모두 `(string, DataCollectionIR): string` ✓
- `SchboxRegion.fields: Array<{label, componentId}>` (Task 1) ↔ ref-binder/prompt-builder 사용 ✓
- `DataMapKeyIR.boundComponentId?` / `DataListColumnIR.sourceBodyId?` (Task 2) ↔ ir-schema/prompt-builder/binder 사용 ✓

**의존성 순서:** Task 1(parser fields) → 2(IR) → 3(prompt) 는 독립적. 4(ref-binder)는 1의 fields 사용. 5/6는 독립. 7은 4/5/6. 8은 7. 9는 8. 10은 9. forward reference 없음 ✓

---

*문서 끝.*
