# Phase 2C-2: master-detail 상세영역 바인딩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** master-detail 화면의 상세 편집테이블 입력(`edt_empCdDetail` 등)을 grid의 DataList 컬럼에 `ref="data:dlt_memberBasic.{COL}"`로 바인딩해, 행 선택 시 상세영역이 자동 동기화되게 한다.

**Architecture:** Stage 3.5 결정론 모듈 `detail-binder.ts`. `data-binder`가 2B 바인더들 뒤에 조립. 탐지는 cheerio(읽기) — 조회버튼 없는 **최외곽 폼 영역**의 입력 수집, 편집은 2B `ref-binder`의 `addRefToComponent`(문자열 치환) 재사용. 라벨→DataList 컬럼명 매칭. scwin 핸들러 없음(WRM 표준 자동 동기화).

**Tech Stack:** TypeScript strict, Vitest, cheerio(읽기), 정규식 문자열 치환(쓰기).

**Spec reference:** [`docs/superpowers/specs/2026-05-20-phase-2c2-master-detail-binding-design.md`](../specs/2026-05-20-phase-2c2-master-detail-binding-design.md)

---

## ⚠️ 구현 노트 (필독)

- **타이밍**: Stage 3.5는 Phase 1 rename·button-modifier *이전* → 상세 입력 id는 pre-rename(`edt_empCdDetail`/`edt_empNmDetail`/`sel_deptNmDetail`), 조회버튼엔 `btn_cm sch`가 **아직 없음** → 조회버튼은 **라벨(조회/검색/초기화)**로 탐지(2C-0 `hasSearchButton` 재사용). 주입한 `ref`는 rename이 안 건드려 보존(2B와 동일).
- **최외곽 폼 영역만**: class 토큰 `schbox`/`tblbox` 그룹 중 **다른 schbox/tblbox에 중첩되지 않은** 것만 후보. search-grid는 `schbox > tblbox > schbox_inner` 중첩이라, 안쪽 tblbox를 상세로 오인하면 안 됨 — 최외곽 `schbox`가 조회버튼 보유 → 전체 제외.
- **의미 기반 판정**: 검색영역=조회버튼 보유(제외), 상세=조회버튼 없음(바인딩). class 리터럴 비의존 → 조회버튼 없는 schbox도 상세로 해석.
- **편집은 멱등**: `addRefToComponent`는 ref가 이미 있으면 보존. Co-Authored-By 트레일러 금지.

---

## File Structure

```
packages/figma-ingest/
├── src/stage3/
│   ├── detail-binder.ts          # NEW — detectDetailInputs + matchColumn + bindDetailTables
│   ├── ref-binder.ts             # MODIFIED — addRefToComponent export
│   └── data-binder.ts            # MODIFIED — bindDetailTables 조립
└── tests/
    ├── stage3/
    │   ├── detail-binder.test.ts # NEW
    │   └── data-binder.test.ts   # NEW (bindDataCollection 직접 단위)
    ├── pipeline.e2e.test.ts      # MODIFIED — 상세 ref 검증
    └── golden/master-detail.expected.xml  # MODIFIED — 재생성
```

---

### Task 1: detectDetailInputs (탐지 — 최외곽 폼 영역, 조회버튼 제외)

**Files:** Create `src/stage3/detail-binder.ts` + `tests/stage3/detail-binder.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/detail-binder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { detectDetailInputs } from '../../src/stage3/detail-binder';

// master-detail형: 검색 schbox(조회버튼) + 상세 tblbox(버튼 없음). Stage 3.5 시점 = pre-rename id, 버튼에 btn_cm sch 없음.
const MD = `<body>
  <xf:group class="schbox">
    <xf:group class="schbox_inner" id="tbl_search"><xf:group class="w2tb tbl">
      <xf:input id="edt_empNm" label="성명"/>
    </xf:group></xf:group>
    <xf:group class="btn_schbox"><xf:trigger id="btn_004" type="button"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
  </xf:group>
  <xf:group class="tblbox">
    <xf:group class="w2tb tbl">
      <xf:input id="edt_empCdDetail" label="사번"/>
      <xf:input id="edt_empNmDetail" label="성명"/>
      <xf:select1 id="sel_deptNmDetail" label="부서명"/>
    </xf:group>
  </xf:group>
</body>`;

describe('detectDetailInputs', () => {
  it('상세 tblbox 입력만 수집 (검색 schbox 입력 제외)', () => {
    const inputs = detectDetailInputs(MD);
    expect(inputs).toEqual([
      { id: 'edt_empCdDetail', label: '사번' },
      { id: 'edt_empNmDetail', label: '성명' },
      { id: 'sel_deptNmDetail', label: '부서명' },
    ]);
    expect(inputs.find(i => i.id === 'edt_empNm')).toBeUndefined(); // 검색 입력 제외
  });

  it('중첩 케이스(search-grid형): schbox>tblbox>schbox_inner는 상세로 오인 안 함', () => {
    const SG = `<body>
      <xf:group class="grpbox_wrap schbox">
        <xf:group class="tblbox">
          <xf:group class="schbox_inner" id="tbl_search"><xf:group class="w2tb tbl">
            <xf:input id="edt_orderNo" label="주문번호"/>
          </xf:group></xf:group>
        </xf:group>
        <xf:group class="btn_schbox"><xf:trigger id="btn_006"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
      </xf:group>
    </body>`;
    expect(detectDetailInputs(SG)).toEqual([]); // 최외곽 schbox에 조회버튼 → 전체 제외
  });

  it('조회버튼 없는 schbox는 상세로 포함 (의미 기반 판정)', () => {
    const xml = `<body>
      <xf:group class="schbox">
        <xf:group class="w2tb tbl"><xf:input id="edt_x" label="항목"/></xf:group>
      </xf:group>
    </body>`;
    expect(detectDetailInputs(xml)).toEqual([{ id: 'edt_x', label: '항목' }]);
  });

  it('폼 영역 없으면 빈 배열', () => {
    expect(detectDetailInputs(`<body><xf:group class="gvwbox"></xf:group></body>`)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test detail-binder`
Expected: FAIL (module 없음)

- [ ] **Step 3: 구현 (탐지 부분만)**

Create `packages/figma-ingest/src/stage3/detail-binder.ts`:

```typescript
/**
 * Stage 3.5 — master-detail 상세영역 입력을 grid의 DataList에 바인딩.
 *
 * 상세 테이블 = 조회버튼이 없는 최외곽 폼 영역(다른 schbox/tblbox에 비중첩).
 * 검색영역(조회버튼 보유)은 2B ref-binder가 dma_search에 바인딩하므로 제외.
 * 라벨 → DataList 컬럼명 매칭으로 ref="data:{dltId}.{colId}" 주입.
 *
 * 탐지는 cheerio(읽기), 편집은 ref-binder의 addRefToComponent(문자열 치환) 재사용.
 * Stage 3.5(rename·button-modifier 이전) → pre-rename id, 조회버튼은 라벨로 탐지.
 */
import * as cheerio from 'cheerio';
import { hasSearchButton } from './schbox-normalizer';

export interface DetailInput { id: string; label: string; }

const INPUT_TAGS = ['xf:input', 'xf:select1', 'xf:select', 'xf:textarea', 'xf:inputcalendar', 'w2:autocomplete'];

/** cheerio 가 보존하는 태그 원형(`xf:input` 등)과 비교. 대소문자 무시. */
function tagNameOf(el: unknown): string {
  const node = el as { tagName?: string; name?: string };
  return (node.tagName ?? node.name ?? '').toLowerCase();
}

/** class 토큰에 schbox 또는 tblbox 가 있으면 폼 영역. */
function isFormRegion(classAttr: string | undefined): boolean {
  const cls = (classAttr ?? '').split(/\s+/);
  return cls.includes('schbox') || cls.includes('tblbox');
}

/**
 * 조회버튼 없는 최외곽 폼 영역의 상세 입력(id+label)을 수집.
 * 검색영역(조회버튼 보유)·중첩 영역은 제외. id+label 둘 다 있는 입력만.
 */
export function detectDetailInputs(xml: string): DetailInput[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const seen = new Set<string>();
  const result: DetailInput[] = [];

  $('[class]').each((_, el) => {
    const $el = $(el);
    if (!isFormRegion($el.attr('class'))) return;
    // 최외곽 폼 영역만 (다른 schbox/tblbox 에 중첩되지 않음)
    const nested = $el.parents().toArray().some(p => isFormRegion($(p).attr('class')));
    if (nested) return;
    // 검색영역(조회버튼 보유) 제외 — 영역 전체(형제 btn_schbox 포함)를 본다
    if (hasSearchButton($.xml($el))) return;
    // 상세 입력 수집
    $el.find('*').each((_2, node) => {
      if (!INPUT_TAGS.includes(tagNameOf(node))) return;
      const id = $(node).attr('id');
      const label = $(node).attr('label');
      if (id && label && !seen.has(id)) {
        seen.add(id);
        result.push({ id, label });
      }
    });
  });
  return result;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test detail-binder`
Expected: 4 PASS.

- [ ] **Step 5: 빌드 + 커밋 (PowerShell, Co-Authored-By 금지)**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/detail-binder.ts packages/figma-ingest/tests/stage3/detail-binder.test.ts
git commit -m "feat(phase-2c2): detectDetailInputs — 조회버튼 없는 최외곽 폼 영역 탐지"
```

---

### Task 2: matchColumn + bindDetailTables (바인딩)

**Files:** Modify `src/stage3/ref-binder.ts` (export) + `src/stage3/detail-binder.ts` + `tests/stage3/detail-binder.test.ts`

- [ ] **Step 1: ref-binder의 addRefToComponent export**

Edit `packages/figma-ingest/src/stage3/ref-binder.ts` line 22. 현재:
```typescript
/** 컴포넌트 여는 태그를 찾아 ref가 없으면 id 속성 뒤에 삽입. */
function addRefToComponent(xml: string, componentId: string, refValue: string): string {
```
다음으로 변경 (export 추가):
```typescript
/** 컴포넌트 여는 태그를 찾아 ref가 없으면 id 속성 뒤에 삽입. */
export function addRefToComponent(xml: string, componentId: string, refValue: string): string {
```
(나머지 본문·내부 사용은 그대로. ref-binder는 동일 모듈 내에서 계속 사용.)

- [ ] **Step 2: 실패 테스트 추가**

Append to `tests/stage3/detail-binder.test.ts`:

```typescript
import { matchColumn, bindDetailTables } from '../../src/stage3/detail-binder';
import type { DataCollectionIR } from '../../src/types';

const COLUMNS = [
  { id: 'EMP_CD', name: '사번', dataType: 'text' as const },
  { id: 'EMP_NM', name: '성명', dataType: 'text' as const },
  { id: 'DEPT_NM', name: '부서명', dataType: 'text' as const },
];

const IR: DataCollectionIR = {
  dataMaps: [],
  dataLists: [{ id: 'dlt_memberBasic', name: '사원목록', columns: COLUMNS }],
  confidence: 0.9,
};

describe('matchColumn', () => {
  it('name 일치 컬럼 id 반환', () => {
    expect(matchColumn('사번', COLUMNS)).toBe('EMP_CD');
    expect(matchColumn('부서명', COLUMNS)).toBe('DEPT_NM');
  });
  it('불일치면 null', () => {
    expect(matchColumn('주소', COLUMNS)).toBeNull();
  });
});

describe('bindDetailTables', () => {
  const MD = `<body>
    <xf:group class="schbox">
      <xf:group class="schbox_inner" id="tbl_search"><xf:input id="edt_empNm" label="성명"/></xf:group>
      <xf:group class="btn_schbox"><xf:trigger id="btn_004"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
    </xf:group>
    <xf:group class="tblbox"><xf:group class="w2tb tbl">
      <xf:input id="edt_empCdDetail" label="사번"/>
      <xf:input id="edt_empNmDetail" label="성명"/>
      <xf:select1 id="sel_deptNmDetail" label="부서명"/>
    </xf:group></xf:group>
  </body>`;

  it('상세 입력에 DataList ref 주입 (input + select1)', () => {
    const out = bindDetailTables(MD, IR);
    expect(out).toContain('id="edt_empCdDetail" ref="data:dlt_memberBasic.EMP_CD"');
    expect(out).toContain('id="edt_empNmDetail" ref="data:dlt_memberBasic.EMP_NM"');
    expect(out).toContain('id="sel_deptNmDetail" ref="data:dlt_memberBasic.DEPT_NM"');
  });

  it('검색폼 입력(edt_empNm)은 바인딩 안 함', () => {
    const out = bindDetailTables(MD, IR);
    expect(out).not.toMatch(/id="edt_empNm"[^>]*ref=/);
  });

  it('라벨 불일치 입력은 생략 (깨진 ref 방지)', () => {
    const xml = `<body><xf:group class="tblbox"><xf:input id="edt_addr" label="주소"/></xf:group></body>`;
    const out = bindDetailTables(xml, IR);
    expect(out).not.toContain('ref=');
  });

  it('멱등: 이미 ref 있으면 보존', () => {
    const xml = `<body><xf:group class="tblbox"><xf:input id="edt_empCdDetail" ref="data:other.X" label="사번"/></xf:group></body>`;
    const out = bindDetailTables(xml, IR);
    expect(out).toContain('ref="data:other.X"');
    expect(out).not.toContain('dlt_memberBasic.EMP_CD');
  });

  it('no-op: DataList 없으면 원본 그대로', () => {
    const emptyIr: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 0.5 };
    const xml = `<body><xf:group class="tblbox"><xf:input id="edt_empCdDetail" label="사번"/></xf:group></body>`;
    expect(bindDetailTables(xml, emptyIr)).toBe(xml);
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test detail-binder`
Expected: matchColumn(2) + bindDetailTables(5) FAIL.

- [ ] **Step 4: 구현 추가**

Append to `packages/figma-ingest/src/stage3/detail-binder.ts` (상단 import 에 추가):
```typescript
import { addRefToComponent } from './ref-binder';
import type { DataCollectionIR, DataListColumnIR } from '../types';
```

그리고 파일 끝에 추가:
```typescript
/** DataList 컬럼 중 name === label인 컬럼 id. 없으면 null. */
export function matchColumn(label: string, columns: DataListColumnIR[]): string | null {
  const col = columns.find(c => c.name === label);
  return col ? col.id : null;
}

/**
 * 상세 입력을 (IR의 첫) DataList 컬럼에 ref 바인딩.
 * DataList 없거나 상세 입력 없으면 no-op. 라벨 불일치 입력은 생략.
 */
export function bindDetailTables(xml: string, ir: DataCollectionIR): string {
  const dlt = ir.dataLists[0];
  if (!dlt) return xml;
  const inputs = detectDetailInputs(xml);
  if (inputs.length === 0) return xml;

  let result = xml;
  for (const inp of inputs) {
    const colId = matchColumn(inp.label, dlt.columns);
    if (colId) {
      result = addRefToComponent(result, inp.id, `data:${dlt.id}.${colId}`);
    }
  }
  return result;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test detail-binder`
Expected: 11 PASS (4 + 2 + 5).

- [ ] **Step 6: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/ref-binder.ts packages/figma-ingest/src/stage3/detail-binder.ts packages/figma-ingest/tests/stage3/detail-binder.test.ts
git commit -m "feat(phase-2c2): matchColumn + bindDetailTables (라벨→컬럼 매칭, addRefToComponent 재사용)"
```

---

### Task 3: data-binder 조립 (Stage 3.5 연결)

**Files:** Modify `src/stage3/data-binder.ts` + Create `tests/stage3/data-binder.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/data-binder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { bindDataCollection } from '../../src/stage3/data-binder';
import type { DataCollectionIR } from '../../src/types';

const IR: DataCollectionIR = {
  dataMaps: [],
  dataLists: [{
    id: 'dlt_memberBasic',
    name: '사원목록',
    columns: [
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'EMP_NM', name: '성명', dataType: 'text' },
      { id: 'DEPT_NM', name: '부서명', dataType: 'text' },
    ],
  }],
  confidence: 0.9,
};

const MD = `<body>
  <xf:group class="tblbox"><xf:group class="w2tb tbl">
    <xf:input id="edt_empCdDetail" label="사번"/>
    <xf:select1 id="sel_deptNmDetail" label="부서명"/>
  </xf:group></xf:group>
</body>`;

describe('bindDataCollection — 상세 바인딩 통합 (2C-2)', () => {
  it('상세 입력이 DataList ref로 바인딩됨', () => {
    const out = bindDataCollection(MD, IR);
    expect(out).toContain('id="edt_empCdDetail" ref="data:dlt_memberBasic.EMP_CD"');
    expect(out).toContain('id="sel_deptNmDetail" ref="data:dlt_memberBasic.DEPT_NM"');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test data-binder`
Expected: FAIL (상세 ref 미주입 — bindDetailTables 미연결).

- [ ] **Step 3: data-binder.ts에 연결**

Edit `packages/figma-ingest/src/stage3/data-binder.ts`. 현재:
```typescript
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
다음으로 교체 (detail-binder import + 마지막 단계 추가):
```typescript
import { bindRefs } from './ref-binder';
import { reconcileGrids } from './grid-reconciler';
import { generateSubmissions } from './submission-generator';
import { bindDetailTables } from './detail-binder';
import type { DataCollectionIR } from '../types';

export function bindDataCollection(xml: string, ir: DataCollectionIR): string {
  let result = bindRefs(xml, ir);
  result = reconcileGrids(result, ir);
  result = generateSubmissions(result, ir);
  result = bindDetailTables(result, ir);   // 2C-2: 상세영역 → DataList
  return result;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test data-binder`
Expected: PASS.

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/data-binder.ts packages/figma-ingest/tests/stage3/data-binder.test.ts
git commit -m "feat(phase-2c2): data-binder에 bindDetailTables 조립 (Stage 3.5 마지막)"
```

---

### Task 4: E2E + 골든 재생성 + 전체 회귀

**Files:** Modify `tests/pipeline.e2e.test.ts` + `tests/golden/master-detail.expected.xml`

- [ ] **Step 1: E2E 검증 추가**

`packages/figma-ingest/tests/pipeline.e2e.test.ts`의 Mock-LLM describe 블록에 추가(`makeMock` 헬퍼 재사용 — 파일에서 헬퍼명·import 확인):

```typescript
  it('master-detail: 상세 입력이 DataList에 바인딩 (Phase 2C-2)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'master-detail.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('master-detail') });
    expect(xml).toMatch(/id="ibx_empCdDetail"[^>]*ref="data:dlt_memberBasic\.EMP_CD"/);
    expect(xml).toMatch(/id="ibx_empNmDetail"[^>]*ref="data:dlt_memberBasic\.EMP_NM"/);
    expect(xml).toMatch(/id="sbx_deptNmDetail"[^>]*ref="data:dlt_memberBasic\.DEPT_NM"/);
    // grid·scwin 핸들러 보존
    expect(xml).toContain('dataList="data:dlt_memberBasic"');
    expect(xml).toContain('$c.util.setGridViewDelCheckBox([');
  }, 60000);

  it('search-grid: 검색 입력은 dma_search 유지, DataList ref 미주입 (Phase 2C-2 회귀)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'search-grid.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('search-grid') });
    expect(xml).toMatch(/id="ibx_orderNo"[^>]*ref="data:dma_search\.ORDER_NO"/);
    expect(xml).not.toMatch(/id="ibx_orderNo"[^>]*ref="data:dlt_/);  // 검색 입력은 DataList 바인딩 안 됨
  }, 60000);
```

> 주의: ref 정규식은 `id="..." ... ref="..."` 순서를 가정. addRefToComponent가 id 뒤에 ref를 넣으므로 이 순서가 맞다(2B 골든에서 확인됨). 실패 시 두 토큰을 분리 검증으로 완화하되 핵심(상세 입력이 dlt에 바인딩)은 유지하고 report에 명시.

- [ ] **Step 2: 골든 재생성**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
Run: `corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate`

- [ ] **Step 3: 골든 검토 (Read)**

`tests/golden/master-detail.expected.xml`의 상세 편집테이블(5_02 테이블(2단)) 확인:
- `ibx_empCdDetail`→`ref="data:dlt_memberBasic.EMP_CD"`, `ibx_empNmDetail`→`.EMP_NM`, `sbx_deptNmDetail`→`.DEPT_NM`
- 검색 입력(`ibx_empNm`)·grid(`dlt_memberBasic`)·scwin 핸들러(2C-1)·CDATA·2C-0 schbox 보존, well-formed
- `tests/golden/simple-form.expected.xml`·`search-grid.expected.xml`: 상세 ref **없음**(변경 없어야 함; search-grid 검색 입력은 dma_search ref만)
- 구조 깨짐·검색입력 오바인딩·grid 소실 시 STOP 후 report

- [ ] **Step 4: 골든 회귀 + 전체**

Run: `corepack pnpm --filter @kdh/figma-ingest test golden`
Expected: 3/3 PASS.

Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 전체 PASS, fail 0 (live-llm 1 skip).

- [ ] **Step 5: 커밋**

```
git add packages/figma-ingest/tests/golden/ packages/figma-ingest/tests/pipeline.e2e.test.ts
git commit -m "test(phase-2c2): 골든 재생성(상세 ref) + E2E (master-detail 바인딩 / search-grid 회귀)"
```

---

## Self-Review Notes

**Spec coverage:**
- §2 (Stage 3.5, data-binder 뒤에 조립) → Task 3 ✓
- §3 (모듈 detail-binder) → Task 1·2 ✓
- §4 (탐지: 조회버튼 없는 최외곽 폼 영역, 의미 기반, 중첩 주의) → Task 1 detectDetailInputs + 테스트(중첩/조회버튼없는schbox) ✓
- §5 (라벨→컬럼 매칭, ref 주입, 멱등, 불일치 생략) → Task 2 matchColumn/bindDetailTables ✓
- §6 (케이스: master-detail 바인딩, simple/search no-op) → Task 4 E2E + 골든 ✓
- §7 (엣지/no-op) → Task 2 테스트(불일치/멱등/DataList없음) ✓
- §8 (테스팅) → 각 Task ✓
- §9 (성공 기준) → Task 4 전체 회귀 ✓
- §10 (리스크: 의미 판정, 최외곽 영역, 영역 분리) → Task 1 구현·테스트 ✓

> **스펙 충실**: cheerio 읽기(탐지) + addRefToComponent 문자열 치환(편집)은 2B 패턴 그대로. hasSearchButton은 2C-0 export 재사용.

**Placeholder scan:** TBD/TODO 없음. 모든 step에 실제 코드. (Task 4는 makeMock 헬퍼명·ref 속성순서를 구현 전 확인하라고 명시 — 추측 금지.)

**Type consistency:**
- `DetailInput { id, label }` Task 1 정의, Task 2에서 사용 ✓
- `detectDetailInputs(xml): DetailInput[]`, `matchColumn(label, columns): string|null`, `bindDetailTables(xml, ir): string` — 일관 ✓
- `addRefToComponent(xml, componentId, refValue): string` — ref-binder 기존 시그니처, Task 2에서 export 후 import ✓
- `DataListColumnIR { id, name, dataType }` — types.ts 기존, matchColumn이 `c.name`/`c.id` 사용 ✓
- IR `ir.dataLists[0].columns` — DataCollectionIR 구조와 일치 ✓

**의존성 순서:** Task 1(탐지) → 2(ref-binder export + 바인딩, 1 사용) → 3(data-binder 조립) → 4(E2E/골든). forward ref 없음 ✓

---

*문서 끝.*
