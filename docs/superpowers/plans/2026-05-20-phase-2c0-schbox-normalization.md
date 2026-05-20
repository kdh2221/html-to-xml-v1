# Phase 2C-0: schbox 구조 정규화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stage 2(legacy) 출력의 synthetic 검색그룹(`tblbox#grp_search`)을 WRM 표준 schbox 구조(`.schbox > .schbox_inner#tbl_search > .w2tb.tbl` + `.schbox > .btn_schbox > 조회버튼`)로 재구성한다.

**Architecture:** Stage 2.5 결정론 모듈 `normalizeSchbox`. cheerio 전체 재직렬화는 CDATA(버튼 라벨)를 깨뜨릴 위험이 있어 사용하지 않고, **수동 balanced-group 매칭 + 문자열 수술**로 검색그룹 substring만 변환(CDATA·나머지 포맷 보존). llmClient 게이트 밖 = 항상 실행.

**Tech Stack:** TypeScript strict, Vitest, 정규식 기반 balanced 매칭 + 문자열 치환 (cheerio 직렬화 회피).

**Spec reference:** [`docs/superpowers/specs/2026-05-20-phase-2c0-schbox-normalization-design.md`](../specs/2026-05-20-phase-2c0-schbox-normalization-design.md)

---

## ⚠️ 구현 노트 (필독)

- 검색그룹 블록은 중첩 `<xf:group>`이 많아 단순 정규식 균형 매칭 불가 → **depth 카운터로 balanced 매칭** (`findGroupEnd`).
- cheerio `$.xml()` 전체 재직렬화는 버튼 라벨 `<xf:label><![CDATA[조회]]></xf:label>`의 CDATA를 깨뜨릴 수 있음 → **문자열 수술로만** 변환.
- 검색그룹 opening 태그는 **여러 줄에 걸칠 수 있음** (golden에서 meta 속성들로 2줄). JS `[^>]*`는 개행 포함하므로 `>`까지 매칭됨 — OK.
- Stage 2.5는 **Phase 1 이전** → 버튼에 아직 `btn_cm sch` 없음 → **라벨 텍스트(조회/검색/초기화)로 탐지**.

---

## File Structure

```
packages/figma-ingest/
├── src/
│   ├── pipeline.ts                          # MODIFIED — Stage 2.5 wiring (게이트 밖)
│   └── stage3/
│       └── schbox-normalizer.ts             # NEW — normalizeSchbox + 헬퍼
├── tests/
│   ├── stage3/
│   │   └── schbox-normalizer.test.ts        # NEW
│   ├── pipeline.e2e.test.ts                 # MODIFIED — schbox 구조 검증
│   └── golden/*.expected.xml                # MODIFIED — 재생성 (schbox 구조)
```

---

### Task 1: 탐지 헬퍼 (balanced 매칭 + 검색그룹 찾기)

**Files:** Create `src/stage3/schbox-normalizer.ts` + `tests/stage3/schbox-normalizer.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/schbox-normalizer.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { findGroupEnd, findSearchGroupBlock, hasSearchButton } from '../../src/stage3/schbox-normalizer';

const SEARCH_XML = `<body>
  <xf:group class="tblbox" id="grp_search_001" meta_snippetName="x">
    <xf:group class="w2tb tbl" tagname="table">
      <xf:group tagname="tr">
        <xf:group class="w2tb_th" tagname="th"><w2:textbox label="부서"/></xf:group>
        <xf:group class="w2tb_td" tagname="td">
          <xf:select1 id="sbx_deptCd" label="부서"/>
          <xf:trigger ctype="Button" id="btn_006" type="button"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>
        </xf:group>
      </xf:group>
    </xf:group>
  </xf:group>
  <xf:group class="gvwbox"><w2:gridView id="grd_007"></w2:gridView></xf:group>
</body>`;

describe('findGroupEnd', () => {
  it('중첩 xf:group의 매칭 닫는 태그 인덱스 반환', () => {
    const openStart = SEARCH_XML.indexOf('<xf:group class="tblbox"');
    const end = findGroupEnd(SEARCH_XML, openStart);
    // end 직전이 </xf:group> 여야 하고, 그 블록은 grp_search 전체
    const block = SEARCH_XML.slice(openStart, end);
    expect(block.startsWith('<xf:group class="tblbox"')).toBe(true);
    expect(block.endsWith('</xf:group>')).toBe(true);
    // 블록 안에 select1 + trigger 포함, gvwbox는 미포함
    expect(block).toContain('sbx_deptCd');
    expect(block).toContain('btn_006');
    expect(block).not.toContain('gvwbox');
  });

  it('self-closing xf:group은 depth에 영향 없음', () => {
    const xml = `<xf:group id="a"><xf:group id="b" tagname="col"/><xf:group id="c"></xf:group></xf:group>TAIL`;
    const end = findGroupEnd(xml, 0);
    expect(xml.slice(0, end)).toBe(`<xf:group id="a"><xf:group id="b" tagname="col"/><xf:group id="c"></xf:group></xf:group>`);
    expect(xml.slice(end)).toBe('TAIL');
  });

  it('불균형이면 -1', () => {
    const end = findGroupEnd('<xf:group id="a"><xf:group id="b">', 0);
    expect(end).toBe(-1);
  });
});

describe('hasSearchButton', () => {
  it('조회/검색/초기화 라벨 trigger 있으면 true', () => {
    expect(hasSearchButton('<xf:trigger><xf:label><![CDATA[조회]]></xf:label></xf:trigger>')).toBe(true);
    expect(hasSearchButton('<xf:trigger><xf:label><![CDATA[초기화]]></xf:label></xf:trigger>')).toBe(true);
  });
  it('검색 라벨 없으면 false', () => {
    expect(hasSearchButton('<xf:trigger><xf:label><![CDATA[저장]]></xf:label></xf:trigger>')).toBe(false);
  });
});

describe('findSearchGroupBlock', () => {
  it('grp_search + 검색버튼 동시 충족 그룹 반환', () => {
    const sg = findSearchGroupBlock(SEARCH_XML);
    expect(sg).not.toBeNull();
    expect(sg!.block).toContain('grp_search_001');
    expect(sg!.block).toContain('btn_006');
    expect(SEARCH_XML.slice(sg!.start, sg!.end)).toBe(sg!.block);
  });

  it('grp_search 없으면 null', () => {
    const xml = `<body><xf:group class="tblbox" id="grp_other"><xf:trigger><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group></body>`;
    expect(findSearchGroupBlock(xml)).toBeNull();
  });

  it('grp_search지만 검색버튼 없으면 null', () => {
    const xml = `<body><xf:group class="tblbox" id="grp_search_001"><xf:trigger><xf:label><![CDATA[저장]]></xf:label></xf:trigger></xf:group></body>`;
    expect(findSearchGroupBlock(xml)).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test schbox-normalizer`
Expected: FAIL (module 없음)

- [ ] **Step 3: 헬퍼 구현**

Create `packages/figma-ingest/src/stage3/schbox-normalizer.ts`:

```typescript
/**
 * Stage 2.5 — synthetic 검색그룹(tblbox#grp_search)을 WRM 표준 schbox 구조로 재구성.
 *
 * cheerio 전체 재직렬화는 버튼 라벨 CDATA를 깨뜨릴 위험이 있어, balanced 매칭 +
 * 문자열 수술로 검색그룹 substring만 변환한다 (CDATA·나머지 문서 포맷 보존).
 *
 * Stage 2.5는 Phase 1 rename/button-modifier 이전 → 버튼에 btn_cm sch 없음 →
 * 라벨 텍스트(조회/검색/초기화)로 검색버튼 탐지.
 */

const SEARCH_LABELS = /조회|검색|초기화/;

export interface SearchGroup {
  start: number;
  end: number;   // 매칭 </xf:group> 직후 인덱스
  block: string; // xml.slice(start, end)
}

/**
 * openStart: <xf:group 여는 태그가 시작하는 인덱스.
 * 매칭되는 </xf:group> 직후 인덱스 반환. 불균형이면 -1.
 */
export function findGroupEnd(xml: string, openStart: number): number {
  const tagRe = /<xf:group\b[^>]*?(\/?)>|<\/xf:group>/g;
  tagRe.lastIndex = openStart;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    if (m[0] === '</xf:group>') {
      depth--;
      if (depth === 0) return tagRe.lastIndex;
      if (depth < 0) return -1;
    } else if (m[1] !== '/') {
      depth++;
    }
    // self-closing(<xf:group .../>)은 depth 불변
  }
  return -1;
}

export function hasSearchButton(block: string): boolean {
  const triggers = block.match(/<xf:trigger\b[\s\S]*?<\/xf:trigger>/g) || [];
  return triggers.some(t => SEARCH_LABELS.test(t));
}

/**
 * grp_search id를 가지면서 검색버튼(조회/검색/초기화)을 포함하는 첫 그룹을 찾는다.
 * fromIndex부터 스캔.
 */
export function findSearchGroupBlock(xml: string, fromIndex = 0): SearchGroup | null {
  const openRe = /<xf:group\b[^>]*\bid="grp_search[^"]*"[^>]*>/g;
  openRe.lastIndex = fromIndex;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(xml)) !== null) {
    const start = m.index;
    const end = findGroupEnd(xml, start);
    if (end === -1) continue;
    const block = xml.slice(start, end);
    if (hasSearchButton(block)) {
      return { start, end, block };
    }
  }
  return null;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test schbox-normalizer`
Expected: findGroupEnd(3) + hasSearchButton(2) + findSearchGroupBlock(3) = 8 PASS.

- [ ] **Step 5: 빌드 + 커밋 (PowerShell)**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/schbox-normalizer.ts packages/figma-ingest/tests/stage3/schbox-normalizer.test.ts
git commit -m "feat(phase-2c0): schbox-normalizer 탐지 헬퍼 (balanced 매칭 + 검색그룹 찾기)"
```

---

### Task 2: 검색버튼 추출

**Files:** Modify `src/stage3/schbox-normalizer.ts` + `tests/stage3/schbox-normalizer.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

Append to `tests/stage3/schbox-normalizer.test.ts`:

```typescript
import { extractSearchButtons } from '../../src/stage3/schbox-normalizer';

describe('extractSearchButtons', () => {
  it('조회 버튼을 추출하고 폼에서 제거', () => {
    const block = `<xf:group class="w2tb_td" tagname="td"><xf:select1 id="sbx_deptCd"/><xf:trigger id="btn_006"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>`;
    const { buttons, rest } = extractSearchButtons(block);
    expect(buttons.length).toBe(1);
    expect(buttons[0]).toContain('btn_006');
    expect(buttons[0]).toContain('조회');
    expect(rest).not.toContain('btn_006');
    expect(rest).toContain('sbx_deptCd');  // 폼 요소는 남음
  });

  it('검색 아닌 trigger는 보존', () => {
    const block = `<xf:trigger id="btn_save"><xf:label><![CDATA[저장]]></xf:label></xf:trigger>`;
    const { buttons, rest } = extractSearchButtons(block);
    expect(buttons.length).toBe(0);
    expect(rest).toContain('btn_save');
  });

  it('조회+초기화 둘 다 추출', () => {
    const block = `<xf:trigger id="b1"><xf:label><![CDATA[조회]]></xf:label></xf:trigger><xf:trigger id="b2"><xf:label><![CDATA[초기화]]></xf:label></xf:trigger>`;
    const { buttons, rest } = extractSearchButtons(block);
    expect(buttons.length).toBe(2);
    expect(rest.replace(/\s/g, '')).toBe('');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test schbox-normalizer`
Expected: extractSearchButtons 3개 FAIL.

- [ ] **Step 3: 구현 추가**

Append to `src/stage3/schbox-normalizer.ts`:

```typescript
/**
 * 블록에서 검색버튼(조회/검색/초기화 trigger)을 추출하고, 폼에서 제거한 나머지를 반환.
 */
export function extractSearchButtons(block: string): { buttons: string[]; rest: string } {
  const buttons: string[] = [];
  const rest = block.replace(/<xf:trigger\b[\s\S]*?<\/xf:trigger>/g, (t) => {
    if (SEARCH_LABELS.test(t)) {
      buttons.push(t.trim());
      return '';
    }
    return t;
  });
  return { buttons, rest };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test schbox-normalizer`
Expected: 11 PASS (8 + 3).

- [ ] **Step 5: 빌드 + 커밋 (PowerShell)**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/schbox-normalizer.ts packages/figma-ingest/tests/stage3/schbox-normalizer.test.ts
git commit -m "feat(phase-2c0): extractSearchButtons — 검색버튼 추출 + 폼 제거"
```

---

### Task 3: 검색블록 변환

**Files:** Modify `src/stage3/schbox-normalizer.ts` + `tests/stage3/schbox-normalizer.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

Append:

```typescript
import { transformSearchBlock } from '../../src/stage3/schbox-normalizer';

const GRP_SEARCH_BLOCK = `<xf:group class="tblbox" id="grp_search_001" meta_snippetName="x">
  <xf:group class="w2tb tbl" tagname="table">
    <xf:group tagname="tr">
      <xf:group class="w2tb_th" tagname="th"><w2:textbox label="부서"/></xf:group>
      <xf:group class="w2tb_td" tagname="td">
        <xf:select1 id="sbx_deptCd" label="부서"/>
        <xf:trigger ctype="Button" id="btn_006" type="button"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>
      </xf:group>
    </xf:group>
  </xf:group>
</xf:group>`;

describe('transformSearchBlock', () => {
  it('schbox + schbox_inner#tbl_search + btn_schbox 구조 생성', () => {
    const out = transformSearchBlock(GRP_SEARCH_BLOCK);
    // 외곽 class tblbox → schbox, grp_search id 제거
    expect(out).toMatch(/^<xf:group\b[^>]*class="[^"]*\bschbox\b/);
    expect(out).not.toContain('tblbox');
    expect(out).not.toContain('grp_search_001');
    // schbox_inner#tbl_search 래핑
    expect(out).toContain('<xf:group class="schbox_inner" id="tbl_search">');
    // w2tb tbl은 schbox_inner 안에 보존
    expect(out).toMatch(/<xf:group class="schbox_inner" id="tbl_search">\s*<xf:group class="w2tb tbl"/);
    // btn_schbox + 조회버튼 (폼 밖)
    expect(out).toContain('<xf:group class="btn_schbox">');
    expect(out).toContain('btn_006');
    expect(out).toContain('<![CDATA[조회]]>');  // CDATA 보존
    // 버튼이 schbox_inner 밖, btn_schbox 안
    const innerEnd = out.indexOf('</xf:group>', out.indexOf('schbox_inner'));
    const btnPos = out.indexOf('btn_006');
    expect(btnPos).toBeGreaterThan(out.indexOf('btn_schbox'));
    // 폼 td 안엔 select1만 남고 trigger 없음
    expect(out).toMatch(/w2tb_td[\s\S]*sbx_deptCd/);
  });

  it('CDATA 라벨 정확히 보존', () => {
    const out = transformSearchBlock(GRP_SEARCH_BLOCK);
    expect(out).toContain('<xf:label><![CDATA[조회]]></xf:label>');
  });

  it('검색버튼 없는 블록은 그대로(no-op)', () => {
    const block = `<xf:group class="tblbox" id="grp_search_001"><xf:group class="w2tb tbl"><xf:input id="x"/></xf:group></xf:group>`;
    expect(transformSearchBlock(block)).toBe(block);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test schbox-normalizer`
Expected: transformSearchBlock 3개 FAIL.

- [ ] **Step 3: 구현 추가**

Append to `src/stage3/schbox-normalizer.ts`:

```typescript
/**
 * 검색그룹 블록을 표준 schbox 구조로 변환.
 *  - 외곽 class tblbox→schbox, grp_search id 제거
 *  - w2tb.tbl을 schbox_inner#tbl_search로 래핑
 *  - 검색버튼을 폼에서 떼어 btn_schbox로 이동
 * 검색버튼 없으면 원본 반환 (no-op).
 */
export function transformSearchBlock(block: string): string {
  const { buttons, rest } = extractSearchButtons(block);
  if (buttons.length === 0) return block;

  // 1. 외곽 여는 태그: tblbox→schbox, grp_search id 제거
  let out = rest.replace(/^(<xf:group\b)([^>]*?)(>)/, (full, open, attrs, close) => {
    let a = attrs;
    a = a.replace(/class="([^"]*)"/, (_cm: string, cls: string) => {
      const classes = cls.split(/\s+/).map((c) => (c === 'tblbox' ? 'schbox' : c)).filter(Boolean);
      if (!classes.includes('schbox')) classes.push('schbox');
      return `class="${classes.join(' ')}"`;
    });
    a = a.replace(/\s*\bid="grp_search[^"]*"/, '');
    return `${open}${a}${close}`;
  });

  // 2. w2tb.tbl 그룹을 schbox_inner#tbl_search로 래핑
  const tblOpen = out.search(/<xf:group\b[^>]*\bclass="[^"]*\bw2tb\b[^"]*"[^>]*>/);
  if (tblOpen !== -1) {
    const tblEnd = findGroupEnd(out, tblOpen);
    if (tblEnd !== -1) {
      const tblBlock = out.slice(tblOpen, tblEnd);
      const wrapped = `<xf:group class="schbox_inner" id="tbl_search">${tblBlock}</xf:group>`;
      out = out.slice(0, tblOpen) + wrapped + out.slice(tblEnd);
    }
  }

  // 3. 블록 마지막 </xf:group>(외곽 schbox 닫기) 앞에 btn_schbox 삽입
  const btnSchbox = `<xf:group class="btn_schbox">${buttons.join('')}</xf:group>`;
  out = out.replace(/<\/xf:group>\s*$/, `${btnSchbox}</xf:group>`);

  return out;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test schbox-normalizer`
Expected: 14 PASS (11 + 3).

만약 "버튼이 btn_schbox 안" 단언이 실패하면(예: 빈 td 잔여 공백 등) 단언 위치를 실제 출력에 맞춰 조정하되, 핵심 구조(schbox/schbox_inner#tbl_search/btn_schbox + CDATA 보존)는 유지.

- [ ] **Step 5: 빌드 + 커밋 (PowerShell)**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/schbox-normalizer.ts packages/figma-ingest/tests/stage3/schbox-normalizer.test.ts
git commit -m "feat(phase-2c0): transformSearchBlock — schbox/schbox_inner/btn_schbox 재구성"
```

---

### Task 4: normalizeSchbox orchestrator

**Files:** Modify `src/stage3/schbox-normalizer.ts` + `tests/stage3/schbox-normalizer.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

Append:

```typescript
import { normalizeSchbox } from '../../src/stage3/schbox-normalizer';

describe('normalizeSchbox (orchestrator)', () => {
  it('grp_search를 schbox로, 나머지 문서 보존', () => {
    const out = normalizeSchbox(SEARCH_XML);
    expect(out).toContain('class="schbox"');
    expect(out).toContain('<xf:group class="schbox_inner" id="tbl_search">');
    expect(out).toContain('<xf:group class="btn_schbox">');
    expect(out).not.toContain('grp_search_001');
    expect(out).not.toContain('tblbox');
    // gvwbox 등 나머지 그대로
    expect(out).toContain('<xf:group class="gvwbox"><w2:gridView id="grd_007"></w2:gridView></xf:group>');
  });

  it('검색그룹 없으면 원본 그대로', () => {
    const xml = `<body><xf:group class="gvwbox"><w2:gridView id="g"></w2:gridView></xf:group></body>`;
    expect(normalizeSchbox(xml)).toBe(xml);
  });

  it('grp_search지만 검색버튼 없으면 변환 안 함', () => {
    const xml = `<body><xf:group class="tblbox" id="grp_search_001"><xf:group class="w2tb tbl"><xf:input id="x"/></xf:group></xf:group></body>`;
    expect(normalizeSchbox(xml)).toBe(xml);
  });

  it('다중 grp_search 모두 변환', () => {
    const two = `<body>${SEARCH_XML.slice(6, SEARCH_XML.lastIndexOf('</body>'))}${SEARCH_XML.slice(6, SEARCH_XML.lastIndexOf('</body>'))}</body>`;
    const out = normalizeSchbox(two);
    expect((out.match(/class="schbox_inner"/g) || []).length).toBe(2);
    expect(out).not.toContain('grp_search');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test schbox-normalizer`
Expected: normalizeSchbox 4개 FAIL.

- [ ] **Step 3: 구현 추가**

Append to `src/stage3/schbox-normalizer.ts`:

```typescript
/**
 * 모든 검색그룹(grp_search + 검색버튼)을 표준 schbox로 정규화.
 * 변환 후 grp_search id가 사라지므로 자연히 다음 그룹으로 진행.
 */
export function normalizeSchbox(xml: string): string {
  let result = xml;
  let searchFrom = 0;
  for (;;) {
    const sg = findSearchGroupBlock(result, searchFrom);
    if (!sg) break;
    const transformed = transformSearchBlock(sg.block);
    if (transformed === sg.block) {
      searchFrom = sg.end; // 변경 없음 — 무한루프 방지
      continue;
    }
    result = result.slice(0, sg.start) + transformed + result.slice(sg.end);
    searchFrom = sg.start + transformed.length;
  }
  return result;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test schbox-normalizer`
Expected: 18 PASS (14 + 4).

- [ ] **Step 5: 빌드 + 커밋 (PowerShell)**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/stage3/schbox-normalizer.ts packages/figma-ingest/tests/stage3/schbox-normalizer.test.ts
git commit -m "feat(phase-2c0): normalizeSchbox orchestrator (다중 그룹 + no-op)"
```

---

### Task 5: pipeline Stage 2.5 wiring

**Files:** Modify `src/pipeline.ts` + Create `tests/stage3/pipeline-stage25.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/stage3/pipeline-stage25.test.ts`:

```typescript
import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../../src/pipeline';
import { closeBrowser } from '../../src/dom-extractor';

const FIX_DIR = path.join(__dirname, '..', 'fixtures');
const simpleFormHtml = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');

describe('pipeline Stage 2.5 schbox normalization', () => {
  afterAll(async () => { await closeBrowser(); });

  it('noLlm에서도 검색영역이 schbox 구조로 정규화 (구조는 바인딩과 독립)', async () => {
    const xml = await convertHtmlToWebSquare(simpleFormHtml, { noLlm: true });
    expect(xml).toContain('class="schbox"');
    expect(xml).toContain('<xf:group class="schbox_inner" id="tbl_search">');
    expect(xml).toContain('<xf:group class="btn_schbox">');
    expect(xml).not.toContain('grp_search');
    expect(xml).not.toContain('tblbox');
    // 조회버튼은 btn_schbox 안 (폼 td 밖). Phase 1 후 btn_cm sch
    expect(xml).toMatch(/<xf:group class="btn_schbox">[\s\S]*btn_cm sch/);
  }, 60000);

  it('onStage stage2.5-schbox 콜백 발생', async () => {
    const stages: string[] = [];
    await convertHtmlToWebSquare(simpleFormHtml, {
      noLlm: true,
      onStage: (name) => { stages.push(name); },
    });
    expect(stages).toContain('stage2.5-schbox');
  }, 60000);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline-stage25`
Expected: FAIL (정규화 미연결 → tblbox/grp_search 잔존).

- [ ] **Step 3: pipeline.ts에 Stage 2.5 연결**

Edit `packages/figma-ingest/src/pipeline.ts`. import 추가:
```typescript
import { normalizeSchbox } from './stage3/schbox-normalizer';
```

Stage 2(relativeXml 생성) 직후, Stage 3 *이전*, **llmClient 게이트 밖**에 삽입. 현재 pipeline은:
```typescript
  const relativeXml = convertAbsoluteToRelative(absoluteXml, { adaptive: options.adaptive ?? false });
  options.onStage?.('stage2-relative', relativeXml);

  let enrichedXml = relativeXml;
  if (!options.noLlm && options.llmClient) {
    const ir = await inferDataCollection(relativeXml, options.llmClient);
    ...
  }
```

다음으로 교체 (relativeXml → normalizedXml 도입, LLM 블록 입력도 normalizedXml로):
```typescript
  const relativeXml = convertAbsoluteToRelative(absoluteXml, { adaptive: options.adaptive ?? false });
  options.onStage?.('stage2-relative', relativeXml);

  // Stage 2.5: schbox 구조 정규화 (항상 실행 — 구조는 바인딩과 독립)
  const normalizedXml = normalizeSchbox(relativeXml);
  options.onStage?.('stage2.5-schbox', normalizedXml);

  let enrichedXml = normalizedXml;
  if (!options.noLlm && options.llmClient) {
    const ir = await inferDataCollection(normalizedXml, options.llmClient);
    enrichedXml = injectDataCollection(normalizedXml, ir);
    enrichedXml = bindDataCollection(enrichedXml, ir);
    options.onStage?.('stage3-enriched', { ir, xml: enrichedXml });
  }
```

(이후 renameIdToUi01(enrichedXml) → applyButtonModifiersInXml → scaffold... 는 그대로. enrichedXml은 normalizedXml 기반.)

- [ ] **Step 4: 빌드 + 테스트**

Run: `corepack pnpm --filter @kdh/figma-ingest build` (clean)
Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline-stage25`
Expected: 2개 PASS.

전체:
Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: **골든 회귀 3개 FAIL 예상** (골든이 아직 tblbox 구조 — Task 6에서 재생성). 그 외 테스트는 PASS여야 함. 특히:
- pipeline.e2e의 기존 ref 바인딩 테스트: ref-binder가 schbox_inner 안 input에 ref 부착 → 여전히 PASS여야 함 (boundComponentId 우선). 만약 깨지면 조사.
- pipeline-stage35(2C-1은 아직 없음 — 2C-0이 먼저). 2C-1 테스트는 이 시점에 존재 안 함.

report에 "골든 N FAIL (예상), 그 외 PASS" 명시.

- [ ] **Step 5: 커밋 (PowerShell)**

```
git add packages/figma-ingest/src/pipeline.ts packages/figma-ingest/tests/stage3/pipeline-stage25.test.ts
git commit -m "feat(phase-2c0): pipeline Stage 2.5(normalizeSchbox) 연결 — 항상 실행"
```

---

### Task 6: 골든 재생성 + region-parser schbox 확인 + E2E + 전체 회귀

**Files:** Modify `tests/golden/*.expected.xml` + `tests/pipeline.e2e.test.ts`

- [ ] **Step 1: E2E에 schbox 구조 검증 추가**

`packages/figma-ingest/tests/pipeline.e2e.test.ts`의 Stage 3 describe 블록에 추가 (makeMock 헬퍼 재사용):

```typescript
  it('simple-form: 검색영역이 표준 schbox 구조 (Phase 2C-0)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });
    expect(xml).toContain('<xf:group class="schbox_inner" id="tbl_search">');
    expect(xml).toContain('<xf:group class="btn_schbox">');
    expect(xml).not.toContain('grp_search');
    expect(xml).not.toContain('tblbox');
    // 조회버튼이 btn_schbox 안, ref 바인딩된 input은 schbox_inner 안
    expect(xml).toMatch(/<xf:group class="btn_schbox">[\s\S]*btn_cm sch/);
    expect(xml).toMatch(/schbox_inner[\s\S]*ibx_empCd[^>]*ref="data:dma_search\.EMP_CD"/);
  }, 60000);
```

- [ ] **Step 2: region-parser가 schbox 추출하는지 단위 확인**

`packages/figma-ingest/tests/stage3/xml-region-parser.test.ts`에 추가 (정규화 후 XML에서 schbox 추출 확인). normalizeSchbox 출력 형태의 fixture:

```typescript
import { normalizeSchbox } from '../../src/stage3/schbox-normalizer';

it('정규화된 schbox에서 region 추출 (Phase 2C-0 연계)', () => {
  const raw = `<root><xf:group class="tblbox" id="grp_search_001"><xf:group class="w2tb tbl"><xf:group class="w2tb_th"><w2:textbox label="사번"/></xf:group><xf:group class="w2tb_td"><xf:input id="ibx_empCd" label="사번"/><xf:trigger id="b"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group></xf:group></xf:group></root>`;
  const normalized = normalizeSchbox(raw);
  const regions = extractRegions(normalized);
  const sch = regions.find(r => r.kind === 'schbox');
  expect(sch).toBeDefined();
  if (sch?.kind !== 'schbox') throw new Error('not schbox');
  expect(sch.fields).toContainEqual({ label: '사번', componentId: 'ibx_empCd' });
});
```

Run: `corepack pnpm --filter @kdh/figma-ingest test xml-region-parser`
Expected: 기존 + 신규 PASS. (정규화 후 class="schbox"가 생기므로 region-parser가 schbox 추출.)

- [ ] **Step 3: 골든 재생성**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
Run: `corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate`
Expected: 3개 골든 재생성.

- [ ] **Step 4: 골든 검토 (Read)**

각 골든에서:
- 검색영역: `<xf:group class="schbox">` (또는 schbox 포함) > `<xf:group class="schbox_inner" id="tbl_search">` > `.w2tb.tbl`
- `<xf:group class="btn_schbox">` 안에 조회버튼(`class="btn_cm sch"`)
- `grp_search`/`tblbox` 없음
- ref 바인딩(2B)·dataList·submission 여전히 존재
- CDATA 라벨(`<![CDATA[조회]]>`) 보존, well-formed

이상하면 (구조 깨짐, CDATA 손상, ref 소실) report에 명시.

- [ ] **Step 5: 골든 회귀 + 전체**

Run: `corepack pnpm --filter @kdh/figma-ingest test golden`
Expected: 3/3 PASS.

Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 전체 PASS, fail 0 (live-llm 1 skip).

- [ ] **Step 6: 커밋 (PowerShell)**

```
git add packages/figma-ingest/tests/golden/ packages/figma-ingest/tests/pipeline.e2e.test.ts packages/figma-ingest/tests/stage3/xml-region-parser.test.ts
git commit -m "test(phase-2c0): 골든 재생성(schbox 구조) + E2E + region-parser schbox 추출 확인"
```

---

## Self-Review Notes

**Spec coverage:**
- §2 (목표: tblbox#grp_search → schbox/schbox_inner#tbl_search/btn_schbox) → Task 3 transformSearchBlock ✓
- §3 (Stage 2.5, 게이트 밖) → Task 5 ✓
- §4 (모듈 schbox-normalizer) → Task 1-4 ✓
- §5-1 (탐지: grp_search + 조회/검색/초기화 버튼) → Task 1 findSearchGroupBlock + hasSearchButton ✓
- §5-2 (변환: balanced 매칭 + 문자열 수술, CDATA 보존) → Task 1 findGroupEnd + Task 3 transformSearchBlock (cheerio 미사용, CDATA 문자열 보존) ✓
- §5-3 (no-op) → Task 3/4 ✓
- §6 (before/after) → Task 3 테스트 ✓
- §7 (후속 영향: region-parser schbox 추출) → Task 6 Step 2 ✓
- §8 (테스팅) → 각 Task + Task 6 ✓
- §9 (성공 기준) → Task 6 전체 회귀 ✓
- §10 (리스크: balanced 매칭은 cheerio 대신 depth 스캔, CDATA는 문자열 보존) → 구현이 cheerio 직렬화 회피로 해결 ✓

> **스펙과의 차이**: 스펙 §5-2는 "cheerio 노드 기반 + 전체문서 fallback"을 제안했으나, 구현은 **cheerio를 전혀 쓰지 않고 balanced 정규식 매칭 + 문자열 수술**로 진행. 이유: cheerio `$.xml()` 전체 재직렬화가 버튼 라벨 CDATA를 깨뜨릴 위험 + 전체 포맷 변동. 문자열 수술이 CDATA·포맷 보존에 더 안전. region-parser(읽기)는 여전히 cheerio 사용(무변경).

**Placeholder scan:** TBD/TODO 없음. 모든 step에 실제 코드.

**Type consistency:**
- `findGroupEnd(xml, openStart): number`, `findSearchGroupBlock(xml, fromIndex?): SearchGroup|null`, `hasSearchButton(block): boolean`, `extractSearchButtons(block): {buttons, rest}`, `transformSearchBlock(block): string`, `normalizeSchbox(xml): string` — 일관 ✓
- `SearchGroup { start, end, block }` Task 1 정의, Task 4에서 사용 ✓
- pipeline `normalizeSchbox(relativeXml)` → `normalizedXml` (Task 5) ✓

**의존성 순서:** Task 1(헬퍼) → 2(extractSearchButtons) → 3(transform, 1+2 사용) → 4(normalize, 1-3 사용) → 5(pipeline) → 6(골든/E2E). forward ref 없음 ✓

---

*문서 끝.*
