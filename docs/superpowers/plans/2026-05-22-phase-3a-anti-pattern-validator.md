# Phase 3A: 정적 안티패턴 검증기 + CRITICAL 해결 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 최종 XML을 정적 검사해 9개 deepsquare 안티패턴 위반을 대안과 함께 리포트하고, CRITICAL 중 안전한 #2(await→async)는 자동수정, #9(grid 컬럼 정렬)는 grid-reconciler를 sourceBodyId 매칭으로 근본개선한다.

**Architecture:** 신규 `src/validate/anti-pattern-validator.ts`(순수 checker 9종 + 합산)·`anti-pattern-fixer.ts`(fixAsyncAwait). 파이프라인은 scwin 이후 fixAsyncAwait 적용 + `onStage('validation')` 관찰(비파괴, 반환 string 불변). CLI는 stderr 리포트 + exit 0. `grid-reconciler.ts`는 위치순→sourceBodyId 매칭(부재 시 위치 fallback)으로 개선, 3 골든 출력 불변.

**Tech Stack:** TypeScript strict, Vitest, cheerio(구조 룰 읽기) + 정규식(script 룰).

**Spec reference:** [`docs/superpowers/specs/2026-05-22-phase-3a-anti-pattern-validator-design.md`](../specs/2026-05-22-phase-3a-anti-pattern-validator-design.md)

---

## ⚠️ 구현 노트 (필독)

- **cheerio 네임스페이스 셀렉터 금지**: `$('w2\\:column')`은 throw. 대신 `$('*').filter((_, el) => tagNameOf(el) === 'w2:column')` 사용(`tagNameOf`는 소문자화 — cheerio가 `w2:gridView`를 `w2:gridview`로 보존). region-parser와 동일 패턴.
- **빈 id 제외**: 우리 XML엔 `id=""`가 많음 → checker는 `if (!id) return;`로 빈 문자열 스킵.
- **validator는 순수·non-throw·XML 불변**. fixer는 문자열 치환(순수).
- **#9 출력 중립성**: sourceBodyId 매칭이 실패(어떤 body id도 sourceBodyId와 불일치)하면 위치순 fallback → 현 동작과 동일. 매칭 성공 시에도 chk-free·순서대로면 위치순과 동일 결과 → 3 골든 불변(테스트로 보장).
- Co-Authored-By 트레일러 금지.

---

## File Structure

```
packages/figma-ingest/
├── src/
│   ├── validate/
│   │   ├── anti-pattern-validator.ts   # NEW — Violation + 9 checker + validateAntiPatterns
│   │   └── anti-pattern-fixer.ts       # NEW — fixAsyncAwait (#2)
│   ├── stage3/grid-reconciler.ts       # MODIFY — sourceBodyId/chk-aware (#9)
│   ├── pipeline.ts                     # MODIFY — fixAsyncAwait + onStage('validation')
│   └── cli.ts                          # MODIFY — 위반 리포트 stderr
└── tests/
    ├── validate/
    │   ├── anti-pattern-validator.test.ts  # NEW
    │   └── anti-pattern-fixer.test.ts      # NEW
    ├── stage3/grid-reconciler.test.ts      # MODIFY — chk-aware 케이스
    └── pipeline.e2e.test.ts                # MODIFY — onStage('validation') 1건
```

---

### Task 1: validator 코어 + CRITICAL 구조 checker (#8 #9 #10)

**Files:** Create `src/validate/anti-pattern-validator.ts` + `tests/validate/anti-pattern-validator.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/validate/anti-pattern-validator.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { checkDuplicateIds, checkGridColumns, checkSubmissionRefs } from '../../src/validate/anti-pattern-validator';

describe('checkDuplicateIds (#8)', () => {
  it('컴포넌트 id 중복 → critical', () => {
    const xml = `<root><xf:input id="ibx_x"/><xf:select1 id="ibx_x"/></root>`;
    const v = checkDuplicateIds(xml);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('ANTI-08');
    expect(v[0].severity).toBe('critical');
    expect(v[0].location).toBe('ibx_x');
    expect(v[0].remediation).toContain('접미사');
  });
  it('데이터 컬럼 id 반복(columnInfo/header/gBody)은 위반 아님', () => {
    const xml = `<root>
      <w2:dataList id="dlt_a"><w2:columnInfo><w2:column id="EMP_CD"/></w2:columnInfo></w2:dataList>
      <w2:gridView id="grd_a"><w2:header><w2:row><w2:column id="EMP_CD"/></w2:row></w2:header>
      <w2:gBody><w2:row><w2:column id="EMP_CD"/></w2:row></w2:gBody></w2:gridView></root>`;
    expect(checkDuplicateIds(xml)).toEqual([]);
  });
  it('빈 id는 무시', () => {
    expect(checkDuplicateIds(`<root><xf:group id=""/><xf:group id=""/></root>`)).toEqual([]);
  });
});

describe('checkGridColumns (#9)', () => {
  const grid = (h: string, b: string) =>
    `<root><w2:gridView id="grd_007"><w2:header><w2:row>${h}</w2:row></w2:header><w2:gBody><w2:row>${b}</w2:row></w2:gBody></w2:gridView></root>`;
  it('header/gBody 개수 불일치 → critical', () => {
    const v = checkGridColumns(grid('<w2:column id="A"/><w2:column id="B"/><w2:column id="C"/>', '<w2:column id="A"/><w2:column id="B"/>'));
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('ANTI-09');
    expect(v[0].location).toBe('grd_007');
  });
  it('1:1 일치 → 위반 없음', () => {
    expect(checkGridColumns(grid('<w2:column id="A"/><w2:column id="B"/>', '<w2:column id="A"/><w2:column id="B"/>'))).toEqual([]);
  });
});

describe('checkSubmissionRefs (#10)', () => {
  it('미선언 ref → critical', () => {
    const xml = `<root><w2:dataList id="dlt_list"/><xf:submission id="sbm_search" ref="data:json,dma_search" target="data:json,dlt_list"/></root>`;
    const v = checkSubmissionRefs(xml);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('ANTI-10');
    expect(v[0].location).toBe('sbm_search→dma_search');
  });
  it('선언된 ref/target → 위반 없음', () => {
    const xml = `<root><w2:dataMap id="dma_search"/><w2:dataList id="dlt_list"/><xf:submission id="sbm_search" ref="data:json,dma_search" target="data:json,dlt_list"/></root>`;
    expect(checkSubmissionRefs(xml)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test anti-pattern-validator`
Expected: FAIL (module 없음)

- [ ] **Step 3: 구현**

Create `packages/figma-ingest/src/validate/anti-pattern-validator.ts`:

```typescript
/**
 * Phase 3A — 최종 XML의 deepsquare 안티패턴 정적 검출 (순수·non-throw·XML 불변).
 * 각 위반은 remediation(올바른 대안)을 동반한다. 탐지는 cheerio(구조) + 정규식(script).
 */
import * as cheerio from 'cheerio';

export interface Violation {
  rule: string;
  severity: 'critical' | 'warning';
  message: string;
  remediation: string;
  location?: string;
}

/** cheerio가 보존하는 태그 원형(`w2:gridView`)을 소문자로 정규화해 비교. */
function tagNameOf(el: unknown): string {
  const node = el as { tagName?: string; name?: string };
  return (node.tagName ?? node.name ?? '').toLowerCase();
}

function byTag($: cheerio.CheerioAPI, root: cheerio.Cheerio<never> | null, tag: string) {
  const scope = root ?? $.root();
  return scope.find('*').filter((_, el) => tagNameOf(el) === tag);
}

/** #8: 컴포넌트 id 중복 (w2:column/w2:key 데이터 네임스페이스 제외). */
export function checkDuplicateIds(xml: string): Violation[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const counts = new Map<string, number>();
  $('[id]').each((_, el) => {
    const tag = tagNameOf(el);
    if (tag === 'w2:column' || tag === 'w2:key') return;
    const id = $(el).attr('id');
    if (!id) return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  const out: Violation[] = [];
  for (const [id, n] of counts) {
    if (n >= 2) out.push({
      rule: 'ANTI-08', severity: 'critical',
      message: `컴포넌트 id "${id}"가 ${n}회 선언됨 (화면 전체에서 유일해야 함)`,
      remediation: '조회/상세 등 같은 필드는 접미사로 구분 (예: ibx_empNm vs ibx_empNmDetail)',
      location: id,
    });
  }
  return out;
}

/** #9: gridView header/gBody 컬럼 1:1 (개수·id). */
export function checkGridColumns(xml: string): Violation[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out: Violation[] = [];
  byTag($, null, 'w2:gridview').each((_, grid) => {
    const $grid = $(grid);
    const gridId = $grid.attr('id') || '(no id)';
    const colIds = (containerTag: string): string[] => {
      const container = byTag($, $grid, containerTag).first();
      if (container.length === 0) return [];
      return byTag($, container, 'w2:column').toArray().map(c => $(c).attr('id') || '');
    };
    const header = colIds('w2:header');
    const body = colIds('w2:gbody');
    if (header.length !== body.length) {
      out.push({ rule: 'ANTI-09', severity: 'critical',
        message: `GridView ${gridId}: header 컬럼 ${header.length}개 vs gBody ${body.length}개 불일치`,
        remediation: 'header와 gBody 컬럼은 1:1로 일치 (개수·id 동일)', location: gridId });
    } else if (header.join(',') !== body.join(',')) {
      out.push({ rule: 'ANTI-09', severity: 'critical',
        message: `GridView ${gridId}: header/gBody 컬럼 id 불일치 (${header.join(',')} vs ${body.join(',')})`,
        remediation: 'header/gBody column id는 동일 데이터 컬럼 id', location: gridId });
    }
  });
  return out;
}

/** #10: submission ref/target이 dataCollection에 선언됨. */
export function checkSubmissionRefs(xml: string): Violation[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const declared = new Set<string>();
  $('[id]').each((_, el) => {
    const tag = tagNameOf(el);
    if (tag === 'w2:datamap' || tag === 'w2:datalist') {
      const id = $(el).attr('id');
      if (id) declared.add(id);
    }
  });
  const out: Violation[] = [];
  byTag($, null, 'xf:submission').each((_, sub) => {
    const $sub = $(sub);
    const subId = $sub.attr('id') || '(no id)';
    for (const attr of ['ref', 'target']) {
      const v = $sub.attr(attr);
      if (!v) continue;
      const m = v.match(/^data:(?:json,)?([^.,\s"]+)/);
      if (!m) continue;
      if (!declared.has(m[1])) {
        out.push({ rule: 'ANTI-10', severity: 'critical',
          message: `submission ${subId}의 ${attr} "${m[1]}"가 dataCollection에 미선언`,
          remediation: 'ref/target이 참조하는 DataMap/DataList를 동일 파일 w2:dataCollection에 선언',
          location: `${subId}→${m[1]}` });
      }
    }
  });
  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test anti-pattern-validator`
Expected: 7 PASS (#8 3, #9 2, #10 2).

- [ ] **Step 5: 빌드 + 커밋 (Co-Authored-By 금지)**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/validate/anti-pattern-validator.ts packages/figma-ingest/tests/validate/anti-pattern-validator.test.ts
git commit -m "feat(phase-3a): anti-pattern validator CRITICAL 구조 checker (#8 #9 #10)"
```

---

### Task 2: validator 가드 checker (#2 #1 #3 #4 #11 #15) + 합산

**Files:** Modify `src/validate/anti-pattern-validator.ts` + `tests/validate/anti-pattern-validator.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

Append to `tests/validate/anti-pattern-validator.test.ts`:

```typescript
import { checkAsyncAwait, checkForbiddenApi, checkDirectDialog, checkEventNames, checkHeaderInputType, checkCancelReform, validateAntiPatterns } from '../../src/validate/anti-pattern-validator';

const script = (body: string) => `<script type="text/javascript" lazy="false"><![CDATA[\n${body}\n]]></script>`;

describe('checkAsyncAwait (#2)', () => {
  it('async 없이 await → critical', () => {
    const xml = script(`scwin.btn_x_onclick = function() {\n\tawait $c.win.confirm("x");\n};`);
    const v = checkAsyncAwait(xml);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('ANTI-02');
    expect(v[0].location).toBe('btn_x_onclick');
  });
  it('async function with await → 위반 없음', () => {
    expect(checkAsyncAwait(script(`scwin.btn_x_onclick = async function() {\n\tawait $c.win.confirm("x");\n};`))).toEqual([]);
  });
  it('await 없는 function → 위반 없음', () => {
    expect(checkAsyncAwait(script(`scwin.onpageload = function() {\n\t$c.util.x();\n};`))).toEqual([]);
  });
});

describe('checkForbiddenApi (#1)', () => {
  it('document.getElementById → warning', () => {
    expect(checkForbiddenApi(script(`var a = document.getElementById("x");`))[0].rule).toBe('ANTI-01');
  });
  it('정상 script → 없음', () => {
    expect(checkForbiddenApi(script(`$c.util.getComponent("x");`))).toEqual([]);
  });
});

describe('checkDirectDialog (#3)', () => {
  it('bare confirm( → warning', () => {
    expect(checkDirectDialog(script(`if (confirm("x")) {}`))[0].rule).toBe('ANTI-03');
  });
  it('$c.win.confirm은 정상', () => {
    expect(checkDirectDialog(script(`await $c.win.confirm("x");`))).toEqual([]);
  });
});

describe('checkEventNames (#4)', () => {
  it('허용 외 ev:onrowclick → warning', () => {
    expect(checkEventNames(`<xf:trigger ev:onrowclick="x"/>`)[0].rule).toBe('ANTI-04');
  });
  it('허용 이벤트(onclick/onpageload/submitdone) → 없음', () => {
    expect(checkEventNames(`<a ev:onclick="x"/><b ev:onpageload="y"/><c ev:submitdone="z"/>`)).toEqual([]);
  });
});

describe('checkHeaderInputType (#11)', () => {
  it('header inputType=calendar → warning', () => {
    const xml = `<w2:gridView><w2:header><w2:row><w2:column inputType="calendar" id="A"/></w2:row></w2:header></w2:gridView>`;
    expect(checkHeaderInputType(xml)[0].rule).toBe('ANTI-11');
  });
  it('text/checkbox → 없음', () => {
    const xml = `<w2:gridView><w2:header><w2:row><w2:column inputType="text" id="A"/><w2:column inputType="checkbox" id="chk"/></w2:row></w2:header></w2:gridView>`;
    expect(checkHeaderInputType(xml)).toEqual([]);
  });
});

describe('checkCancelReform (#15)', () => {
  it('.reform( → warning', () => {
    expect(checkCancelReform(script(`dlt_x.reform();`))[0].rule).toBe('ANTI-15');
  });
  it('undoGridView → 없음', () => {
    expect(checkCancelReform(script(`$c.data.undoGridView(grd_x);`))).toEqual([]);
  });
});

describe('validateAntiPatterns (합산)', () => {
  it('깨끗한 XML → 빈 배열', () => {
    expect(validateAntiPatterns(`<root><xf:input id="ibx_a"/></root>`)).toEqual([]);
  });
  it('여러 위반 합산', () => {
    const xml = `<root><xf:input id="dup"/><xf:input id="dup"/>${script(`dlt_x.reform();`)}</root>`;
    const rules = validateAntiPatterns(xml).map(v => v.rule).sort();
    expect(rules).toContain('ANTI-08');
    expect(rules).toContain('ANTI-15');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test anti-pattern-validator`
Expected: 가드 checker + validateAntiPatterns 케이스 FAIL.

- [ ] **Step 3: 구현 추가**

Append to `packages/figma-ingest/src/validate/anti-pattern-validator.ts`:

```typescript
/** <script> CDATA 본문들을 합쳐 반환 (script 룰 입력). */
function scriptBodies(xml: string): string {
  return (xml.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || []).join('\n');
}

/** #2: scwin 핸들러가 await 사용하나 async 없음 (SyntaxError). 핸들러는 `\n};`로 끝나는 형식 가정. */
export function checkAsyncAwait(xml: string): Violation[] {
  const s = scriptBodies(xml);
  const out: Violation[] = [];
  const re = /scwin\.(\w+)\s*=\s*(async\s+)?function\b[^{]*\{([\s\S]*?)\n\};/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (!m[2] && /\bawait\b/.test(m[3])) {
      out.push({ rule: 'ANTI-02', severity: 'critical',
        message: `scwin.${m[1]}: await 사용하나 async 선언 없음 (SyntaxError)`,
        remediation: 'await가 있으면 함수에 async: scwin.fn = async function() {...}', location: m[1] });
    }
  }
  return out;
}

/** #1: 금지 프레임워크/브라우저 API. */
export function checkForbiddenApi(xml: string): Violation[] {
  const s = scriptBodies(xml);
  const out: Violation[] = [];
  const pats: Array<[RegExp, string]> = [
    [/\$p\.getComponentById\s*\(/, '$p.getComponentById'],
    [/document\.(?:getElementById|querySelector)\s*\(/, 'document.*'],
    [/\baddEventListener\s*\(/, 'addEventListener'],
  ];
  for (const [re, label] of pats) {
    if (re.test(s)) out.push({ rule: 'ANTI-01', severity: 'warning',
      message: `금지된 프레임워크/브라우저 API: ${label}`,
      remediation: '$c.util.getComponent(...) / ev: 속성 이벤트 사용 (브라우저 전역 API 금지)', location: label });
  }
  return out;
}

/** #3: $c.win. 접두 없는 bare confirm(/alert(. */
export function checkDirectDialog(xml: string): Violation[] {
  const s = scriptBodies(xml);
  const out: Violation[] = [];
  const re = /(?:^|[^.\w])(confirm|alert)\s*\(/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ rule: 'ANTI-03', severity: 'warning',
      message: `브라우저 내장 ${m[1]}() 직접 호출`,
      remediation: 'await $c.win.confirm/alert($c.data.getMessage("MSG_CM_*")) 사용', location: m[1] });
  }
  return out;
}

const ALLOWED_EV = new Set(['onclick', 'onpageload', 'submitdone', 'oncellclick', 'oncelldblclick', 'onrowindexchange', 'ontabindexchange', 'onviewchange']);
/** #4: 허용목록 외 ev: 이벤트. */
export function checkEventNames(xml: string): Violation[] {
  const out: Violation[] = [];
  const re = /\bev:([a-zA-Z]+)\s*=/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const name = m[1].toLowerCase();
    if (ALLOWED_EV.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push({ rule: 'ANTI-04', severity: 'warning',
      message: `허용되지 않은 ev: 이벤트 "ev:${m[1]}"`,
      remediation: '정확한 이벤트명만 (oncellclick/onrowindexchange/ontabindexchange 등). onrowclick/onclose 환각 금지', location: m[1] });
  }
  return out;
}

/** #11: gridView header column inputType은 text/checkbox만. */
export function checkHeaderInputType(xml: string): Violation[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out: Violation[] = [];
  byTag($, null, 'w2:header').each((_, header) => {
    byTag($, $(header), 'w2:column').each((_2, col) => {
      const it = $(col).attr('inputType');
      if (it && it !== 'text' && it !== 'checkbox') {
        out.push({ rule: 'ANTI-11', severity: 'warning',
          message: `GridView header column inputType="${it}" (text/checkbox만 허용)`,
          remediation: 'header column inputType은 text 또는 checkbox만', location: it });
      }
    });
  });
  return out;
}

/** #15: script에 .reform( (취소엔 undoGridView). */
export function checkCancelReform(xml: string): Violation[] {
  if (/\.reform\s*\(/.test(scriptBodies(xml))) {
    return [{ rule: 'ANTI-15', severity: 'warning',
      message: 'script에서 .reform() 사용 (취소/원복엔 부적합)',
      remediation: '취소·변경 원복에는 $c.data.undoGridView(grdObj). reform()은 서버 재조회 전 dirty 제거용만', location: 'reform' }];
  }
  return [];
}

/** 9개 룰 합산. */
export function validateAntiPatterns(xml: string): Violation[] {
  return [
    ...checkDuplicateIds(xml),
    ...checkGridColumns(xml),
    ...checkSubmissionRefs(xml),
    ...checkAsyncAwait(xml),
    ...checkForbiddenApi(xml),
    ...checkDirectDialog(xml),
    ...checkEventNames(xml),
    ...checkHeaderInputType(xml),
    ...checkCancelReform(xml),
  ];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test anti-pattern-validator`
Expected: 전체 PASS (7 + 가드 ~13 + 합산 2).

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/validate/anti-pattern-validator.ts packages/figma-ingest/tests/validate/anti-pattern-validator.test.ts
git commit -m "feat(phase-3a): validator 가드 checker(#2 #1 #3 #4 #11 #15) + validateAntiPatterns 합산"
```

---

### Task 3: #2 자동수정 fixAsyncAwait

**Files:** Create `src/validate/anti-pattern-fixer.ts` + `tests/validate/anti-pattern-fixer.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/validate/anti-pattern-fixer.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { fixAsyncAwait } from '../../src/validate/anti-pattern-fixer';

describe('fixAsyncAwait (#2)', () => {
  it('await 있는데 async 없으면 async 삽입', () => {
    const xml = `scwin.btn_x_onclick = function() {\n\tawait $c.win.confirm("x");\n};`;
    expect(fixAsyncAwait(xml)).toBe(`scwin.btn_x_onclick = async function() {\n\tawait $c.win.confirm("x");\n};`);
  });
  it('이미 async면 불변', () => {
    const xml = `scwin.btn_x_onclick = async function() {\n\tawait $c.win.confirm("x");\n};`;
    expect(fixAsyncAwait(xml)).toBe(xml);
  });
  it('await 없으면 불변', () => {
    const xml = `scwin.onpageload = function() {\n\t$c.util.x();\n};`;
    expect(fixAsyncAwait(xml)).toBe(xml);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test anti-pattern-fixer`
Expected: FAIL (module 없음)

- [ ] **Step 3: 구현**

Create `packages/figma-ingest/src/validate/anti-pattern-fixer.ts`:

```typescript
/**
 * Phase 3A — #2 await/async 불일치 자동수정 (순수·결정론).
 * scwin 핸들러 본문에 await가 있는데 async가 없으면 `function`→`async function` 삽입.
 * 이미 async인 핸들러는 정규식이 매칭 안 함(= function 앞에 async가 있어). 핸들러는 `\n};` 종료 형식 가정.
 */
export function fixAsyncAwait(xml: string): string {
  return xml.replace(
    /(scwin\.\w+\s*=\s*)function(\b[^{]*\{[\s\S]*?\n\};)/g,
    (full, head: string, rest: string) => (/\bawait\b/.test(rest) ? `${head}async function${rest}` : full),
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test anti-pattern-fixer`
Expected: 3 PASS.

- [ ] **Step 5: 빌드 + 커밋**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/validate/anti-pattern-fixer.ts packages/figma-ingest/tests/validate/anti-pattern-fixer.test.ts
git commit -m "feat(phase-3a): fixAsyncAwait — #2 await/async 자동수정"
```

---

### Task 4: 통합 — 파이프라인(fixAsyncAwait + onStage) + CLI 리포트 + 골든 0-critical

**Files:** Modify `src/pipeline.ts`, `src/cli.ts` + `tests/validate/anti-pattern-validator.test.ts` + `tests/pipeline.e2e.test.ts`

- [ ] **Step 1: 골든 0-critical 통합 테스트 작성 (Puppeteer 불필요)**

Append to `tests/validate/anti-pattern-validator.test.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';

describe('골든 검증 (파이프라인 출력 정합성)', () => {
  const GOLDEN = path.join(__dirname, '..', 'golden');
  for (const name of ['simple-form', 'search-grid', 'master-detail']) {
    it(`${name} 골든 → critical 위반 0`, () => {
      const xml = fs.readFileSync(path.join(GOLDEN, `${name}.expected.xml`), 'utf-8');
      const critical = validateAntiPatterns(xml).filter(v => v.severity === 'critical');
      expect(critical).toEqual([]);
    });
  }
});
```

- [ ] **Step 2: 테스트 실행 (현 골든에서 통과해야 함)**

Run: `corepack pnpm --filter @kdh/figma-ingest test anti-pattern-validator`
Expected: 골든 3건 모두 critical 0 → PASS. **만약 critical 위반이 나오면 STOP & report**(진짜 파이프라인 버그 — 테스트를 깨서 통과시키지 말 것).

- [ ] **Step 3: 파이프라인 연결**

Edit `packages/figma-ingest/src/pipeline.ts`. import 추가:
```typescript
import { validateAntiPatterns } from './validate/anti-pattern-validator';
import { fixAsyncAwait } from './validate/anti-pattern-fixer';
```
현재 마무리:
```typescript
  result = scaffoldScwinHandlers(result);
  options.onStage?.('phase1-finalized', result);

  return result;
```
다음으로 교체:
```typescript
  result = scaffoldScwinHandlers(result);
  result = fixAsyncAwait(result);   // #2 안전 자동수정

  options.onStage?.('validation', validateAntiPatterns(result));
  options.onStage?.('phase1-finalized', result);

  return result;
```

- [ ] **Step 4: CLI 리포트 연결**

Edit `packages/figma-ingest/src/cli.ts`. import에 추가:
```typescript
import { validateAntiPatterns } from './validate/anti-pattern-validator';
```
`fs.writeFileSync(absOutput, xml, 'utf-8');` 와 `console.log(\`OK Wrote ...\`)` 사이(또는 직후)에 추가:
```typescript
    const violations = validateAntiPatterns(xml);
    if (violations.length) {
      const crit = violations.filter(v => v.severity === 'critical').length;
      console.warn(`\n⚠️  안티패턴 ${violations.length}건 (critical ${crit})`);
      for (const v of violations) {
        console.warn(`  [${v.severity.toUpperCase()}] ${v.rule}${v.location ? ' ' + v.location : ''} — ${v.message}`);
        console.warn(`        ↳ 대안: ${v.remediation}`);
      }
    } else {
      console.log('✅ 안티패턴 검증 통과 (위반 0)');
    }
```
(CLI는 위반이 있어도 exit 0 유지 — 비파괴.)

- [ ] **Step 5: e2e onStage 테스트 추가**

Append to `tests/pipeline.e2e.test.ts`의 Mock-LLM describe 블록:
```typescript
  it('파이프라인 onStage(validation) 발생 + simple-form critical 0 (Phase 3A)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    let violations: Array<{ severity: string }> | null = null;
    await convertHtmlToWebSquare(html, {
      llmClient: makeMock('simple-form'),
      onStage: (name, payload) => { if (name === 'validation') violations = payload as Array<{ severity: string }>; },
    });
    expect(violations).not.toBeNull();
    expect((violations as Array<{ severity: string }>).filter(v => v.severity === 'critical')).toEqual([]);
  }, 60000);
```

- [ ] **Step 6: 빌드 + 전체 테스트**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 전체 PASS, 0 fail (live-llm 1 skip). 골든 회귀도 PASS(파이프라인에 fixAsyncAwait 추가됐으나 현 출력 이미 async 정합 → 골든 불변).

- [ ] **Step 7: 커밋**

```
git add packages/figma-ingest/src/pipeline.ts packages/figma-ingest/src/cli.ts packages/figma-ingest/tests/validate/anti-pattern-validator.test.ts packages/figma-ingest/tests/pipeline.e2e.test.ts
git commit -m "feat(phase-3a): 파이프라인 fixAsyncAwait + onStage(validation), CLI 리포트, 골든 0-critical 검증"
```

---

### Task 5: #9 근본개선 — grid-reconciler sourceBodyId/chk-aware

**Files:** Modify `src/stage3/grid-reconciler.ts` + `tests/stage3/grid-reconciler.test.ts`

- [ ] **Step 1: chk-aware 실패 테스트 추가**

Append to `tests/stage3/grid-reconciler.test.ts` (기존 import·헬퍼 확인 후; `reconcileGrids`/`DataCollectionIR`는 보통 이미 import됨):

```typescript
describe('reconcileGrids — sourceBodyId/chk-aware (#9, Phase 3A)', () => {
  it('chk 선행 컬럼: chk 보존 + 데이터 컬럼 id 기반 매칭(밀림 없음)', () => {
    const ir = {
      dataMaps: [],
      dataLists: [{ id: 'dlt_a', name: 'A', columns: [
        { id: 'EMP_CD', name: '사번', dataType: 'text' as const, sourceBodyId: 'col_1' },
        { id: 'EMP_NM', name: '성명', dataType: 'text' as const, sourceBodyId: 'col_2' },
      ] }],
      confidence: 0.9,
    };
    const xml = `<w2:gridView id="grd_a">
      <w2:header><w2:row><w2:column id="chk"/><w2:column id="col_1"/><w2:column id="col_2"/></w2:row></w2:header>
      <w2:gBody><w2:row><w2:column id="chk"/><w2:column id="col_1"/><w2:column id="col_2"/></w2:row></w2:gBody>
    </w2:gridView>`;
    const out = reconcileGrids(xml, ir);
    // chk 보존, col_1→EMP_CD, col_2→EMP_NM (밀림 없음)
    expect(out).toContain('<w2:column id="chk"/>');
    expect(out).toContain('<w2:column id="EMP_CD"/>');
    expect(out).toContain('<w2:column id="EMP_NM"/>');
    // header/gBody 동일 시퀀스
    const cols = [...out.matchAll(/<w2:column id="([^"]+)"/g)].map(m => m[1]);
    expect(cols).toEqual(['chk', 'EMP_CD', 'EMP_NM', 'chk', 'EMP_CD', 'EMP_NM']);
  });

  it('sourceBodyId 없는 IR → 위치순 fallback (기존 동작)', () => {
    const ir = {
      dataMaps: [],
      dataLists: [{ id: 'dlt_a', name: 'A', columns: [
        { id: 'EMP_CD', name: '사번', dataType: 'text' as const },
        { id: 'EMP_NM', name: '성명', dataType: 'text' as const },
      ] }],
      confidence: 0.9,
    };
    const xml = `<w2:gridView id="grd_a">
      <w2:header><w2:row><w2:column id="x"/><w2:column id="y"/></w2:row></w2:header>
      <w2:gBody><w2:row><w2:column id="x"/><w2:column id="y"/></w2:row></w2:gBody>
    </w2:gridView>`;
    const out = reconcileGrids(xml, ir);
    const cols = [...out.matchAll(/<w2:column id="([^"]+)"/g)].map(m => m[1]);
    expect(cols).toEqual(['EMP_CD', 'EMP_NM', 'EMP_CD', 'EMP_NM']);  // 위치순
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test grid-reconciler`
Expected: chk-aware 케이스 FAIL (현재 위치순이라 chk가 EMP_CD로 덮여 밀림).

- [ ] **Step 3: grid-reconciler 재작성**

Replace `packages/figma-ingest/src/stage3/grid-reconciler.ts` 전체로:

```typescript
/**
 * Stage 3.5 — gridView를 DataList에 바인딩.
 *  1. <w2:gridView>에 dataList="data:{dlt_id}" 추가
 *  2. gBody 원본 컬럼 id로 최종 컬럼 id 시퀀스 결정 후 header/gBody에 동일 적용.
 *     - sourceBodyId 매칭(있으면): 원본 id → 해당 DataList 컬럼 id. 매칭 없는 컬럼(chk 등)은 원본 보존.
 *     - 어떤 원본 id도 sourceBodyId와 불일치하면: 위치순 fallback(레거시 동작).
 *
 * 단일 DataList 가정 (2B). 다중 DataList는 향후.
 */
import type { DataCollectionIR, DataListIR } from '../types';

/** gBody 원본 컬럼 id 목록으로 최종 id 시퀀스를 결정. */
function resolveColumnIds(origIds: string[], dl: DataListIR): string[] {
  const bySource = new Map<string, string>();
  for (const c of dl.columns) if (c.sourceBodyId) bySource.set(c.sourceBodyId, c.id);
  const anyMatch = origIds.some(id => bySource.has(id));
  if (!anyMatch) {
    // sourceBodyId 부재/불일치 → 위치순 fallback
    return origIds.map((_, i) => dl.columns[i]?.id ?? origIds[i]);
  }
  return origIds.map(orig => bySource.get(orig) ?? orig);  // 매칭 없으면(chk) 원본 보존
}

/** 블록 내 <w2:column> id를 ids 시퀀스로 위치순 교체. */
function applyColumnIds(block: string, ids: string[]): string {
  let i = 0;
  return block.replace(
    /(<w2:column\b[^>]*?\bid=")[^"]*("[^>]*?\/?>)/g,
    (full, head, tail) => {
      const id = ids[i]; i++;
      return id != null ? `${head}${id}${tail}` : full;
    },
  );
}

export function reconcileGrids(xml: string, ir: DataCollectionIR): string {
  if (ir.dataLists.length === 0) return xml;
  const dl = ir.dataLists[0];

  return xml.replace(
    /(<w2:gridView\b)([^>]*)(>)([\s\S]*?)(<\/w2:gridView>)/g,
    (full, open, attrs, openClose, inner, closeTag) => {
      let newAttrs = attrs;
      if (!/\bdataList\s*=/.test(attrs)) newAttrs = `${attrs} dataList="data:${dl.id}"`;

      const gBodyM = inner.match(/<w2:gBody\b[^>]*>([\s\S]*?)<\/w2:gBody>/);
      const origIds = gBodyM
        ? [...gBodyM[1].matchAll(/<w2:column\b[^>]*?\bid="([^"]*)"/g)].map(m => m[1])
        : [];
      const ids = resolveColumnIds(origIds, dl);

      let newInner = inner.replace(
        /(<w2:header\b[^>]*>)([\s\S]*?)(<\/w2:header>)/,
        (m: string, h: string, body: string, c: string) => `${h}${applyColumnIds(body, ids)}${c}`,
      );
      newInner = newInner.replace(
        /(<w2:gBody\b[^>]*>)([\s\S]*?)(<\/w2:gBody>)/,
        (m: string, h: string, body: string, c: string) => `${h}${applyColumnIds(body, ids)}${c}`,
      );
      return `${open}${newAttrs}${openClose}${newInner}${closeTag}`;
    },
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test grid-reconciler`
Expected: 신규 2 + 기존 PASS.

- [ ] **Step 5: 전체 + 골든 회귀 (출력 중립 확인)**

Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 전체 PASS, 0 fail. **3 골든 불변**(현 fixture는 chk-free·col_1..col_3 순서 → id기반=위치순 동일 결과). 만약 골든이 바뀌면 STOP & report(출력 중립성 위반 — 원인 조사).

> 만약 골든이 바뀌면: 현 fixture의 pre-reconcile body id가 col_1..col_3가 아니어서 매칭이 다르게 동작했을 수 있음. resolveColumnIds의 `anyMatch` fallback이 위치순을 보장하므로 일반적으론 불변이어야 함. diff를 report에 첨부.

- [ ] **Step 6: 커밋**

```
git add packages/figma-ingest/src/stage3/grid-reconciler.ts packages/figma-ingest/tests/stage3/grid-reconciler.test.ts
git commit -m "feat(phase-3a): grid-reconciler sourceBodyId/chk-aware 매칭 (#9 근본개선, 위치순 fallback)"
```

---

## Self-Review Notes

**Spec coverage:**
- §2 적용 9룰 → Task 1(#8 #9 #10) + Task 2(#2 #1 #3 #4 #11 #15) ✓
- §3 모듈(validator + remediation 필드) → Task 1·2 ✓
- §4 룰별 검출 로직 → Task 1·2 checker 코드 ✓
- §5-1 파이프라인 onStage('validation') / §5-2 CLI 리포트 → Task 4 ✓
- §5-3 해결: #2 fixAsyncAwait → Task 3 + Task 4 파이프라인 연결 ✓; #9 grid-reconciler → Task 5 ✓
- §6 테스트(checker별 + 골든 0-critical + #2 fixer + #9 chk) → Task 1·2·3·4·5 ✓
- §7 성공기준 → 전체 ✓
- §8 리스크(#8 데이터컬럼 제외, #9 출력중립·header 매핑, #2 belt-and-suspenders) → 구현·테스트 반영 ✓

**Placeholder scan:** TBD/TODO 없음. 모든 step 실제 코드. Task 4 Step2·Task5 Step5는 "critical 나오면 STOP" 명시(하드코딩 통과 금지).

**Type consistency:**
- `Violation {rule, severity, message, remediation, location?}` Task 1 정의, 전 checker·CLI 사용 ✓
- checker 시그니처 `(xml: string): Violation[]` 일관, `validateAntiPatterns(xml): Violation[]` ✓
- `fixAsyncAwait(xml): string` Task 3, pipeline 사용 ✓
- grid-reconciler `reconcileGrids(xml, ir): string` 시그니처 불변, 내부 `resolveColumnIds`/`applyColumnIds` 신규 ✓

**의존성 순서:** Task 1(코어+구조 checker) → 2(가드+합산) → 3(fixer) → 4(통합: 1·2·3 사용) → 5(grid-reconciler, 독립이나 #9 checker가 Task1에 있어 골든검증과 정합). forward ref 없음 ✓

---

*문서 끝.*
