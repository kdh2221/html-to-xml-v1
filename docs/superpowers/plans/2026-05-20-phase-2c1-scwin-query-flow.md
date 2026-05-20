# Phase 2C-1: scwin 핸들러 스캐폴딩 (조회 흐름) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최종 XML(Phase 1 + 2C-0 이후)에서 조회버튼·바인딩 grid·`sbm_search`·검색폼(`tbl_search`)을 탐지해 `scwin.onpageload`/`{btn}_onclick`/`sbm_search_submitdone` 핸들러를 생성, 화면을 실제 작동시킨다.

**Architecture:** Stage 4 결정론 모듈 `scaffoldScwinHandlers`. 탐지는 정규식(읽기), 편집은 문자열 치환 — 2C-0 schbox-normalizer와 동일하게 CDATA·포맷 보존. Phase 1 rename + button-modifier *이후* 실행(조회버튼이 `btn_cm sch`로 식별 가능해진 뒤). `sbm_search`·바인딩 grid 둘 다 없으면 no-op(빈 onpageload 유지 = Phase 0+1 회귀).

**Tech Stack:** TypeScript strict, Vitest, 정규식 탐지 + 문자열 치환.

**Spec reference:** [`docs/superpowers/specs/2026-05-20-phase-2c1-scwin-query-flow-design.md`](../specs/2026-05-20-phase-2c1-scwin-query-flow-design.md)

---

## ⚠️ 구현 노트 (필독)

- **검색 컨테이너는 고정 id `tbl_search`** (2C-0이 schbox_inner에 부여). WRM 표준 `setEnterKeyEvent(tbl_search, ...)`. 옛 `grp_search_001` 휴리스틱 불필요.
- **submission은 이미 `ev:submitdone="scwin.sbm_search_submitdone"` 속성 보유**(Phase 2B가 부여). 2C-1은 그 핸들러 *본문*만 script에 작성. submission 태그는 안 건드림.
- **조회버튼엔 아직 `ev:onclick` 없음** → 2C-1이 부여(이미 있으면 보존).
- **빈 onpageload 교체 대상**(골든 실측):
  ```
  scwin.onpageload = function() {
  };
  ```
  `<script ...><![CDATA[ ... ]]></script>` 내부. Phase 0+1 출력엔 이 단일 형태만 존재.
- **master-detail은 submission 없음**(DataMap 미추론) → `$c.sbm.execute(sbm_search)`가 깨진 참조가 되므로 onclick·setEnterKeyEvent·submitdone 미생성. grid EV-01 호출(2종)만.
- `String.replace`의 replacement에 `$c` 등 `$`가 들어가므로 **replacer 함수**(`() => script`)로 교체 — `$` 특수치환 회피.
- 들여쓰기는 **탭(`\t`)** (골든이 탭 사용).

---

## File Structure

```
packages/figma-ingest/
├── src/
│   ├── pipeline.ts                          # MODIFIED — Stage 4 wiring (button-modifier 직후)
│   └── stage3/
│       └── scwin-scaffolder.ts              # NEW — scaffoldScwinHandlers + 헬퍼
├── tests/
│   ├── stage3/
│   │   ├── scwin-scaffolder.test.ts         # NEW
│   │   └── pipeline-stage4.test.ts          # NEW (E2E noLlm + Mock LLM)
│   ├── pipeline.e2e.test.ts                 # MODIFIED — scwin 핸들러 검증
│   └── golden/*.expected.xml                # MODIFIED — 재생성 (scwin 핸들러)
```

---

### Task 1: 탐지 헬퍼 (정규식 읽기)

**Files:** Create `src/stage3/scwin-scaffolder.ts` + `tests/stage3/scwin-scaffolder.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/scwin-scaffolder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  detectSearchButton,
  detectBoundGrid,
  detectSubmission,
  detectSearchContainer,
} from '../../src/stage3/scwin-scaffolder';

const SIMPLE = `<root>
  <xf:submission id="sbm_search" ev:submitdone="scwin.sbm_search_submitdone"/>
  <xf:group class="schbox_inner" id="tbl_search"><xf:input id="ibx_a"/></xf:group>
  <xf:group class="btn_schbox"><xf:trigger ctype="Button" id="btn_006" type="button" hierarchy="btn_006" orgid="btn_006" class="btn_cm sch"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
  <w2:gridView id="grd_007" orgid="grd_007" dataList="data:dlt_list"></w2:gridView>
</root>`;

describe('detectSearchButton', () => {
  it('class에 sch 토큰 있는 trigger id 반환', () => {
    expect(detectSearchButton(SIMPLE)).toEqual({ id: 'btn_006' });
  });
  it('sch 없으면 null', () => {
    const xml = `<root><xf:trigger id="btn_x" class="btn_cm"><xf:label><![CDATA[저장]]></xf:label></xf:trigger></root>`;
    expect(detectSearchButton(xml)).toBeNull();
  });
  it('class 토큰이 정확히 sch (부분일치 schX 배제)', () => {
    const xml = `<root><xf:trigger id="btn_y" class="btn_cm schedule"><xf:label><![CDATA[일정]]></xf:label></xf:trigger></root>`;
    expect(detectSearchButton(xml)).toBeNull();
  });
});

describe('detectBoundGrid', () => {
  it('dataList 있는 gridView의 {gridId, dltId}', () => {
    expect(detectBoundGrid(SIMPLE)).toEqual({ gridId: 'grd_007', dltId: 'dlt_list' });
  });
  it('dataList 없으면 null', () => {
    const xml = `<root><w2:gridView id="grd_1"></w2:gridView></root>`;
    expect(detectBoundGrid(xml)).toBeNull();
  });
});

describe('detectSubmission', () => {
  it('sbm_search 있으면 true', () => {
    expect(detectSubmission(SIMPLE)).toBe(true);
  });
  it('없으면 false', () => {
    expect(detectSubmission(`<root></root>`)).toBe(false);
  });
});

describe('detectSearchContainer', () => {
  it('tbl_search 있으면 "tbl_search"', () => {
    expect(detectSearchContainer(SIMPLE)).toBe('tbl_search');
  });
  it('없으면 null', () => {
    expect(detectSearchContainer(`<root><xf:group id="other"/></root>`)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: FAIL (module 없음)

- [ ] **Step 3: 헬퍼 구현**

Create `packages/figma-ingest/src/stage3/scwin-scaffolder.ts`:

```typescript
/**
 * Stage 4 — 조회 흐름 scwin 핸들러 스캐폴딩.
 *
 * 최종 XML(Phase 1 rename + button-modifier + 2C-0 schbox 정규화 이후)에서
 * 조회버튼/바인딩 grid/submission/검색폼(tbl_search)을 탐지해
 * onpageload·{btn}_onclick·sbm_search_submitdone 핸들러를 생성한다.
 *
 * 탐지는 정규식(읽기), 편집은 문자열 치환 — schbox-normalizer와 동일하게 CDATA·포맷 보존.
 * (spec §3은 cheerio 읽기를 제안했으나, 단순 속성 조회라 정규식이 더 단순·일관·안전.)
 *
 * sbm_search·바인딩 grid 둘 다 없으면 no-op (빈 onpageload 유지 = Phase 0+1 회귀).
 */

export interface SearchButton { id: string; }
export interface BoundGrid { gridId: string; dltId: string; }

/** class 토큰에 정확히 "sch"를 가진 첫 xf:trigger의 id. */
export function detectSearchButton(xml: string): SearchButton | null {
  const re = /<xf:trigger\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0];
    const clsM = tag.match(/\bclass="([^"]*)"/);
    if (!clsM) continue;
    if (!clsM[1].split(/\s+/).includes('sch')) continue;
    const idM = tag.match(/\bid="([^"]+)"/);
    if (idM) return { id: idM[1] };
  }
  return null;
}

/** dataList="data:X" 를 가진 첫 w2:gridView의 {gridId, dltId}. */
export function detectBoundGrid(xml: string): BoundGrid | null {
  const re = /<w2:gridView\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0];
    const dlM = tag.match(/\bdataList="data:([^"]+)"/);
    const idM = tag.match(/\bid="([^"]+)"/);
    if (dlM && idM) return { gridId: idM[1], dltId: dlM[1] };
  }
  return null;
}

/** sbm_search submission 존재 여부. */
export function detectSubmission(xml: string): boolean {
  return /<xf:submission\b[^>]*\bid="sbm_search"/.test(xml);
}

/** 표준 schbox 검색폼(id="tbl_search")이 있으면 "tbl_search", 없으면 null. */
export function detectSearchContainer(xml: string): string | null {
  return /\bid="tbl_search"/.test(xml) ? 'tbl_search' : null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: detectSearchButton(3) + detectBoundGrid(2) + detectSubmission(2) + detectSearchContainer(2) = 9 PASS.

- [ ] **Step 5: 빌드 + 커밋 (PowerShell, Co-Authored-By 금지)**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/scwin-scaffolder.ts packages/figma-ingest/tests/stage3/scwin-scaffolder.test.ts
git commit -m "feat(phase-2c1): scwin-scaffolder 탐지 헬퍼 (조회버튼·grid·submission·tbl_search)"
```

---

### Task 2: 핸들러 스크립트 조립

**Files:** Modify `src/stage3/scwin-scaffolder.ts` + `tests/stage3/scwin-scaffolder.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

Append to `tests/stage3/scwin-scaffolder.test.ts`:

```typescript
import { buildHandlerScript } from '../../src/stage3/scwin-scaffolder';

describe('buildHandlerScript', () => {
  it('검색+grid+sbm (simple-form형): onpageload 3종 + onclick + submitdone', () => {
    const out = buildHandlerScript({
      searchBtn: { id: 'btn_006' },
      boundGrid: { gridId: 'grd_007', dltId: 'dlt_list' },
      hasSubmission: true,
      container: 'tbl_search',
    });
    expect(out).toContain('scwin.onpageload = function() {');
    expect(out).toContain('\t$c.win.setEnterKeyEvent(tbl_search, scwin.btn_006_onclick);');
    expect(out).toContain('\t$c.util.setGridViewDelCheckBox([grd_007]);');
    expect(out).toContain('\t$c.data.setChangeCheckedDc([dlt_list]);');
    expect(out).toContain('scwin.btn_006_onclick = function() {\n\t$c.sbm.execute(sbm_search);\n};');
    expect(out).toContain('scwin.sbm_search_submitdone = function(e) {\n};');
  });

  it('grid만 (master-detail형, sbm 없음): grid 2종, setEnterKeyEvent/onclick/submitdone 없음', () => {
    const out = buildHandlerScript({
      searchBtn: { id: 'btn_004' },
      boundGrid: { gridId: 'grd_005', dltId: 'dlt_memberBasic' },
      hasSubmission: false,
      container: 'tbl_search',
    });
    expect(out).toContain('\t$c.util.setGridViewDelCheckBox([grd_005]);');
    expect(out).toContain('\t$c.data.setChangeCheckedDc([dlt_memberBasic]);');
    expect(out).not.toContain('setEnterKeyEvent');
    expect(out).not.toContain('_onclick = function');
    expect(out).not.toContain('submitdone');
  });

  it('container 없으면 setEnterKeyEvent 생략(grid·onclick·submitdone은 sbm 따라)', () => {
    const out = buildHandlerScript({
      searchBtn: { id: 'btn_1' },
      boundGrid: { gridId: 'grd_1', dltId: 'dlt_1' },
      hasSubmission: true,
      container: null,
    });
    expect(out).not.toContain('setEnterKeyEvent');
    expect(out).toContain('scwin.btn_1_onclick = function()');
    expect(out).toContain('scwin.sbm_search_submitdone');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: buildHandlerScript 3개 FAIL.

- [ ] **Step 3: 구현 추가**

Append to `src/stage3/scwin-scaffolder.ts`:

```typescript
export interface ScwinDetections {
  searchBtn: SearchButton | null;
  boundGrid: BoundGrid | null;
  hasSubmission: boolean;
  container: string | null;
}

/**
 * 탐지 결과로 scwin 핸들러 스크립트 본문 조립.
 *  - onpageload: setEnterKeyEvent(검색버튼+sbm+container 충족 시) + grid EV-01 2종(grid 시)
 *  - {btn}_onclick: 검색버튼+sbm 충족 시 ($c.sbm.execute)
 *  - sbm_search_submitdone: sbm 시 (stub)
 */
export function buildHandlerScript(d: ScwinDetections): string {
  const lines: string[] = [];
  if (d.searchBtn && d.hasSubmission && d.container) {
    lines.push(`\t$c.win.setEnterKeyEvent(${d.container}, scwin.${d.searchBtn.id}_onclick);`);
  }
  if (d.boundGrid) {
    lines.push(`\t$c.util.setGridViewDelCheckBox([${d.boundGrid.gridId}]);`);
    lines.push(`\t$c.data.setChangeCheckedDc([${d.boundGrid.dltId}]);`);
  }

  const body = lines.length ? `\n${lines.join('\n')}\n` : '\n';
  const blocks: string[] = [`scwin.onpageload = function() {${body}};`];

  if (d.searchBtn && d.hasSubmission) {
    blocks.push(`scwin.${d.searchBtn.id}_onclick = function() {\n\t$c.sbm.execute(sbm_search);\n};`);
  }
  if (d.hasSubmission) {
    blocks.push(`scwin.sbm_search_submitdone = function(e) {\n};`);
  }
  return blocks.join('\n');
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: 12 PASS (9 + 3).

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/scwin-scaffolder.ts packages/figma-ingest/tests/stage3/scwin-scaffolder.test.ts
git commit -m "feat(phase-2c1): buildHandlerScript — onpageload/onclick/submitdone 조립"
```

---

### Task 3: XML 편집 헬퍼 (onpageload 교체 + 버튼 onclick 부여)

**Files:** Modify `src/stage3/scwin-scaffolder.ts` + `tests/stage3/scwin-scaffolder.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

Append:

```typescript
import { replaceOnpageload, injectButtonOnclick } from '../../src/stage3/scwin-scaffolder';

describe('replaceOnpageload', () => {
  it('빈 onpageload를 스크립트로 교체 ($c 보존)', () => {
    const xml = `<script><![CDATA[\nscwin.onpageload = function() {\n};\n]]></script>`;
    const script = `scwin.onpageload = function() {\n\t$c.util.setGridViewDelCheckBox([grd_007]);\n};\nscwin.sbm_search_submitdone = function(e) {\n};`;
    const out = replaceOnpageload(xml, script);
    expect(out).toContain('$c.util.setGridViewDelCheckBox([grd_007]);');
    expect(out).toContain('scwin.sbm_search_submitdone = function(e) {');
    // CDATA 래퍼 보존
    expect(out).toContain('<![CDATA[');
    expect(out).toContain(']]></script>');
  });

  it('빈 onpageload 없으면 원본 그대로', () => {
    const xml = `<script><![CDATA[\nscwin.foo = 1;\n]]></script>`;
    expect(replaceOnpageload(xml, 'X')).toBe(xml);
  });
});

describe('injectButtonOnclick', () => {
  it('ev:onclick 부여(없을 때)', () => {
    const xml = `<xf:trigger id="btn_006" class="btn_cm sch"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>`;
    const out = injectButtonOnclick(xml, 'btn_006');
    expect(out).toContain('ev:onclick="scwin.btn_006_onclick"');
    // 라벨 CDATA 보존
    expect(out).toContain('<![CDATA[조회]]>');
  });

  it('이미 ev:onclick 있으면 보존(중복 부여 안 함)', () => {
    const xml = `<xf:trigger id="btn_006" class="btn_cm sch" ev:onclick="scwin.existing"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>`;
    const out = injectButtonOnclick(xml, 'btn_006');
    expect(out).toBe(xml);
    expect((out.match(/ev:onclick=/g) || []).length).toBe(1);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: replaceOnpageload(2) + injectButtonOnclick(2) FAIL.

- [ ] **Step 3: 구현 추가**

Append to `src/stage3/scwin-scaffolder.ts`:

```typescript
/**
 * 빈 onpageload(`scwin.onpageload = function() {};`)를 핸들러 스크립트로 교체.
 * replacement에 $가 있으므로 replacer 함수로 치환($ 특수해석 회피). 매칭 없으면 원본.
 */
export function replaceOnpageload(xml: string, handlerScript: string): string {
  return xml.replace(/scwin\.onpageload = function\(\) \{\s*\};/, () => handlerScript);
}

/** 버튼 opening 태그에 ev:onclick 부여(이미 있으면 보존). */
export function injectButtonOnclick(xml: string, buttonId: string): string {
  const re = new RegExp(`(<xf:trigger\\b[^>]*\\bid="${buttonId}"[^>]*?)(\\s*>)`);
  return xml.replace(re, (full, head: string, tail: string) => {
    if (/\bev:onclick=/.test(head)) return full;
    return `${head} ev:onclick="scwin.${buttonId}_onclick"${tail}`;
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: 16 PASS (12 + 4).

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/scwin-scaffolder.ts packages/figma-ingest/tests/stage3/scwin-scaffolder.test.ts
git commit -m "feat(phase-2c1): replaceOnpageload + injectButtonOnclick (CDATA/포맷 보존)"
```

---

### Task 4: scaffoldScwinHandlers orchestrator

**Files:** Modify `src/stage3/scwin-scaffolder.ts` + `tests/stage3/scwin-scaffolder.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

Append:

```typescript
import { scaffoldScwinHandlers } from '../../src/stage3/scwin-scaffolder';

const FULL = `<root>
  <xf:submission id="sbm_search" ev:submitdone="scwin.sbm_search_submitdone"/>
  <script type="text/javascript" lazy="false"><![CDATA[
scwin.onpageload = function() {
};
]]></script>
  <xf:group class="schbox_inner" id="tbl_search"><xf:input id="ibx_a"/></xf:group>
  <xf:group class="btn_schbox"><xf:trigger id="btn_006" type="button" class="btn_cm sch"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
  <w2:gridView id="grd_007" dataList="data:dlt_list"></w2:gridView>
</root>`;

describe('scaffoldScwinHandlers (orchestrator)', () => {
  it('simple-form형: onpageload 3종 + 버튼 onclick + submitdone', () => {
    const out = scaffoldScwinHandlers(FULL);
    expect(out).toContain('$c.win.setEnterKeyEvent(tbl_search, scwin.btn_006_onclick);');
    expect(out).toContain('$c.util.setGridViewDelCheckBox([grd_007]);');
    expect(out).toContain('$c.data.setChangeCheckedDc([dlt_list]);');
    expect(out).toContain('scwin.btn_006_onclick = function() {');
    expect(out).toContain('$c.sbm.execute(sbm_search);');
    expect(out).toContain('scwin.sbm_search_submitdone = function(e) {');
    expect(out).toContain('ev:onclick="scwin.btn_006_onclick"');
    // 빈 onpageload는 사라짐
    expect(out).not.toMatch(/scwin\.onpageload = function\(\) \{\s*\};/);
  });

  it('master-detail형(sbm 없음): grid 2종만, onclick·setEnterKeyEvent·submitdone 없음, 버튼 onclick 미부여', () => {
    const md = `<root>
  <script type="text/javascript" lazy="false"><![CDATA[
scwin.onpageload = function() {
};
]]></script>
  <xf:group class="schbox_inner" id="tbl_search"><xf:input id="ibx_a"/></xf:group>
  <xf:group class="btn_schbox"><xf:trigger id="btn_004" type="button" class="btn_cm sch"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
  <w2:gridView id="grd_005" dataList="data:dlt_memberBasic"></w2:gridView>
</root>`;
    const out = scaffoldScwinHandlers(md);
    expect(out).toContain('$c.util.setGridViewDelCheckBox([grd_005]);');
    expect(out).toContain('$c.data.setChangeCheckedDc([dlt_memberBasic]);');
    expect(out).not.toContain('setEnterKeyEvent');
    expect(out).not.toContain('$c.sbm.execute');
    expect(out).not.toContain('submitdone');
    expect(out).not.toContain('ev:onclick');
  });

  it('no-op: sbm·grid 둘 다 없으면 원본 그대로', () => {
    const xml = `<root>
  <script><![CDATA[
scwin.onpageload = function() {
};
]]></script>
</root>`;
    expect(scaffoldScwinHandlers(xml)).toBe(xml);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: scaffoldScwinHandlers 3개 FAIL.

- [ ] **Step 3: 구현 추가**

Append to `src/stage3/scwin-scaffolder.ts`:

```typescript
/**
 * 최종 XML에 조회 흐름 scwin 핸들러를 스캐폴딩.
 * sbm_search·바인딩 grid 둘 다 없으면 no-op(빈 onpageload 유지).
 */
export function scaffoldScwinHandlers(xml: string): string {
  const hasSubmission = detectSubmission(xml);
  const boundGrid = detectBoundGrid(xml);
  if (!hasSubmission && !boundGrid) return xml; // no-op (Phase 0+1 회귀)

  const searchBtn = detectSearchButton(xml);
  const container = detectSearchContainer(xml);
  const script = buildHandlerScript({ searchBtn, boundGrid, hasSubmission, container });

  let out = replaceOnpageload(xml, script);
  if (searchBtn && hasSubmission) {
    out = injectButtonOnclick(out, searchBtn.id);
  }
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test scwin-scaffolder`
Expected: 19 PASS (16 + 3).

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/scwin-scaffolder.ts packages/figma-ingest/tests/stage3/scwin-scaffolder.test.ts
git commit -m "feat(phase-2c1): scaffoldScwinHandlers orchestrator (조회 흐름 + no-op)"
```

---

### Task 5: pipeline Stage 4 wiring

**Files:** Modify `src/pipeline.ts` + Create `tests/stage3/pipeline-stage4.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/pipeline-stage4.test.ts`:

```typescript
import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../../src/pipeline';
import { closeBrowser } from '../../src/dom-extractor';
import { MockLLMClient } from '../../src/stage3/llm-mock';

const FIX_DIR = path.join(__dirname, '..', 'fixtures');
const RESP_DIR = path.join(FIX_DIR, 'llm-responses');

function makeMock(fixture: string): MockLLMClient {
  const ir = JSON.parse(fs.readFileSync(path.join(RESP_DIR, `${fixture}.json`), 'utf-8'));
  return new MockLLMClient(ir);
}

describe('pipeline Stage 4 scwin scaffolding', () => {
  afterAll(async () => { await closeBrowser(); });

  it('simple-form: 조회 흐름 핸들러 생성', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });
    expect(xml).toContain('$c.win.setEnterKeyEvent(tbl_search, scwin.');
    expect(xml).toContain('$c.sbm.execute(sbm_search);');
    expect(xml).toContain('$c.util.setGridViewDelCheckBox([');
    expect(xml).toContain('scwin.sbm_search_submitdone = function(e) {');
    expect(xml).toMatch(/ev:onclick="scwin\.\w+_onclick"/);
    expect(xml).not.toMatch(/scwin\.onpageload = function\(\) \{\s*\};/);
  }, 60000);

  it('noLlm: 빈 onpageload 유지 (no-op)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { noLlm: true });
    expect(xml).toMatch(/scwin\.onpageload = function\(\) \{\s*\};/);
    expect(xml).not.toContain('$c.sbm.execute');
  }, 60000);
});
```

먼저 `MockLLMClient` 생성자 시그니처가 `new MockLLMClient(ir)` 형태인지 `tests/pipeline.e2e.test.ts` 또는 `src/stage3/llm-mock.ts`에서 확인하고, 다르면 그 파일의 makeMock 패턴을 그대로 복사할 것. fixture JSON 경로(`tests/fixtures/llm-responses/simple-form.json`)도 존재 확인. **API를 추측하지 말 것.**

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline-stage4`
Expected: simple-form FAIL (핸들러 미연결 → 빈 onpageload 잔존). noLlm은 이미 PASS일 수 있음(no-op).

- [ ] **Step 3: pipeline.ts에 Stage 4 연결**

Edit `packages/figma-ingest/src/pipeline.ts`. import 추가 (stage3 import들 근처):
```typescript
import { scaffoldScwinHandlers } from './stage3/scwin-scaffolder';
```

현재 마무리 블록:
```typescript
  // Phase 1 룰: ID prefix UI-01 + 버튼 modifier
  let result = renameIdToUi01(enrichedXml);
  result = applyButtonModifiersInXml(result);
  options.onStage?.('phase1-finalized', result);

  return result;
```

다음으로 교체 (button-modifier 직후 Stage 4 삽입):
```typescript
  // Phase 1 룰: ID prefix UI-01 + 버튼 modifier
  let result = renameIdToUi01(enrichedXml);
  result = applyButtonModifiersInXml(result);

  // Stage 4: scwin 조회 흐름 핸들러 (sbm_search·grid 없으면 no-op)
  result = scaffoldScwinHandlers(result);
  options.onStage?.('phase1-finalized', result);

  return result;
```

(button-modifier가 `btn_cm sch`를 부여한 *후* 실행 — 조회버튼 식별 가능. 2C-0이 `tbl_search`를 부여한 후라 검색 컨테이너 탐지도 결정적.)

- [ ] **Step 4: 빌드 + 테스트**

Run: `corepack pnpm --filter @kdh/figma-ingest build` (clean)
Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline-stage4`
Expected: 2개 PASS.

전체:
Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: **골든 회귀 3개 FAIL 예상** (골든이 아직 빈 onpageload — Task 6에서 재생성). 그 외 PASS. report에 "골든 3 FAIL(예상), 그 외 PASS" 명시. 비-골든 테스트가 깨지면 조사.

- [ ] **Step 5: 커밋**

```
git add packages/figma-ingest/src/pipeline.ts packages/figma-ingest/tests/stage3/pipeline-stage4.test.ts
git commit -m "feat(phase-2c1): pipeline Stage 4(scaffoldScwinHandlers) 연결 — button-modifier 직후"
```

---

### Task 6: E2E 보강 + 골든 재생성 + 전체 회귀

**Files:** Modify `tests/pipeline.e2e.test.ts` + `tests/golden/*.expected.xml`

- [ ] **Step 1: E2E에 scwin 핸들러 검증 추가**

`packages/figma-ingest/tests/pipeline.e2e.test.ts`의 Mock-LLM describe 블록에 추가(`makeMock` 헬퍼 재사용 — 파일에서 헬퍼명·import 확인):

```typescript
  it('simple-form: scwin 조회 핸들러 (Phase 2C-1)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });
    expect(xml).toContain('$c.win.setEnterKeyEvent(tbl_search, scwin.');
    expect(xml).toContain('$c.sbm.execute(sbm_search);');
    expect(xml).toContain('scwin.sbm_search_submitdone = function(e) {');
    expect(xml).toMatch(/<xf:trigger\b[^>]*class="btn_cm sch"[^>]*ev:onclick="scwin\.\w+_onclick"/);
  }, 60000);

  it('master-detail: grid 호출만, sbm.execute 없음 (Phase 2C-1)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'master-detail.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('master-detail') });
    expect(xml).toContain('$c.util.setGridViewDelCheckBox([');
    expect(xml).not.toContain('$c.sbm.execute');
    expect(xml).not.toContain('sbm_search_submitdone');
  }, 60000);
```

> 주의: E2E의 `ev:onclick` 정규식은 trigger 태그 안에서 `class="btn_cm sch"`와 `ev:onclick`이 함께 있는지 확인. button-modifier가 class 순서/속성 위치를 어떻게 두는지에 따라 `class`와 `ev:onclick` 순서가 다를 수 있으니, 실패하면 두 토큰을 각각 `toContain`으로 분리 검증하도록 완화하되 핵심(조회버튼에 onclick 존재)은 유지.

- [ ] **Step 2: 골든 재생성**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
Run: `corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate`
Expected: 3개 골든 재생성.

- [ ] **Step 3: 골든 검토 (Read)**

각 골든 script 블록 + 조회버튼 확인:
- simple-form/search-grid: onpageload에 `setEnterKeyEvent(tbl_search, scwin.{btn}_onclick)` + `setGridViewDelCheckBox([grd_*])` + `setChangeCheckedDc([dlt_*])`; `scwin.{btn}_onclick`에 `$c.sbm.execute(sbm_search);`; `scwin.sbm_search_submitdone = function(e) {};`; 조회버튼에 `ev:onclick="scwin.{btn}_onclick"`. CDATA(`<![CDATA[조회]]>`)·schbox 구조(2C-0) 보존, well-formed.
- master-detail: onpageload에 grid 2종만, `setEnterKeyEvent`/`$c.sbm.execute`/`submitdone` 없음, 조회버튼 `ev:onclick` 없음.
- 구조 깨짐·CDATA 손상·2C-0 schbox 소실 시 STOP 후 report.

- [ ] **Step 4: 골든 회귀 + 전체**

Run: `corepack pnpm --filter @kdh/figma-ingest test golden`
Expected: 3/3 PASS.

Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 전체 PASS, fail 0 (live-llm 1 skip).

- [ ] **Step 5: 커밋**

```
git add packages/figma-ingest/tests/golden/ packages/figma-ingest/tests/pipeline.e2e.test.ts
git commit -m "test(phase-2c1): 골든 재생성(scwin 핸들러) + E2E (simple/master-detail)"
```

---

## Self-Review Notes

**Spec coverage:**
- §2 (Stage 4, Phase 1 이후) → Task 5 ✓
- §3 (모듈 scwin-scaffolder, 탐지 읽기 / 편집 치환) → Task 1·3 ✓ (cheerio 대신 정규식 — 아래 deviation)
- §4 (탐지: 조회버튼 sch / grid dataList / sbm_search / tbl_search) → Task 1 ✓
- §5 (동작 로직: no-op, onpageload 조립, onclick, submitdone) → Task 2·4 ✓
- §6 (케이스: simple/search=전체, master-detail=grid만, noLlm=빈) → Task 4·6 ✓
- §7 (생성 예시) → Task 2·4 테스트 + Task 6 골든 ✓
- §8 (테스팅: unit/E2E/골든) → 각 Task + Task 6 ✓
- §9 (성공 기준) → Task 6 전체 회귀 ✓
- §10 (리스크: tbl_search 고정, btn_006 명명, stub 본문, 단일 onpageload 가정) → 구현 반영 ✓
- §10 미해결 1 (container 없으면 setEnterKeyEvent 생략) → Task 2 buildHandlerScript의 `container` 조건 + 테스트 ✓
- §11 (before/after) → Task 6 골든 ✓

> **스펙과의 차이**: 스펙 §3은 "탐지는 cheerio 읽기"를 제안했으나, 구현은 **정규식 읽기**로 진행. 이유: 탐지가 모두 단순 속성 조회(sch 토큰 / dataList / id 존재)라 cheerio 네임스페이스 셀렉터(`xf\\:trigger`, xmlMode)보다 정규식이 단순·일관(2C-0 schbox-normalizer와 동일 패턴)·저위험. 편집은 스펙대로 문자열 치환(CDATA 보존).

**Placeholder scan:** TBD/TODO 없음. 모든 step에 실제 코드. (단, Task 5·6은 `MockLLMClient`/`makeMock` 시그니처·fixture 경로를 구현 전 확인하라고 명시 — 추측 금지.)

**Type consistency:**
- `SearchButton {id}`, `BoundGrid {gridId, dltId}`, `ScwinDetections {searchBtn, boundGrid, hasSubmission, container}` — Task 1·2 정의, Task 4에서 사용 ✓
- `detectSearchButton(xml): SearchButton|null`, `detectBoundGrid(xml): BoundGrid|null`, `detectSubmission(xml): boolean`, `detectSearchContainer(xml): string|null`, `buildHandlerScript(d: ScwinDetections): string`, `replaceOnpageload(xml, script): string`, `injectButtonOnclick(xml, buttonId): string`, `scaffoldScwinHandlers(xml): string` — 일관 ✓
- `detectSearchContainer`는 buttonId 인자 없음(2C-0 후 tbl_search 고정) — 스펙 §4 갱신과 일치 ✓

**의존성 순서:** Task 1(탐지) → 2(조립, 1의 타입 사용) → 3(편집) → 4(orchestrator, 1-3 사용) → 5(pipeline) → 6(골든/E2E). forward ref 없음 ✓

---

*문서 끝.*
