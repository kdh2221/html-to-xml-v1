# 원본 CSS/JS 참조 보존 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 입력 HTML의 `<style>`·`<script>` 원본을 참조용 사이드카 파일(`.source.css`/`.source.js`)로 보존하고, CLI 출력 XML 헤드에 포인터 주석으로 참조하게 한다(자동 적용 안 함).

**Architecture:** 신규 순수 모듈 `src/source-assets.ts`(extractSourceCss/extractSourceScript/injectSourceReference, 정규식·non-throw). 파이프라인은 `onStage('source-assets', {css,js})` 관찰만(출력 불변 → 골든 영향 0). CLI가 사이드카 기록 + 헤드 포인터 주석 주입.

**Tech Stack:** TypeScript strict, Vitest, 정규식 문자열 처리.

**Spec reference:** [`docs/superpowers/specs/2026-05-22-source-asset-preservation-design.md`](../specs/2026-05-22-source-asset-preservation-design.md)

---

## ⚠️ 구현 노트 (필독)

- **파이프라인은 주석 주입 안 함** — onStage만. 참조 주석은 **CLI 전용**(파일명을 CLI가 정하므로). 골든(파이프라인 출력) 불변.
- 현 fixture 3개는 `<style>`/`<script>`가 없어 css/js `''` → 사이드카·주석 미생성 → 골든·XML 영향 0.
- `injectSourceReference` 주석 본문에 `--` 금지(XML 주석 안전). 파일명만(경로 제외) 사용.
- 순수·non-throw. Co-Authored-By 트레일러 금지.

---

## File Structure

```
packages/figma-ingest/
├── src/
│   ├── source-assets.ts       # NEW — extractSourceCss / extractSourceScript / injectSourceReference
│   ├── pipeline.ts            # MODIFY — onStage('source-assets', {css,js})
│   └── cli.ts                 # MODIFY — 사이드카 기록 + 헤드 포인터 주석
└── tests/
    ├── source-assets.test.ts          # NEW
    └── pipeline.e2e.test.ts           # MODIFY — onStage('source-assets') 발생 1건
```

---

### Task 1: source-assets 모듈 (extract + inject)

**Files:** Create `src/source-assets.ts` + `tests/source-assets.test.ts`

- [ ] **Step 1: 실패 테스트 작성**

Create `packages/figma-ingest/tests/source-assets.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { extractSourceCss, extractSourceScript, injectSourceReference } from '../src/source-assets';

describe('extractSourceCss', () => {
  it('인라인 <style> 본문 + 안내 헤더', () => {
    const css = extractSourceCss('<html><head><style>.a{color:red}</style></head></html>');
    expect(css).toContain('.a{color:red}');
    expect(css).toContain('참조용');
  });
  it('다중 <style> 모두 + 외부 link URL 주석', () => {
    const css = extractSourceCss('<style>.a{}</style><link rel="stylesheet" href="x.css"><style>.b{}</style>');
    expect(css).toContain('.a{}');
    expect(css).toContain('.b{}');
    expect(css).toContain('x.css');
  });
  it('CSS 없으면 빈 문자열', () => {
    expect(extractSourceCss('<html><body><p>hi</p></body></html>')).toBe('');
  });
});

describe('extractSourceScript', () => {
  it('인라인 <script> 본문 + 헤더', () => {
    const js = extractSourceScript('<script>var a=1;</script>');
    expect(js).toContain('var a=1;');
    expect(js).toContain('참조용');
  });
  it('외부 src 있으면 URL 주석', () => {
    const js = extractSourceScript('<script src="lib.js"></script>');
    expect(js).toContain('lib.js');
  });
  it('script 없으면 빈 문자열', () => {
    expect(extractSourceScript('<html><body></body></html>')).toBe('');
  });
});

describe('injectSourceReference', () => {
  const xml = `<html>\n\t<head xmlns="x" meta_screenId="S">\n\t\t<w2:type>COMPONENT</w2:type>\n\t</head>\n\t<body></body>\n</html>`;
  it('css+js 둘 다 → 헤드 뒤 포인터 주석 (파일명 포함)', () => {
    const out = injectSourceReference(xml, { css: 'A.source.css', js: 'A.source.js' });
    expect(out).toMatch(/<head\b[^>]*>\s*<!-- 원본 소스 참조[^>]*A\.source\.css[^>]*A\.source\.js[^>]*-->/);
    expect(out).toContain('<w2:type>');  // 기존 내용 보존
  });
  it('css만 → css만 주석', () => {
    const out = injectSourceReference(xml, { css: 'A.source.css' });
    expect(out).toContain('A.source.css');
    expect(out).not.toContain('.source.js');
  });
  it('refs 없으면 원본 그대로', () => {
    expect(injectSourceReference(xml, {})).toBe(xml);
  });
  it('<head> 없으면 원본 그대로', () => {
    expect(injectSourceReference('<html><body/></html>', { css: 'A.source.css' })).toBe('<html><body/></html>');
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test source-assets`
Expected: FAIL (module 없음)

- [ ] **Step 3: 구현**

Create `packages/figma-ingest/src/source-assets.ts`:

```typescript
/**
 * 입력 HTML의 원본 CSS/JS를 참조용으로 보존.
 * - extractSourceCss/Script: 인라인 본문 + 외부 URL(주석) + 안내 헤더 (없으면 '').
 * - injectSourceReference: 출력 XML <head> 뒤에 사이드카 포인터 주석 삽입.
 * 자동 적용은 하지 않음(수동 포팅 참고용). 순수·non-throw.
 */

const CSS_HEADER =
  '/* 원본 HTML에서 추출한 CSS (참조용). WebSquare 출력에 자동 적용되지 않음 —\n' +
  '   변환 중 id/구조 변경으로 셀렉터가 맞지 않을 수 있음. 수동 포팅 참고. */';
const JS_HEADER =
  '/* 원본 HTML에서 추출한 JS (참조용). WebSquare 출력에 자동 적용되지 않음 —\n' +
  '   원본 div 기반 DOM 대상이라 WebSquare DOM에서 동작하지 않음. 수동 포팅 참고. */';

function collectLinks(html: string): string[] {
  const out: string[] = [];
  const re = /<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[0].match(/\bhref=["']([^"']+)["']/i);
    if (href) out.push(href[1]);
  }
  return out;
}

export function extractSourceCss(html: string): string {
  const links = collectLinks(html);
  const styles: string[] = [];
  const re = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const body = m[1].trim();
    if (body) styles.push(body);
  }
  if (links.length === 0 && styles.length === 0) return '';
  const parts = [CSS_HEADER];
  if (links.length) {
    parts.push('', '/* 외부 stylesheet (원본 link 참조) */');
    for (const l of links) parts.push(`/*   ${l} */`);
  }
  if (styles.length) parts.push('', ...styles);
  return parts.join('\n') + '\n';
}

export function extractSourceScript(html: string): string {
  const srcs: string[] = [];
  const inline: string[] = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1];
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    if (srcMatch) {
      srcs.push(srcMatch[1]);
    } else {
      const body = m[2].trim();
      if (body) inline.push(body);
    }
  }
  if (srcs.length === 0 && inline.length === 0) return '';
  const parts = [JS_HEADER];
  if (srcs.length) {
    parts.push('', '/* 외부 script (원본 src 참조) */');
    for (const s of srcs) parts.push(`/*   ${s} */`);
  }
  if (inline.length) parts.push('', ...inline);
  return parts.join('\n') + '\n';
}

export function injectSourceReference(xml: string, refs: { css?: string; js?: string }): string {
  const names = [refs.css, refs.js].filter(Boolean) as string[];
  if (names.length === 0) return xml;
  const comment = `<!-- 원본 소스 참조(자동 적용 안 됨, 수동 포팅용): ${names.join(' / ')} -->`;
  // <head ...> 여는 태그 직후에 삽입
  return xml.replace(/(<head\b[^>]*>)/, (full) => `${full}\n${comment}`);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `corepack pnpm --filter @kdh/figma-ingest test source-assets`
Expected: 모든 케이스 PASS (extractSourceCss 3 + extractSourceScript 3 + injectSourceReference 4 = 10).

- [ ] **Step 5: 빌드 + 커밋 (Co-Authored-By 금지)**

Run: `corepack pnpm --filter @kdh/figma-ingest build`
```
git add packages/figma-ingest/src/source-assets.ts packages/figma-ingest/tests/source-assets.test.ts
git commit -m "feat(source-assets): 원본 CSS/JS 추출 + XML 참조 주석 삽입 (참조 전용)"
```

---

### Task 2: 통합 — 파이프라인 onStage + CLI 사이드카/주석

**Files:** Modify `src/pipeline.ts`, `src/cli.ts` + `tests/pipeline.e2e.test.ts`

- [ ] **Step 1: 파이프라인 onStage 연결**

Edit `packages/figma-ingest/src/pipeline.ts`. import 추가(다른 import 근처):
```typescript
import { extractSourceCss, extractSourceScript } from './source-assets';
```
`extractFromHtml` 직후(`extraction` 선언 다음 줄, `options.onStage?.('stage0-extraction', extraction);` 아래)에 추가:
```typescript
  options.onStage?.('source-assets', {
    css: extractSourceCss(html),
    js: extractSourceScript(html),
  });
```
(파이프라인은 주석 주입/출력 변경 없음 — onStage 관찰만.)

- [ ] **Step 2: e2e onStage 테스트 추가**

`packages/figma-ingest/tests/pipeline.e2e.test.ts`의 Mock-LLM describe 블록에 추가:
```typescript
  it('파이프라인 onStage(source-assets) 발생 (Phase: source 보존)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    let assets: { css: string; js: string } | null = null;
    await convertHtmlToWebSquare(html, {
      llmClient: makeMock('simple-form'),
      onStage: (n, p) => { if (n === 'source-assets') assets = p as { css: string; js: string }; },
    });
    expect(assets).not.toBeNull();
    // simple-form fixture엔 <style>/<script>가 없으므로 둘 다 ''
    expect((assets as unknown as { css: string }).css).toBe('');
    expect((assets as unknown as { js: string }).js).toBe('');
  }, 60000);
```

- [ ] **Step 3: e2e 실행 (통과 확인)**

Run: `corepack pnpm --filter @kdh/figma-ingest test pipeline.e2e`
Expected: 신규 테스트 PASS (assets 이벤트 발생, css/js '').

- [ ] **Step 4: CLI 사이드카 + 포인터 주석 연결**

Edit `packages/figma-ingest/src/cli.ts`. import 추가:
```typescript
import { injectSourceReference } from './source-assets';
```
현재 변환 호출(이미 `onStage`로 preservation 수집 중)에 source-assets 수집을 합칩니다. 현재:
```typescript
    let preservation: PreservationReport | null = null;
    const xml = await convertHtmlToWebSquare(html, {
      adaptive, noLlm, llmClient,
      onStage: (n, p) => { if (n === 'preservation') preservation = p as PreservationReport; },
    });
    fs.writeFileSync(absOutput, xml, 'utf-8');
    console.log(`OK Wrote ${xml.length} chars`);
```
다음으로 교체 (source-assets 수집 + 사이드카 + 주석 주입을 write 전에):
```typescript
    let preservation: PreservationReport | null = null;
    let sourceAssets: { css: string; js: string } = { css: '', js: '' };
    let finalXml = await convertHtmlToWebSquare(html, {
      adaptive, noLlm, llmClient,
      onStage: (n, p) => {
        if (n === 'preservation') preservation = p as PreservationReport;
        if (n === 'source-assets') sourceAssets = p as { css: string; js: string };
      },
    });

    // 원본 CSS/JS 참조 사이드카 + XML 포인터 주석
    const base = absOutput.replace(/\.xml$/i, '');
    const baseName = path.basename(base);
    const refs: { css?: string; js?: string } = {};
    if (sourceAssets.css) {
      const p = `${base}.source.css`;
      fs.writeFileSync(p, sourceAssets.css, 'utf-8');
      refs.css = `${baseName}.source.css`;
      console.log(`🎨 원본 CSS 참조 저장: ${p}`);
    }
    if (sourceAssets.js) {
      const p = `${base}.source.js`;
      fs.writeFileSync(p, sourceAssets.js, 'utf-8');
      refs.js = `${baseName}.source.js`;
      console.log(`📜 원본 JS 참조 저장: ${p}`);
    }
    finalXml = injectSourceReference(finalXml, refs);

    fs.writeFileSync(absOutput, finalXml, 'utf-8');
    console.log(`OK Wrote ${finalXml.length} chars`);
```
이후 기존 리포트 블록(`if (preservation) ...`, `validateAntiPatterns(xml)`, 스크린샷, 비용)에서 **`xml` 참조를 `finalXml`로 교체**하세요. (기존에 `const violations = validateAntiPatterns(xml);` 등 `xml`을 쓰던 곳 모두 `finalXml`로.) — 변수명 일관성 확인 필수, 빌드로 검증.

- [ ] **Step 5: 빌드 + 전체 테스트**

Run: `corepack pnpm --filter @kdh/figma-ingest build` (clean — `xml` 미정의 참조 없는지 확인)
Run: `corepack pnpm --filter @kdh/figma-ingest test`
Expected: 전체 PASS, 0 fail (live-llm 1 skip). 골든 불변(파이프라인 onStage만 추가).

- [ ] **Step 6: 스모크 — 프로토타입으로 사이드카 생성 확인 (선택, 수동)**

(프로토타입 파일이 있으면) 실제 사이드카 생성 확인:
```
node packages/figma-ingest/dist/cli.js C:/Users/user/.claude/working-prototype.html out/proto.xml --no-llm
```
Expected: `out/proto.source.css`, `out/proto.source.js` 생성 + `out/proto.xml` 헤드에 포인터 주석. (out/은 .gitignore — 커밋 안 함.)

- [ ] **Step 7: 커밋**

```
git add packages/figma-ingest/src/pipeline.ts packages/figma-ingest/src/cli.ts packages/figma-ingest/tests/pipeline.e2e.test.ts
git commit -m "feat(source-assets): 파이프라인 onStage(source-assets) + CLI 사이드카(.source.css/.js) + XML 참조 주석"
```

---

## Self-Review Notes

**Spec coverage:**
- §2-1 extractSourceCss(인라인+link+헤더, 없으면 '') → Task 1 ✓
- §2-2 extractSourceScript(인라인+src+헤더, 없으면 '') → Task 1 ✓
- §2-3 injectSourceReference(헤드 뒤 주석, refs 없음/head 없음 → 원본) → Task 1 ✓
- §3-1 파이프라인 onStage('source-assets', {css,js}) 관찰만 → Task 2 ✓
- §3-2 CLI 사이드카(.source.css/.js) + injectSourceReference 주석 → Task 2 ✓
- §4 엣지(현 fixture '' → 영향 0) → Task 2 e2e(css/js '') ✓
- §5 테스트(단위 + onStage) → Task 1/2 ✓
- §6 성공기준 → 전체 ✓

**Placeholder scan:** TBD/TODO 없음. 모든 step 실제 코드. Task 2 Step4는 `xml`→`finalXml` 치환을 명시(빌드로 검증).

**Type consistency:**
- `extractSourceCss(html): string`, `extractSourceScript(html): string`, `injectSourceReference(xml, {css?,js?}): string` — Task 1 정의, Task 2(pipeline/CLI) 사용 ✓
- onStage payload `{ css: string; js: string }` — pipeline emit ↔ CLI/e2e 수신 일관 ✓
- CLI `finalXml`로 일원화(기존 `xml` 참조 모두 교체) — Step4에 명시 ✓

**의존성 순서:** Task 1(모듈) → 2(통합, 1 사용). forward ref 없음 ✓

---

*문서 끝.*
