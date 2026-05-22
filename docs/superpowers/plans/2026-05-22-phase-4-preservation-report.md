# Phase 4: 변환 보존 리포트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 입력 HTML 추출(Stage 0)의 의미 요소(입력필드·버튼·grid 컬럼)가 최종 XML에 라벨 단위로 보존됐는지 multiset diff로 측정해 보존율 리포트를 생성한다(비파괴).

**Architecture:** 신규 `src/validate/preservation-report.ts` — `computePreservation(extraction, finalXml): PreservationReport`(순수·non-throw, cheerio 읽기 + 정규식). 파이프라인은 반환 직전 `onStage('preservation', ...)` 관찰. CLI는 보존율 stderr 출력, exit 0. (선택) `captureInputScreenshot`로 입력 HTML PNG 검수 아티팩트.

**Tech Stack:** TypeScript strict, Vitest, cheerio, Puppeteer(통합 테스트의 입력 추출).

**Spec reference:** [`docs/superpowers/specs/2026-05-22-phase-4-preservation-report-design.md`](../specs/2026-05-22-phase-4-preservation-report-design.md)

---

## ⚠️ 구현 노트 (필독)

- **렌더링 없음**: 입력 측은 파이프라인이 이미 만든 `extraction.components`(Stage 0). 출력 측은 finalXml을 cheerio/정규식으로 파싱. 출력 픽셀 렌더(엔진 필요)는 범위 외.
- **cheerio 네임스페이스 셀렉터 throw 회피**: `$('[label]')` 같은 attribute 셀렉터는 안전. 태그 판별은 `tagNameOf(el)` 소문자 비교(예: `'xf:inputcalendar'`, `'w2:header'`, `'w2:column'`).
- **w2:textbox 오포함 주의**: textbox도 `label` 속성을 가지나 FIELD 패밀리가 아님 → FIELD_TAGS 화이트리스트로만 필드 라벨 수집(textbox 제외).
- **라벨 trim 후 비교, 빈 라벨 제외**. multiset(개수)로 중복 라벨 정확 처리.
- **순수·non-throw**. Co-Authored-By 트레일러 금지.

---

## File Structure

```
packages/figma-ingest/
├── src/
│   ├── validate/preservation-report.ts   # NEW — computePreservation + 추출기 + multiset diff
│   ├── pipeline.ts                        # MODIFY — onStage('preservation')
│   ├── cli.ts                             # MODIFY — 보존율 리포트
│   └── dom-extractor.ts                   # MODIFY (선택) — captureInputScreenshot
└── tests/
    ├── validate/preservation-report.test.ts  # NEW
    └── pipeline.e2e.test.ts                   # MODIFY — 3 fixture 보존율 1.0
```

---

### Task 1: preservation-report 모듈 (추출기 + multiset diff + computePreservation)

**Files:** Create `src/validate/preservation-report.ts` + `tests/validate/preservation-report.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/validate/preservation-report.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  multisetLost,
  extractOutputFieldLabels,
  extractOutputButtonLabels,
  extractOutputGridColumnLabels,
  computePreservation,
} from '../../src/validate/preservation-report';
import type { ExtractionResult } from '../../src/types';

describe('multisetLost', () => {
  it('출력에 없는 입력 라벨만 유실 (중복 개수 정확)', () => {
    expect(multisetLost(['사번', '성명', '성명'], ['사번', '성명'])).toEqual(['성명']);
    expect(multisetLost(['사번'], ['사번'])).toEqual([]);
    expect(multisetLost(['a', 'b'], [])).toEqual(['a', 'b']);
  });
  it('trim + 빈 라벨 제외', () => {
    expect(multisetLost([' 사번 ', ''], ['사번'])).toEqual([]);
  });
});

describe('output 라벨 추출', () => {
  it('extractOutputFieldLabels: 필드 태그 label만 (textbox 제외)', () => {
    const xml = `<root>
      <xf:input id="a" label="사번"/>
      <xf:select1 id="b" label="부서"/>
      <xf:inputCalendar id="c" label="주문일"/>
      <w2:textbox id="t" label="제목"/>
    </root>`;
    expect(extractOutputFieldLabels(xml).sort()).toEqual(['부서', '사번', '주문일']);
  });
  it('extractOutputButtonLabels: trigger CDATA', () => {
    const xml = `<root><xf:trigger id="b1"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>
      <xf:trigger id="b2"><xf:label><![CDATA[저장]]></xf:label></xf:trigger></root>`;
    expect(extractOutputButtonLabels(xml)).toEqual(['조회', '저장']);
  });
  it('extractOutputGridColumnLabels: header column value', () => {
    const xml = `<root><w2:gridView><w2:header><w2:row>
      <w2:column id="A" value="사번"/><w2:column id="B" value="성명"/>
    </w2:row></w2:header><w2:gBody><w2:row><w2:column id="A"/></w2:row></w2:gBody></w2:gridView></root>`;
    expect(extractOutputGridColumnLabels(xml)).toEqual(['사번', '성명']);
  });
});

function ext(components: ExtractionResult['components']): ExtractionResult {
  return { meta: { screenId: 'S', screenName: 'x', width: 1000, height: 600 }, components, qualityScore: { overall: 1, semanticRatio: 1, labelIdRatio: 1, ariaRatio: 1 } };
}

describe('computePreservation', () => {
  it('전부 보존 → rate 1, lost []', () => {
    const extraction = ext([
      { id: 'edt_a', ctype: 'Edit', label: '사번', left: 0, top: 0, width: 100, height: 20 },
      { id: 'btn_a', ctype: 'Button', label: '조회', left: 0, top: 0, width: 50, height: 20 },
      { id: 'grd_a', ctype: 'GridView', label: '', left: 0, top: 0, width: 100, height: 100, columns: [{ id: 'col_1', label: '사번', width: 60 }] },
    ]);
    const xml = `<root><xf:input label="사번"/><xf:trigger><xf:label><![CDATA[조회]]></xf:label></xf:trigger>
      <w2:gridView><w2:header><w2:row><w2:column value="사번"/></w2:row></w2:header></w2:gridView></root>`;
    const r = computePreservation(extraction, xml);
    expect(r.total).toBe(3);
    expect(r.lost).toEqual([]);
    expect(r.rate).toBe(1);
  });
  it('버튼 누락 → lost에 button', () => {
    const extraction = ext([
      { id: 'edt_a', ctype: 'Edit', label: '사번', left: 0, top: 0, width: 100, height: 20 },
      { id: 'btn_a', ctype: 'Button', label: '조회', left: 0, top: 0, width: 50, height: 20 },
    ]);
    const xml = `<root><xf:input label="사번"/></root>`;
    const r = computePreservation(extraction, xml);
    expect(r.lost).toEqual([{ family: 'button', label: '조회' }]);
    expect(r.preserved).toBe(1);
    expect(r.total).toBe(2);
  });
  it('빈 입력 → rate 1', () => {
    expect(computePreservation(ext([]), `<root/>`)).toEqual({ total: 0, preserved: 0, rate: 1, lost: [] });
  });
  it('깨진 xml에도 throw 안 함', () => {
    expect(() => computePreservation(ext([{ id: 'x', ctype: 'Edit', label: '사번', left: 0, top: 0, width: 1, height: 1 }]), `<broken`)).not.toThrow();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test preservation-report`
Expected: FAIL (module 없음)

- [ ] **Step 3: 구현**

Create `packages/figma-ingest/src/validate/preservation-report.ts`:

```typescript
/**
 * Phase 4 — 변환 보존 리포트 (순수·non-throw·렌더링 없음).
 * 입력 추출(Stage 0)의 의미 요소(field/button/gridColumn) 라벨이 최종 XML에
 * 보존됐는지 multiset diff로 측정. 출력 픽셀 렌더는 WebSquare 엔진 필요로 범위 외.
 */
import * as cheerio from 'cheerio';
import type { ExtractionResult, LegacyCtype } from '../types';

export type LostFamily = 'field' | 'button' | 'gridColumn';
export interface LostItem { family: LostFamily; label: string; }
export interface PreservationReport {
  total: number;
  preserved: number;
  rate: number;
  lost: LostItem[];
}

const FIELD_CTYPES: LegacyCtype[] = ['Edit', 'SelectBox', 'Calendar', 'CheckBox', 'Radio', 'TextArea'];
const FIELD_TAGS = ['xf:input', 'xf:select1', 'xf:select', 'xf:inputcalendar', 'xf:textarea'];

function tagNameOf(el: unknown): string {
  const node = el as { tagName?: string; name?: string };
  return (node.tagName ?? node.name ?? '').toLowerCase();
}

/** 라벨 배열 → trim + 빈 제거 후 multiset. */
function toMultiset(labels: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const raw of labels) {
    const l = raw.trim();
    if (!l) continue;
    m.set(l, (m.get(l) ?? 0) + 1);
  }
  return m;
}

/** 입력 multiset − 출력 multiset = 유실 라벨. */
export function multisetLost(input: string[], output: string[]): string[] {
  const inM = toMultiset(input);
  const outM = toMultiset(output);
  const lost: string[] = [];
  for (const [label, n] of inM) {
    const remaining = n - (outM.get(label) ?? 0);
    for (let i = 0; i < remaining; i++) lost.push(label);
  }
  return lost;
}

export function extractOutputFieldLabels(xml: string): string[] {
  const out: string[] = [];
  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    $('[label]').each((_, el) => {
      if (FIELD_TAGS.includes(tagNameOf(el))) {
        const l = $(el).attr('label');
        if (l) out.push(l);
      }
    });
  } catch { /* non-throw */ }
  return out;
}

export function extractOutputButtonLabels(xml: string): string[] {
  const out: string[] = [];
  const re = /<xf:trigger\b[\s\S]*?<\/xf:trigger>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const lbl = m[0].match(/<xf:label>\s*<!\[CDATA\[([^\]]*)\]\]>\s*<\/xf:label>/);
    if (lbl) out.push(lbl[1]);
  }
  return out;
}

export function extractOutputGridColumnLabels(xml: string): string[] {
  const out: string[] = [];
  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    $('*').filter((_, el) => tagNameOf(el) === 'w2:header').each((_, header) => {
      $(header).find('*').filter((_2, c) => tagNameOf(c) === 'w2:column').each((_2, col) => {
        const v = $(col).attr('value');
        if (v) out.push(v);
      });
    });
  } catch { /* non-throw */ }
  return out;
}

function inputFieldLabels(e: ExtractionResult): string[] {
  return e.components.filter(c => FIELD_CTYPES.includes(c.ctype)).map(c => c.label);
}
function inputButtonLabels(e: ExtractionResult): string[] {
  return e.components.filter(c => c.ctype === 'Button').map(c => c.label);
}
function inputGridColumnLabels(e: ExtractionResult): string[] {
  return e.components.filter(c => c.ctype === 'GridView').flatMap(c => (c.columns ?? []).map(col => col.label));
}

export function computePreservation(extraction: ExtractionResult, finalXml: string): PreservationReport {
  const families: Array<{ family: LostFamily; input: string[]; output: string[] }> = [
    { family: 'field', input: inputFieldLabels(extraction), output: extractOutputFieldLabels(finalXml) },
    { family: 'button', input: inputButtonLabels(extraction), output: extractOutputButtonLabels(finalXml) },
    { family: 'gridColumn', input: inputGridColumnLabels(extraction), output: extractOutputGridColumnLabels(finalXml) },
  ];
  const lost: LostItem[] = [];
  let total = 0;
  for (const f of families) {
    total += f.input.map(s => s.trim()).filter(Boolean).length;
    for (const label of multisetLost(f.input, f.output)) lost.push({ family: f.family, label });
  }
  const preserved = total - lost.length;
  return { total, preserved, rate: total > 0 ? preserved / total : 1, lost };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test preservation-report`
Expected: 모든 케이스 PASS (multiset 2 + 추출 3 + computePreservation 4).

만약 cheerio CheerioAPI 타입으로 tsc 에러 시, `byTag` 없이 위 코드대로(인라인 filter) 작성하면 됨. `corepack pnpm --filter @kdh/figma-ingest build` 로 확인.

- [ ] **Step 5: 빌드 + 커밋 (Co-Authored-By 금지)**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/validate/preservation-report.ts packages/figma-ingest/tests/validate/preservation-report.test.ts
git commit -m "feat(phase-4): preservation-report — field/button/gridColumn 라벨 multiset diff"
```

---

### Task 2: 통합 — 파이프라인 onStage + CLI 리포트 + 3 fixture 보존율 1.0

**Files:** Modify `src/pipeline.ts`, `src/cli.ts` + `tests/pipeline.e2e.test.ts`

- [ ] **Step 1: 파이프라인 연결**

Edit `packages/figma-ingest/src/pipeline.ts`. import 추가(다른 validate import 근처):
```typescript
import { computePreservation } from './validate/preservation-report';
```
현재 마무리:
```typescript
  options.onStage?.('validation', validateAntiPatterns(result));
  options.onStage?.('phase1-finalized', result);

  return result;
```
다음으로 교체:
```typescript
  options.onStage?.('validation', validateAntiPatterns(result));
  options.onStage?.('preservation', computePreservation(extraction, result));
  options.onStage?.('phase1-finalized', result);

  return result;
```
(`extraction`은 함수 상단에서 이미 선언됨 — 그대로 사용.)

- [ ] **Step 2: e2e 보존율 테스트 작성**

`packages/figma-ingest/tests/pipeline.e2e.test.ts`의 Mock-LLM describe 블록에 추가:
```typescript
  for (const name of ['simple-form', 'search-grid', 'master-detail']) {
    it(`${name}: 변환 보존율 1.0 — field/button/gridColumn 유실 0 (Phase 4)`, async () => {
      const html = fs.readFileSync(path.join(FIX_DIR, `${name}.html`), 'utf-8');
      let report: { rate: number; lost: unknown[] } | null = null;
      await convertHtmlToWebSquare(html, {
        llmClient: makeMock(name),
        onStage: (n, p) => { if (n === 'preservation') report = p as { rate: number; lost: unknown[] }; },
      });
      expect(report).not.toBeNull();
      expect((report as unknown as { lost: unknown[] }).lost).toEqual([]);
      expect((report as unknown as { rate: number }).rate).toBe(1);
    }, 60000);
  }
```

- [ ] **Step 3: e2e 실행 — 보존율 1.0 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline.e2e`
Expected: 3 fixture 모두 보존율 1.0, 유실 0 → PASS.
**CRITICAL: 어떤 fixture라도 유실이 나오면 STOP & report**(테스트를 느슨하게 하지 말 것 — 진짜 보존 갭일 수 있음. 유실된 라벨·패밀리를 report에 명시. 실 버그/허용손실 판단 후 진행).

- [ ] **Step 4: CLI 리포트 연결**

Edit `packages/figma-ingest/src/cli.ts`. import 추가:
```typescript
import type { PreservationReport } from './validate/preservation-report';
```
`convertHtmlToWebSquare` 호출에 onStage로 preservation 수집. 현재:
```typescript
    const xml = await convertHtmlToWebSquare(html, { adaptive, noLlm, llmClient });
    fs.writeFileSync(absOutput, xml, 'utf-8');
    console.log(`OK Wrote ${xml.length} chars`);
```
다음으로 교체:
```typescript
    let preservation: PreservationReport | null = null;
    const xml = await convertHtmlToWebSquare(html, {
      adaptive, noLlm, llmClient,
      onStage: (n, p) => { if (n === 'preservation') preservation = p as PreservationReport; },
    });
    fs.writeFileSync(absOutput, xml, 'utf-8');
    console.log(`OK Wrote ${xml.length} chars`);
    if (preservation) {
      const r = preservation as PreservationReport;
      console.log(`📐 보존율 ${(r.rate * 100).toFixed(1)}% (${r.preserved}/${r.total})`);
      if (r.lost.length) {
        console.warn(`⚠️  유실 ${r.lost.length}건:`);
        for (const l of r.lost) console.warn(`  [${l.family}] ${l.label}`);
      }
    }
```
(기존 안티패턴 리포트 블록(3A)이 이미 있으면 그 아래/위 어디든 — `xml`/try 블록 안. exit 0 유지.)

- [ ] **Step 5: 빌드 + 전체 테스트**

Run: `corepack pnpm --filter @kdh/figma-ingest build` (clean)
Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 전체 PASS, 0 fail (live-llm 1 skip). 골든 회귀 불변(파이프라인은 onStage만 추가, result 불변).

- [ ] **Step 6: 커밋**

```
git add packages/figma-ingest/src/pipeline.ts packages/figma-ingest/src/cli.ts packages/figma-ingest/tests/pipeline.e2e.test.ts
git commit -m "feat(phase-4): 파이프라인 onStage(preservation) + CLI 보존율 리포트 + 3 fixture 1.0 검증"
```

---

### Task 3: (선택) 입력 HTML 스크린샷 아티팩트

**Files:** Modify `src/dom-extractor.ts`, `src/cli.ts` + `tests/dom-extractor.test.ts`

- [ ] **Step 1: 실패 테스트 추가**

Append to `packages/figma-ingest/tests/dom-extractor.test.ts` (기존 import·`closeBrowser` 확인):
```typescript
import { captureInputScreenshot } from '../src/dom-extractor';

describe('captureInputScreenshot', () => {
  it('입력 HTML 렌더 PNG Buffer 반환 (비어있지 않음)', async () => {
    const png = await captureInputScreenshot('<html><body><button>조회</button></body></html>');
    expect(png.length).toBeGreaterThan(100);
    // PNG 매직 바이트 (89 50 4E 47)
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
  }, 60000);
});
```
(이 describe는 dom-extractor.test.ts의 afterAll closeBrowser 정리에 포함되도록 기존 구조에 맞춰 배치.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test dom-extractor`
Expected: captureInputScreenshot FAIL (export 없음).

- [ ] **Step 3: 구현 추가**

Append to `packages/figma-ingest/src/dom-extractor.ts` (파일 끝, `getBrowser` 재사용):
```typescript
/** 입력 HTML을 렌더해 전체 페이지 PNG Buffer 반환 (사람 검수용 아티팩트). */
export async function captureInputScreenshot(htmlString: string): Promise<Buffer> {
  const br = await getBrowser();
  const page = await br.newPage();
  try {
    await page.setViewport({ width: 1100, height: 800 });
    await page.setContent(htmlString, { waitUntil: 'load' });
    return (await page.screenshot({ fullPage: true, type: 'png' })) as Buffer;
  } finally {
    await page.close();
  }
}
```

- [ ] **Step 4: CLI --screenshot 플래그**

Edit `packages/figma-ingest/src/cli.ts`. import에 `captureInputScreenshot` 추가:
```typescript
import { closeBrowser, captureInputScreenshot } from './dom-extractor';
```
(현재 `import { closeBrowser } from './dom-extractor';` 를 위로 교체.)
플래그 파싱부에 추가(`const noLlm = ...` 근처):
```typescript
  const shotIdx = args.indexOf('--screenshot');
  const screenshotPath = shotIdx >= 0 ? args[shotIdx + 1] : null;
```
주의: `positional` 필터가 `--screenshot`의 값(경로)을 positional로 오인하지 않도록, positional 계산을 다음으로 교체:
```typescript
  const positional = args.filter((a, i) => !a.startsWith('--') && !(shotIdx >= 0 && i === shotIdx + 1));
```
(이 줄은 `shotIdx` 계산 *뒤*에 와야 함.)
`fs.writeFileSync(absOutput, xml, ...)` 성공 블록 안, 보존율 출력 근처에 추가:
```typescript
    if (screenshotPath) {
      const png = await captureInputScreenshot(html);
      fs.writeFileSync(path.resolve(screenshotPath), png);
      console.log(`🖼️  입력 스크린샷 저장: ${path.resolve(screenshotPath)}`);
    }
```

- [ ] **Step 5: 빌드 + 테스트**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
Run: `corepack pnpm --filter @kdh/figma-ingest test dom-extractor`
Expected: captureInputScreenshot smoke PASS.
Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 전체 PASS, 0 fail.

- [ ] **Step 6: 커밋**

```
git add packages/figma-ingest/src/dom-extractor.ts packages/figma-ingest/src/cli.ts packages/figma-ingest/tests/dom-extractor.test.ts
git commit -m "feat(phase-4): captureInputScreenshot + CLI --screenshot (입력 검수 아티팩트)"
```

---

## Self-Review Notes

**Spec coverage:**
- §2 모듈 computePreservation + (선택)captureInputScreenshot → Task 1 + Task 3 ✓
- §3 3 패밀리 라벨 multiset diff (field/button/gridColumn 추출 + matching) → Task 1 ✓
- §4-1 파이프라인 onStage('preservation') → Task 2 ✓ / §4-2 CLI(onStage로 수집) → Task 2 ✓
- §5 엣지(빈 입력 rate1, 중복 multiset, non-throw) → Task 1 테스트 ✓
- §6-1 단위 → Task 1 / §6-2 통합 3 fixture 1.0 → Task 2 / §6-3 스크린샷 smoke → Task 3 ✓
- §7 성공기준 → 전체 ✓
- §8 리스크(trim 비교, 통합이 실 갭 드러냄→STOP&report, Text 제외) → Task 1·2 반영 ✓

**Placeholder scan:** TBD/TODO 없음. 모든 step 실제 코드. Task 2 Step3은 "유실 나오면 STOP" 명시(느슨화 금지).

**Type consistency:**
- `LostFamily`/`LostItem {family,label}`/`PreservationReport {total,preserved,rate,lost}` Task 1 정의, Task 2 CLI 사용 ✓
- `computePreservation(extraction: ExtractionResult, finalXml: string): PreservationReport` 일관 ✓
- 추출기 `extractOutputFieldLabels/ButtonLabels/GridColumnLabels(xml): string[]`, `multisetLost(input, output): string[]` 일관 ✓
- `captureInputScreenshot(html): Promise<Buffer>` Task 3, CLI 사용 ✓
- 파이프라인 `extraction`(line 44) 재사용 ✓

**의존성 순서:** Task 1(모듈) → 2(통합, 1 사용) → 3(선택 스크린샷, 독립). forward ref 없음 ✓

---

*문서 끝.*
