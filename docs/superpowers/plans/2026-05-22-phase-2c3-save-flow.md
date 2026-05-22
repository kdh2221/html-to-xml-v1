# Phase 2C-3: 저장 흐름 + 입력 검사 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** master-detail/search-grid 화면에 WRM 표준 저장 흐름(`sbm_save` 제출 + 저장 onclick[변경감지→필수검증→확인→제출] + 취소 onclick[되돌리기])과 키필드 필수 마킹을 생성한다.

**Architecture:** 각 단계의 기존 모듈 확장 — `submission-generator.ts`(3.5: sbm_save) + `detail-binder.ts`(3.5: grp_detail id + 키 mandatory) + `scwin-scaffolder.ts`(Stage 4: 저장/취소 핸들러). 세 모듈 모두 이미 파이프라인에 연결돼 있어 `pipeline.ts` 변경 없음. 결정론, 문자열 치환(CDATA 보존).

**Tech Stack:** TypeScript strict, Vitest, 정규식 문자열 치환(쓰기), cheerio(detail-binder 읽기).

**Spec reference:** [`docs/superpowers/specs/2026-05-22-phase-2c3-save-flow-design.md`](../specs/2026-05-22-phase-2c3-save-flow-design.md)

---

## ⚠️ 구현 노트 (필독)

- **pipeline.ts 변경 없음**: generateSubmissions/bindDetailTables(data-binder 안), scaffoldScwinHandlers(Stage 4)는 이미 호출됨. 동작만 확장.
- **타이밍**: submission-generator·detail-binder는 Stage 3.5(rename·button-modifier 이전) → 저장버튼은 라벨 `저장`(CDATA)로 탐지, 상세 입력은 pre-rename id(`edt_`/`sel_`). scwin-scaffolder는 Stage 4(이후) → 저장/취소 버튼도 라벨로 탐지, id는 안정 id(`grd_`/`dlt_`/`sbm_save`/`grp_detail`).
- **안정 id**: `grp_detail`/`sbm_save`는 `renameIdToUi01`이 안 건드림(grp_/sbm_ prefix). Stage 3.5에서 부여→Stage 4에서 참조 안전.
- **들여쓰기 탭(`\t`)** — 골든이 탭. 저장 핸들러 문자열은 골든 일치를 위해 정확히 재현.
- **async**: 저장 핸들러는 `await`(confirm/alert) → `async function`. 취소는 일반 function.
- Co-Authored-By 트레일러 금지. 골든 3개 중 master-detail·search-grid만 변경(simple-form 불변).

---

## File Structure

```
packages/figma-ingest/src/stage3/
├── submission-generator.ts   # MODIFY — sbm_save 생성 (저장버튼+DataList)
├── detail-binder.ts          # MODIFY — grp_detail id + 키 mandatory
└── scwin-scaffolder.ts       # MODIFY — 저장/취소 detector + buildSaveHandlers + 조립

packages/figma-ingest/tests/
├── stage3/submission-generator.test.ts   # APPEND (없으면 CREATE)
├── stage3/detail-binder.test.ts          # APPEND
├── stage3/scwin-scaffolder.test.ts       # APPEND
├── pipeline.e2e.test.ts                  # APPEND — 저장 흐름 검증
└── golden/{master-detail,search-grid}.expected.xml  # 재생성
```

---

### Task 1: submission-generator — sbm_save 생성

**Files:** Modify `src/stage3/submission-generator.ts` + `tests/stage3/submission-generator.test.ts`

현재 `generateSubmissions`는 `if (ir.dataMaps.length === 0) return xml;`로 시작해 DataMap 없으면 아무것도 안 한다. master-detail은 DataMap이 없어도 sbm_save가 필요하므로 구조를 바꾼다(sbm_search/sbm_save 블록을 각각 조건부로 모아 주입).

- [ ] **Step 1: 실패 테스트 작성/추가**

`tests/stage3/submission-generator.test.ts`가 있으면 APPEND, 없으면 CREATE. (있으면 기존 테스트·import 보존, 상수명 충돌 피해 append.)

```typescript
import { describe, expect, it } from 'vitest';
import { generateSubmissions } from '../../src/stage3/submission-generator';
import type { DataCollectionIR } from '../../src/types';

const DLT_ONLY: DataCollectionIR = {
  dataMaps: [],
  dataLists: [{ id: 'dlt_memberBasic', name: '사원목록', columns: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }] }],
  confidence: 0.9,
};

// </w2:dataCollection> 앵커 필요
const XML_WITH_SAVE = `<xf:model><w2:dataCollection></w2:dataCollection></xf:model>
<xf:trigger id="btn_013"><xf:label><![CDATA[저장]]></xf:label></xf:trigger>`;
const XML_NO_SAVE = `<xf:model><w2:dataCollection></w2:dataCollection></xf:model>
<xf:trigger id="btn_006"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>`;

describe('generateSubmissions — sbm_save (2C-3)', () => {
  it('저장버튼 + DataList → sbm_save 생성 (ref=target=DataList, submitdone)', () => {
    const out = generateSubmissions(XML_WITH_SAVE, DLT_ONLY);
    expect(out).toContain('<xf:submission id="sbm_save" ref="data:json,dlt_memberBasic" target="data:json,dlt_memberBasic"');
    expect(out).toContain('ev:submitdone="scwin.sbm_save_submitdone"');
    expect(out).toContain('action="/TODO_VERIFY"');
  });

  it('저장버튼 없으면 sbm_save 미생성', () => {
    const out = generateSubmissions(XML_NO_SAVE, DLT_ONLY);
    expect(out).not.toContain('sbm_save');
    // DataMap도 없으니 sbm_search도 없음 → 원본 그대로
    expect(out).toBe(XML_NO_SAVE);
  });

  it('DataList 없으면 sbm_save 미생성', () => {
    const emptyIr: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 0.5 };
    expect(generateSubmissions(XML_WITH_SAVE, emptyIr)).toBe(XML_WITH_SAVE);
  });

  it('기존 sbm_search 회귀 (DataMap 있으면 sbm_search 생성)', () => {
    const ir: DataCollectionIR = {
      dataMaps: [{ id: 'dma_search', name: '검색', keys: [{ id: 'ORDER_NO', name: '주문번호', dataType: 'text' }] }],
      dataLists: [{ id: 'dlt_orderList', name: '주문', columns: [{ id: 'ORDER_NO', name: '주문번호', dataType: 'text' }] }],
      confidence: 0.9,
    };
    const out = generateSubmissions(XML_WITH_SAVE, ir);
    expect(out).toContain('<xf:submission id="sbm_search" ref="data:json,dma_search" target="data:json,dlt_orderList"');
    // 저장버튼+DataList도 있으니 sbm_save도 함께
    expect(out).toContain('id="sbm_save"');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test submission-generator`
Expected: sbm_save 케이스 FAIL (현재 미구현).

- [ ] **Step 3: 구현 — generateSubmissions 재작성**

`packages/figma-ingest/src/stage3/submission-generator.ts` 전체를 다음으로 교체:

```typescript
/**
 * Stage 3.5 — <xf:submission> 선언 생성 + <xf:model>에 주입.
 *
 * sbm_search: DataMap 있을 때 (ref=DataMap, target=첫 DataList).
 * sbm_save:   저장 라벨 버튼 + DataList 있을 때 (ref=target=첫 DataList).
 * 둘 다 action=/TODO_VERIFY (DL-08 주석 동반), ev:submitdone=핸들러(Stage 4).
 * </w2:dataCollection> 바로 뒤에 주입.
 */
import type { DataCollectionIR } from '../types';

const SAVE_LABEL = /저장/;

/** xml에 라벨 '저장' trigger가 있으면 true. */
function hasSaveButton(xml: string): boolean {
  const triggers = xml.match(/<xf:trigger\b[\s\S]*?<\/xf:trigger>/g) || [];
  return triggers.some(t => SAVE_LABEL.test(t));
}

export function generateSubmissions(xml: string, ir: DataCollectionIR): string {
  const blocks: string[] = [];

  // sbm_search — DataMap 있을 때
  if (ir.dataMaps.length > 0) {
    const dm = ir.dataMaps[0];
    const target = ir.dataLists.length > 0 ? ` target="data:json,${ir.dataLists[0].id}"` : '';
    blocks.push(
      `\n\t\t\t<!-- TODO: [서버 확인] action URL("/TODO_VERIFY") 확인 필요 -->\n` +
      `\t\t\t<xf:submission id="sbm_search" ref="data:json,${dm.id}"${target}` +
      ` action="/TODO_VERIFY" method="post" mediatype="application/json"` +
      ` ev:submitdone="scwin.sbm_search_submitdone"/>`,
    );
  }

  // sbm_save — 저장버튼 + DataList 있을 때
  if (ir.dataLists.length > 0 && hasSaveButton(xml)) {
    const dlt = ir.dataLists[0];
    blocks.push(
      `\n\t\t\t<!-- TODO: [서버 확인] action URL("/TODO_VERIFY") 확인 필요 -->\n` +
      `\t\t\t<xf:submission id="sbm_save" ref="data:json,${dlt.id}" target="data:json,${dlt.id}"` +
      ` action="/TODO_VERIFY" method="post" mediatype="application/json"` +
      ` ev:submitdone="scwin.sbm_save_submitdone"/>`,
    );
  }

  if (blocks.length === 0) return xml;
  if (!/<\/w2:dataCollection>/.test(xml)) return xml;
  return xml.replace(/(<\/w2:dataCollection>)/, `$1${blocks.join('')}`);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test submission-generator`
Expected: 신규 4개 + 기존 테스트 PASS.

- [ ] **Step 5: 빌드 + 커밋 (Co-Authored-By 금지)**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/submission-generator.ts packages/figma-ingest/tests/stage3/submission-generator.test.ts
git commit -m "feat(phase-2c3): submission-generator sbm_save 생성 (저장버튼+DataList)"
```

---

### Task 2: detail-binder — grp_detail id + 키 mandatory

**Files:** Modify `src/stage3/detail-binder.ts` + `tests/stage3/detail-binder.test.ts`

`bindDetailTables`가 상세 ref 바인딩 후, 상세 region에 `id="grp_detail"`를 부여하고 키 컬럼(첫 DataList 컬럼) 입력에 `mandatory="true"`를 추가한다.

- [ ] **Step 1: 실패 테스트 추가**

Append to `tests/stage3/detail-binder.test.ts`:

```typescript
import { markMandatory, assignDetailGroupId } from '../../src/stage3/detail-binder';

describe('markMandatory', () => {
  it('입력 태그에 mandatory="true" 추가 (id 뒤)', () => {
    const xml = `<xf:input id="edt_empCdDetail" label="사번"/>`;
    expect(markMandatory(xml, 'edt_empCdDetail')).toContain('id="edt_empCdDetail" mandatory="true"');
  });
  it('이미 mandatory 있으면 보존', () => {
    const xml = `<xf:input id="edt_empCdDetail" mandatory="true" label="사번"/>`;
    expect(markMandatory(xml, 'edt_empCdDetail')).toBe(xml);
  });
});

describe('assignDetailGroupId', () => {
  it('키 입력을 감싸는 tblbox region에 id="grp_detail" 부여 (기존 빈 id 교체)', () => {
    const xml = `<xf:group class="tblbox" id=""><xf:group class="w2tb tbl"><xf:input id="edt_empCdDetail" label="사번"/></xf:group></xf:group>`;
    const out = assignDetailGroupId(xml, 'edt_empCdDetail');
    expect(out).toContain('<xf:group class="tblbox" id="grp_detail">');
  });
  it('이미 grp_detail이면 그대로', () => {
    const xml = `<xf:group class="tblbox" id="grp_detail"><xf:input id="edt_x" label="x"/></xf:group>`;
    expect(assignDetailGroupId(xml, 'edt_x')).toBe(xml);
  });
});

describe('bindDetailTables — grp_detail + 키 mandatory (2C-3)', () => {
  const IR2: DataCollectionIR = {
    dataMaps: [],
    dataLists: [{ id: 'dlt_memberBasic', name: '사원목록', columns: [
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'EMP_NM', name: '성명', dataType: 'text' },
    ] }],
    confidence: 0.9,
  };
  const MD2 = `<body><xf:group class="tblbox" id=""><xf:group class="w2tb tbl">
    <xf:input id="edt_empCdDetail" label="사번"/>
    <xf:input id="edt_empNmDetail" label="성명"/>
  </xf:group></xf:group></body>`;

  it('상세 region에 grp_detail + 키(첫 컬럼 사번) 입력만 mandatory', () => {
    const out = bindDetailTables(MD2, IR2);
    expect(out).toContain('<xf:group class="tblbox" id="grp_detail">');
    expect(out).toMatch(/id="edt_empCdDetail"[^>]*mandatory="true"/);
    expect(out).not.toMatch(/id="edt_empNmDetail"[^>]*mandatory=/);  // 비키 입력은 미마킹
    // 기존 ref 바인딩 회귀
    expect(out).toContain('id="edt_empCdDetail" ref="data:dlt_memberBasic.EMP_CD"');
  });
});
```

(`bindDetailTables`/`DataCollectionIR`는 같은 파일 기존 테스트에서 이미 import됨 — 중복 import line은 합치거나 그대로 둬도 Vitest 동작. 새 심볼만 추가 import.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test detail-binder`
Expected: markMandatory/assignDetailGroupId/grp_detail 케이스 FAIL.

- [ ] **Step 3: 구현 추가 + bindDetailTables 확장**

Append to `packages/figma-ingest/src/stage3/detail-binder.ts` (파일 끝):

```typescript
const MANDATORY_INPUT_TAGS = '(?:xf:input|xf:select1|xf:select|xf:textarea|xf:inputCalendar|w2:autoComplete)';

/** 입력 태그(id)에 mandatory="true" 부여(없을 때만). */
export function markMandatory(xml: string, id: string): string {
  const re = new RegExp(`(<${MANDATORY_INPUT_TAGS}\\b[^>]*?\\bid="${id}")([^>]*?)(\\/?>)`);
  return xml.replace(re, (full, head: string, mid: string, close: string) => {
    if (/\bmandatory\s*=/.test(head) || /\bmandatory\s*=/.test(mid)) return full;
    return `${head} mandatory="true"${mid}${close}`;
  });
}

/**
 * 키 입력(id)을 감싸는 최근접 폼영역(<xf:group ...schbox|tblbox...>) 여는 태그에
 * id="grp_detail" 부여. 이미 있으면 그대로. (역방향 스캔 — cheerio 재직렬화 회피)
 */
export function assignDetailGroupId(xml: string, keyInputId: string): string {
  const inputIdx = xml.indexOf(`id="${keyInputId}"`);
  if (inputIdx === -1) return xml;
  const regionRe = /<xf:group\b[^>]*\bclass="[^"]*\b(?:schbox|tblbox)\b[^"]*"[^>]*>/g;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = regionRe.exec(xml)) !== null) {
    if (m.index > inputIdx) break;
    lastMatch = m;
  }
  if (!lastMatch) return xml;
  const openTag = lastMatch[0];
  if (/\bid="grp_detail"/.test(openTag)) return xml;
  const newTag = /\bid="[^"]*"/.test(openTag)
    ? openTag.replace(/\bid="[^"]*"/, 'id="grp_detail"')
    : openTag.replace(/(<xf:group\b)/, '$1 id="grp_detail"');
  return xml.slice(0, lastMatch.index) + newTag + xml.slice(lastMatch.index + openTag.length);
}
```

그리고 기존 `bindDetailTables` 함수의 `return result;` **직전에** 다음을 삽입 (refs 바인딩 후 grp_detail + 키 mandatory):

```typescript
  // 2C-3: 상세 region에 grp_detail 부여 + 키 컬럼(첫 컬럼) 입력 mandatory
  result = assignDetailGroupId(result, inputs[0].id);
  const keyName = dlt.columns[0]?.name;
  const keyInput = inputs.find(inp => inp.label === keyName);
  if (keyInput) {
    result = markMandatory(result, keyInput.id);
  }
```

(즉 `bindDetailTables`의 마지막이 다음 형태가 된다:)
```typescript
  for (const inp of inputs) {
    const colId = matchColumn(inp.label, dlt.columns);
    if (colId) {
      result = addRefToComponent(result, inp.id, `data:${dlt.id}.${colId}`);
    }
  }
  // 2C-3: 상세 region에 grp_detail 부여 + 키 컬럼(첫 컬럼) 입력 mandatory
  result = assignDetailGroupId(result, inputs[0].id);
  const keyName = dlt.columns[0]?.name;
  const keyInput = inputs.find(inp => inp.label === keyName);
  if (keyInput) {
    result = markMandatory(result, keyInput.id);
  }
  return result;
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test detail-binder`
Expected: 신규 5개 + 기존 11개 PASS.

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/detail-binder.ts packages/figma-ingest/tests/stage3/detail-binder.test.ts
git commit -m "feat(phase-2c3): detail-binder grp_detail id + 키 컬럼 mandatory 마킹"
```

---

### Task 3: scwin-scaffolder — 저장/취소 detector + buildSaveHandlers (pure)

**Files:** Modify `src/stage3/scwin-scaffolder.ts` + `tests/stage3/scwin-scaffolder.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

Append to `tests/stage3/scwin-scaffolder.test.ts`:

```typescript
import { detectSaveButton, detectCancelButton, detectSaveSubmission, detectDetailGroup, buildSaveHandlers } from '../../src/stage3/scwin-scaffolder';

describe('save-flow detectors', () => {
  const XML = `<root>
    <xf:submission id="sbm_save"/>
    <xf:group class="tblbox" id="grp_detail"></xf:group>
    <xf:trigger id="btn_013" class="btn_cm pt"><xf:label><![CDATA[저장]]></xf:label></xf:trigger>
    <xf:trigger id="btn_014" class="btn_cm"><xf:label><![CDATA[취소]]></xf:label></xf:trigger>
  </root>`;
  it('detectSaveButton: 라벨 저장 trigger id', () => {
    expect(detectSaveButton(XML)).toEqual({ id: 'btn_013' });
  });
  it('detectCancelButton: 라벨 취소 trigger id', () => {
    expect(detectCancelButton(XML)).toEqual({ id: 'btn_014' });
  });
  it('detectSaveSubmission / detectDetailGroup', () => {
    expect(detectSaveSubmission(XML)).toBe(true);
    expect(detectDetailGroup(XML)).toBe('grp_detail');
    expect(detectSaveSubmission('<root></root>')).toBe(false);
    expect(detectDetailGroup('<root></root>')).toBeNull();
  });
  it('저장 라벨 없으면 null', () => {
    expect(detectSaveButton('<root><xf:trigger id="b"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></root>')).toBeNull();
  });
});

describe('buildSaveHandlers', () => {
  const GRID = { gridId: 'grd_005', dltId: 'dlt_memberBasic' };
  it('grp_detail 있을 때: validateGroup 포함 저장 + 취소 + submitdone', () => {
    const out = buildSaveHandlers({
      saveBtn: { id: 'btn_013' }, cancelBtn: { id: 'btn_014' },
      hasSaveSubmission: true, detailGroup: 'grp_detail', boundGrid: GRID,
    });
    expect(out).toContain('scwin.btn_013_onclick = async function() {');
    expect(out).toContain('if ($c.data.isModified(dlt_memberBasic)) {');
    expect(out).toContain('if ($c.data.validateGroup(grp_detail)) {');
    expect(out).toContain('if (await $c.win.confirm($c.data.getMessage("MSG_CM_00031"))) {');
    expect(out).toContain('$c.sbm.execute(sbm_save);');
    expect(out).toContain('await $c.win.alert($c.data.getMessage("MSG_CM_00032"));');
    expect(out).toContain('scwin.btn_014_onclick = function() {\n\t$c.data.undoGridView(grd_005);\n};');
    expect(out).toContain('scwin.sbm_save_submitdone = function(e) {\n};');
  });

  it('grp_detail 없을 때: validateGroup 생략', () => {
    const out = buildSaveHandlers({
      saveBtn: { id: 'btn_009' }, cancelBtn: null,
      hasSaveSubmission: true, detailGroup: null, boundGrid: { gridId: 'grd_010', dltId: 'dlt_orderList' },
    });
    expect(out).toContain('scwin.btn_009_onclick = async function() {');
    expect(out).toContain('if ($c.data.isModified(dlt_orderList)) {');
    expect(out).not.toContain('validateGroup');
    expect(out).toContain('$c.sbm.execute(sbm_save);');
    expect(out).not.toContain('undoGridView');  // 취소버튼 없음
  });

  it('저장버튼·sbm_save 없으면 저장 핸들러 없음 (취소만)', () => {
    const out = buildSaveHandlers({
      saveBtn: null, cancelBtn: { id: 'btn_x' },
      hasSaveSubmission: false, detailGroup: null, boundGrid: GRID,
    });
    expect(out).not.toContain('_onclick = async');
    expect(out).toContain('scwin.btn_x_onclick = function() {\n\t$c.data.undoGridView(grd_005);\n};');
    expect(out).not.toContain('submitdone');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: save-flow detector + buildSaveHandlers 케이스 FAIL.

- [ ] **Step 3: 구현 추가**

Append to `packages/figma-ingest/src/stage3/scwin-scaffolder.ts` (파일 끝, `scaffoldScwinHandlers` 함수 **앞** 어디든 — export 함수들이므로 위치 무관하나 가독성 위해 `scaffoldScwinHandlers` 직전에 추가):

```typescript
export interface LabeledButton { id: string; }

/** 라벨(CDATA) 텍스트가 정확히 label인 첫 xf:trigger의 id. */
function detectButtonByLabel(xml: string, label: string): LabeledButton | null {
  const re = /<xf:trigger\b[\s\S]*?<\/xf:trigger>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const block = m[0];
    const lblM = block.match(/<xf:label>\s*<!\[CDATA\[([^\]]*)\]\]>\s*<\/xf:label>/);
    if (lblM && lblM[1].trim() === label) {
      const idM = block.match(/\bid="([^"]+)"/);
      if (idM) return { id: idM[1] };
    }
  }
  return null;
}

/** 라벨 '저장' trigger. */
export function detectSaveButton(xml: string): LabeledButton | null {
  return detectButtonByLabel(xml, '저장');
}
/** 라벨 '취소' trigger. */
export function detectCancelButton(xml: string): LabeledButton | null {
  return detectButtonByLabel(xml, '취소');
}
/** sbm_save submission 존재 여부. */
export function detectSaveSubmission(xml: string): boolean {
  return /<xf:submission\b[^>]*\bid="sbm_save"/.test(xml);
}
/** 상세폼 그룹(id="grp_detail") 있으면 "grp_detail", 없으면 null. */
export function detectDetailGroup(xml: string): string | null {
  return /\bid="grp_detail"/.test(xml) ? 'grp_detail' : null;
}

export interface SaveDetections {
  saveBtn: LabeledButton | null;
  cancelBtn: LabeledButton | null;
  hasSaveSubmission: boolean;
  detailGroup: string | null;
  boundGrid: BoundGrid | null;
}

/**
 * 저장/취소 핸들러 + sbm_save_submitdone 블록 조립.
 *  - 저장: saveBtn+sbm_save+grid 시. detailGroup 있으면 validateGroup 포함.
 *  - 취소: cancelBtn+grid 시 (undoGridView).
 *  - submitdone: sbm_save 시.
 * 해당 없으면 빈 문자열.
 */
export function buildSaveHandlers(d: SaveDetections): string {
  const blocks: string[] = [];

  if (d.saveBtn && d.hasSaveSubmission && d.boundGrid) {
    const dlt = d.boundGrid.dltId;
    const confirmExec =
      `\t\t\tif (await $c.win.confirm($c.data.getMessage("MSG_CM_00031"))) {\n` +
      `\t\t\t\t$c.sbm.execute(sbm_save);\n` +
      `\t\t\t}`;
    let inner: string;
    if (d.detailGroup) {
      inner =
        `\t\tif ($c.data.validateGroup(${d.detailGroup})) {\n` +
        `${confirmExec}\n` +
        `\t\t}`;
    } else {
      // validateGroup 생략 → confirm 한 단계 위로 (들여쓰기 2탭)
      inner =
        `\t\tif (await $c.win.confirm($c.data.getMessage("MSG_CM_00031"))) {\n` +
        `\t\t\t$c.sbm.execute(sbm_save);\n` +
        `\t\t}`;
    }
    blocks.push(
      `scwin.${d.saveBtn.id}_onclick = async function() {\n` +
      `\tif ($c.data.isModified(${dlt})) {\n` +
      `${inner}\n` +
      `\t} else {\n` +
      `\t\tawait $c.win.alert($c.data.getMessage("MSG_CM_00032"));\n` +
      `\t}\n` +
      `};`,
    );
  }

  if (d.cancelBtn && d.boundGrid) {
    blocks.push(`scwin.${d.cancelBtn.id}_onclick = function() {\n\t$c.data.undoGridView(${d.boundGrid.gridId});\n};`);
  }

  if (d.hasSaveSubmission) {
    blocks.push(`scwin.sbm_save_submitdone = function(e) {\n};`);
  }

  return blocks.join('\n');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: 신규 7개 + 기존 20개 PASS (orchestrator는 Task 4에서 연결 — 여기선 pure 함수만).

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/scwin-scaffolder.ts packages/figma-ingest/tests/stage3/scwin-scaffolder.test.ts
git commit -m "feat(phase-2c3): scwin 저장/취소 detector + buildSaveHandlers (pure)"
```

---

### Task 4: scwin-scaffolder — scaffoldScwinHandlers에 저장 흐름 조립

**Files:** Modify `src/stage3/scwin-scaffolder.ts` + `tests/stage3/scwin-scaffolder.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

Append to `tests/stage3/scwin-scaffolder.test.ts`:

```typescript
describe('scaffoldScwinHandlers — 저장 흐름 통합 (2C-3)', () => {
  const MD = `<root>
  <xf:submission id="sbm_save"/>
  <script type="text/javascript" lazy="false"><![CDATA[
scwin.onpageload = function() {
};
]]></script>
  <xf:group class="tblbox" id="grp_detail"><xf:input id="ibx_empCdDetail" ref="data:dlt_memberBasic.EMP_CD" mandatory="true" label="사번"/></xf:group>
  <w2:gridView id="grd_005" dataList="data:dlt_memberBasic"></w2:gridView>
  <xf:trigger id="btn_013" class="btn_cm pt"><xf:label><![CDATA[저장]]></xf:label></xf:trigger>
  <xf:trigger id="btn_014" class="btn_cm"><xf:label><![CDATA[취소]]></xf:label></xf:trigger>
</root>`;

  it('master-detail형: 저장(validateGroup) + 취소 + submitdone + ev:onclick', () => {
    const out = scaffoldScwinHandlers(MD);
    expect(out).toContain('scwin.btn_013_onclick = async function() {');
    expect(out).toContain('$c.data.validateGroup(grp_detail)');
    expect(out).toContain('$c.sbm.execute(sbm_save);');
    expect(out).toContain('scwin.btn_014_onclick = function() {\n\t$c.data.undoGridView(grd_005);\n};');
    expect(out).toContain('scwin.sbm_save_submitdone = function(e) {');
    expect(out).toMatch(/id="btn_013"[^>]*ev:onclick="scwin.btn_013_onclick"/);
    expect(out).toMatch(/id="btn_014"[^>]*ev:onclick="scwin.btn_014_onclick"/);
    // grid onpageload(2C-1)도 함께
    expect(out).toContain('$c.util.setGridViewDelCheckBox([grd_005]);');
    expect(out).not.toMatch(/scwin\.onpageload = function\(\) \{\s*\};/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: 저장 흐름 통합 FAIL (scaffoldScwinHandlers 미연결).

- [ ] **Step 3: scaffoldScwinHandlers 교체**

`packages/figma-ingest/src/stage3/scwin-scaffolder.ts`의 기존 `scaffoldScwinHandlers` 함수(현재 마지막 함수)를 다음으로 교체:

```typescript
/**
 * 최종 XML에 조회 흐름 + 저장 흐름 scwin 핸들러를 스캐폴딩.
 * 조회(sbm_search/grid)·저장(sbm_save) 어느 것도 없으면 no-op(빈 onpageload 유지).
 */
export function scaffoldScwinHandlers(xml: string): string {
  const hasSubmission = detectSubmission(xml);
  const boundGrid = detectBoundGrid(xml);
  const hasSaveSubmission = detectSaveSubmission(xml);
  if (!hasSubmission && !boundGrid && !hasSaveSubmission) return xml; // no-op (Phase 0+1 회귀)

  const searchBtn = detectSearchButton(xml);
  const container = detectSearchContainer(xml);
  const saveBtn = detectSaveButton(xml);
  const cancelBtn = detectCancelButton(xml);
  const detailGroup = detectDetailGroup(xml);

  const queryScript = buildHandlerScript({ searchBtn, boundGrid, hasSubmission, container });
  const saveScript = buildSaveHandlers({ saveBtn, cancelBtn, hasSaveSubmission, detailGroup, boundGrid });
  const fullScript = saveScript ? `${queryScript}\n${saveScript}` : queryScript;

  let out = replaceOnpageload(xml, fullScript);
  if (searchBtn && hasSubmission) out = injectButtonOnclick(out, searchBtn.id);
  if (saveBtn && hasSaveSubmission && boundGrid) out = injectButtonOnclick(out, saveBtn.id);
  if (cancelBtn && boundGrid) out = injectButtonOnclick(out, cancelBtn.id);
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: 통합 1개 + 기존 전부 PASS.

전체:
Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: **골든 회귀 master-detail·search-grid FAIL 예상**(저장 흐름 추가 — Task 5에서 재생성). simple-form 골든 PASS(불변). 그 외 PASS. report에 골든 외 fail 없음 명시.

- [ ] **Step 5: 커밋**

```
git add packages/figma-ingest/src/stage3/scwin-scaffolder.ts packages/figma-ingest/tests/stage3/scwin-scaffolder.test.ts
git commit -m "feat(phase-2c3): scaffoldScwinHandlers에 저장/취소 흐름 조립 + ev:onclick"
```

---

### Task 5: E2E + 골든 재생성 + 전체 회귀

**Files:** Modify `tests/pipeline.e2e.test.ts` + `tests/golden/{master-detail,search-grid}.expected.xml`

- [ ] **Step 1: E2E 검증 추가**

`packages/figma-ingest/tests/pipeline.e2e.test.ts`의 Mock-LLM describe 블록에 추가(`makeMock` 헬퍼 재사용 — 파일에서 헬퍼명 확인):

```typescript
  it('master-detail: 저장 흐름 (sbm_save + validateGroup + 키 mandatory + 취소) (Phase 2C-3)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'master-detail.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('master-detail') });
    expect(xml).toContain('<xf:submission id="sbm_save"');
    expect(xml).toMatch(/_onclick = async function\(\) \{[\s\S]*\$c\.data\.validateGroup\(grp_detail\)/);
    expect(xml).toContain('$c.sbm.execute(sbm_save);');
    expect(xml).toContain('$c.data.undoGridView(grd_005)');
    expect(xml).toContain('scwin.sbm_save_submitdone');
    expect(xml).toContain('MSG_CM_00031');
    expect(xml).toContain('MSG_CM_00032');
    // 상세폼 그룹 + 키 필수
    expect(xml).toContain('<xf:group class="tblbox" id="grp_detail"');
    expect(xml).toMatch(/id="ibx_empCdDetail"[^>]*mandatory="true"/);
  }, 60000);

  it('search-grid: sbm_save + 저장(validateGroup 생략); 취소 없음 (Phase 2C-3)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'search-grid.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('search-grid') });
    expect(xml).toContain('<xf:submission id="sbm_save"');
    expect(xml).toContain('$c.sbm.execute(sbm_save);');
    expect(xml).not.toContain('validateGroup');   // 상세폼 없음
    expect(xml).not.toContain('undoGridView');     // 취소버튼 없음
  }, 60000);

  it('simple-form: 저장 흐름 없음 (Phase 2C-3 회귀)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });
    expect(xml).not.toContain('sbm_save');
    expect(xml).not.toContain('grp_detail');
  }, 60000);
```

> 주의: `makeMock` 헬퍼명·import는 기존 e2e 파일 패턴 그대로 사용. ref/mandatory 속성 순서(`id` 먼저)는 addRefToComponent/markMandatory가 id 뒤에 삽입하므로 위 정규식이 맞음. 실패 시 토큰 분리 검증으로 완화하되 핵심 유지하고 report에 명시.

- [ ] **Step 2: 골든 재생성**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
Run: `corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate`

- [ ] **Step 3: 골든 검토 (Read)**

- `master-detail.expected.xml`:
  - `<xf:submission id="sbm_save" ref="data:json,dlt_memberBasic" target="data:json,dlt_memberBasic" ...>`
  - script: 저장 핸들러(isModified→validateGroup(grp_detail)→confirm(MSG_CM_00031)→execute, else alert MSG_CM_00032) + 취소(undoGridView(grd_005)) + sbm_save_submitdone
  - 상세 그룹 `<xf:group class="tblbox" id="grp_detail"`, 키 입력 `ibx_empCdDetail ... mandatory="true"`
  - 저장(btn_013)·취소(btn_014)에 ev:onclick
  - **보존 확인**: 2C-2 상세 ref(EMP_CD/EMP_NM/DEPT_NM), 2C-1 onpageload grid, 2C-0 schbox, CDATA, well-formed
- `search-grid.expected.xml`: sbm_save + 저장 핸들러(validateGroup 없음), 취소 없음, 기존 sbm_search·조회 핸들러·dma_search ref·상세 ref 없음 보존
- `simple-form.expected.xml`: **불변**(sbm_save·grp_detail 없음). `git diff --stat`로 simple-form 미변경 확인. 변경됐으면 STOP & report.

- [ ] **Step 4: 골든 회귀 + 전체**

Run: `corepack pnpm --filter @kdh/figma-ingest test golden`
Expected: 3/3 PASS.

Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 전체 PASS, 0 fail (live-llm 1 skip).

- [ ] **Step 5: 커밋**

```
git add packages/figma-ingest/tests/golden/ packages/figma-ingest/tests/pipeline.e2e.test.ts
git commit -m "test(phase-2c3): 골든 재생성(저장 흐름) + E2E (master-detail/search-grid/simple-form)"
```

---

## Self-Review Notes

**Spec coverage:**
- §3-1 (sbm_save: 저장버튼+DataList, ref=target=DataList) → Task 1 ✓
- §3-2 (grp_detail id + 키 mandatory) → Task 2 ✓
- §3-3 (저장 핸들러 validateGroup 조건부 / 취소 undoGridView / submitdone / ev:onclick / async) → Task 3(pure) + Task 4(조립) ✓
- §4 (케이스: master-detail full / search-grid no-validateGroup·no-cancel / simple-form none) → Task 5 E2E + 골든 ✓
- §5 (엣지/no-op: 저장버튼·DataList·grp_detail·취소버튼 없음, 멱등, --no-llm) → Task 1/2/3 테스트 ✓
- §6 (테스팅) → 각 Task ✓
- §7 (성공 기준) → Task 5 전체 회귀 ✓
- §8 (리스크: 키만 mandatory, action TODO, region 역방향스캔, search-grid wire, scwin 분리=buildSaveHandlers) → 구현 반영 ✓

**Placeholder scan:** TODO_VERIFY/추가 필수필드 주석은 의도된 산출물 내용(코드 placeholder 아님). 모든 step에 실제 코드. Task 5는 makeMock 헬퍼명·속성순서 확인 명시.

**Type consistency:**
- `LabeledButton {id}`, `BoundGrid {gridId,dltId}`(기존), `SaveDetections {saveBtn,cancelBtn,hasSaveSubmission,detailGroup,boundGrid}` — Task 3 정의, Task 4 사용 ✓
- `detectSaveButton/detectCancelButton(xml): LabeledButton|null`, `detectSaveSubmission(xml): boolean`, `detectDetailGroup(xml): string|null`, `buildSaveHandlers(d): string` — 일관 ✓
- detail-binder `markMandatory(xml,id): string`, `assignDetailGroupId(xml,keyInputId): string` — Task 2 정의/사용 ✓
- submission-generator `generateSubmissions(xml,ir): string` — 시그니처 불변, 동작만 확장 ✓
- pipeline.ts 무변경 (모듈 이미 연결) ✓

**의존성 순서:** Task 1(sbm_save) · Task 2(grp_detail/mandatory)는 독립(둘 다 3.5). Task 3(pure)→Task 4(조립, 3 사용)→Task 5(E2E/골든, 1·2·3·4 전부 필요). forward ref 없음 ✓

---

*문서 끝.*
