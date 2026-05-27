# 원본 CSS/JS 참조 보존 (Source Asset Preservation) 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-22 |
| 상태 | Draft v1.0 |
| 선행 | Phase 0+1 ~ Phase 4 (파이프라인이 최종 XML 산출) |
| 접근 | 입력 HTML의 `<style>`·`<script>` 원본을 **참조용 사이드카 파일**로 보존하고, 출력 XML 헤드에 **포인터 주석**으로 참조. 자동 적용은 하지 않음(수동 포팅 참고용) |

## 0. 관련 자산
- `src/dom-extractor.ts`(Stage 0 — `<style>`/`<script>`를 SKIP), `src/cli.ts`, `src/pipeline.ts`
- 배경: 변환은 의미 컴포넌트만 추출하고 CSS/JS는 드롭한다(설계상). 실전 프로토타입 변환 시 원본 스타일/스크립트가 사라져 수동 포팅 시 참고 자료가 없다는 사용자 피드백.

## 1. 배경과 문제

파이프라인은 입력 HTML에서 **의미 컴포넌트(필드/버튼/표)만** 추출해 WebSquare XML을 만든다. 입력의 `<style>`(CSS)·`<script>`(JS)는 Stage 0에서 버려진다.

- 출력 XML은 **무스타일이 아님**: WebSquare 엔진이 표준 클래스(schbox/btn_cm/w2tb…)에 자기 스킨 CSS를 입힌다.
- 출력의 `<script>`는 우리가 생성한 **scwin 핸들러**(조회/저장 등)다 — 입력의 커스텀 JS와 무관.

그러나 개발자가 변환 결과를 다듬을 때 **원본 CSS/JS를 참고**할 자료가 필요하다. 이 spec은 원본을 **참조 사이드카**로 보존한다.

> **명시적 비목표**: 원본 CSS/JS를 출력에 *자동 적용*하지 않는다. 이유: ① 변환 중 id/구조가 rename·restructure되어 셀렉터가 안 맞고, ② WebSquare 스킨과 충돌하며, ③ 원본 JS는 div 기반 원본 DOM 대상이라 WebSquare DOM에서 동작/에러. (div 기반 요소를 WebSquare group으로 변환해 구조 누락을 줄이는 작업은 **별도 후속 spec**.)

## 2. 모듈 — `src/source-assets.ts` (순수·non-throw, 정규식)

```typescript
/** 입력 HTML의 인라인 <style> 본문 + 외부 <link rel=stylesheet> URL을 참조 텍스트로. 없으면 ''. */
export function extractSourceCss(html: string): string;

/** 입력 HTML의 인라인 <script> 본문 + 외부 <script src> URL을 참조 텍스트로. 없으면 ''. */
export function extractSourceScript(html: string): string;

/** 출력 XML <head> 뒤에 사이드카 참조 포인터 주석을 1줄 삽입. 참조 없으면 원본 그대로. */
export function injectSourceReference(xml: string, refs: { css?: string; js?: string }): string;
```

### 2-1. `extractSourceCss`
- 외부 stylesheet: `<link rel="stylesheet" href="...">`의 href 수집 → 주석 목록.
- 인라인: 모든 `<style>...</style>` 본문 수집.
- 둘 다 없으면 `''`. 있으면 맨 위 안내 헤더 + (외부 URL 주석) + (인라인 본문) 연결.
- 안내 헤더(예): `/* 원본 HTML에서 추출한 CSS (참조용). WebSquare 출력에 자동 적용되지 않음 — 변환 중 id/구조 변경으로 셀렉터 불일치 가능. 수동 포팅 참고. */`

### 2-2. `extractSourceScript`
- 외부: `<script ... src="...">`의 src 수집 → 주석 목록.
- 인라인: src 없는 `<script>...</script>` 본문 수집.
- 둘 다 없으면 `''`. 있으면 안내 헤더(JS 버전) + (외부 URL 주석) + (인라인 본문) 연결.

### 2-3. `injectSourceReference`
- `refs.css`/`refs.js`(사이드카 파일명) 중 존재하는 것만 모아 `<head ...>` 직후에 주석 삽입:
  `<!-- 원본 소스 참조(자동 적용 안 됨, 수동 포팅용): FX001M01.source.css / FX001M01.source.js -->`
- `--` 문자를 본문에 쓰지 않아 XML 주석 안전. `<head` 매칭 실패하거나 refs가 비면 원본 그대로 반환(non-throw).

## 3. 통합

### 3-1. 파이프라인 (관찰만, 출력 불변)
`convertHtmlToWebSquare` 시작부(html 확보 직후):
```typescript
options.onStage?.('source-assets', {
  css: extractSourceCss(html),
  js: extractSourceScript(html),
});
```
**파이프라인은 주석을 주입하지 않는다** → 반환 XML·골든 영향 0. (참조 주석은 CLI 패키징 단계에서만.)

### 3-2. CLI (사이드카 + 포인터 주석)
변환 시 onStage로 `{ css, js }` 수집. 출력 파일 기록 직전:
1. `css` 비어있지 않으면 `<출력 basename>.source.css` 기록 (예: `FX001M01.xml` → `FX001M01.source.css`).
2. `js` 비어있지 않으면 `<출력 basename>.source.js` 기록.
3. 기록한 사이드카 파일명들로 `xml = injectSourceReference(xml, { css?, js? })` → XML 헤드에 포인터 주석.
4. xml 파일 기록.
5. `🎨 원본 CSS 참조 저장: ...` / `📜 원본 JS 참조 저장: ...` 메시지. exit 0.

(사이드카 basename은 출력 경로에서 `.xml` 제거 후 `.source.css`/`.source.js`. injectSourceReference에는 **파일명만**(경로 제외) 전달해 주석이 같은 폴더 기준이 되게.)

## 4. 엣지 / 안전성

| 상황 | 동작 |
|---|---|
| 입력에 `<style>`·`<script>` 없음 (현 fixture 3개) | css/js `''` → 사이드카·주석 미생성 → **골든·XML 영향 0** |
| 외부 link/script만 있고 인라인 없음 | URL 주석만 담긴 사이드카 생성 |
| CSS에 `--var`(커스텀 속성) | 사이드카는 .css 파일이라 무관. 포인터 주석엔 CSS 내용 없음(`--` 안전) |
| 깨진 HTML | non-throw — 추출 가능한 만큼만 |
| `<head>` 없는 XML | injectSourceReference 원본 그대로 |

## 5. 테스트 전략

### 5-1. 단위 (`source-assets.ts`)
- `extractSourceCss`: 단일/다중 `<style>` 본문 + `<link rel=stylesheet>` URL 주석 + 헤더 / CSS 없으면 `''`.
- `extractSourceScript`: 단일/다중 인라인 `<script>` 본문 + `<script src>` URL 주석 / 외부만 / 없으면 `''`.
- `injectSourceReference`: css만 / js만 / 둘다 → `<head>` 뒤 주석 삽입(파일명 포함); refs 없음 또는 `<head>` 없음 → 원본 그대로.

### 5-2. 파이프라인/CLI
- `onStage('source-assets', {css, js})` 발생 (Mock LLM e2e 1건; css/js는 fixture에 없어 `''`여도 이벤트 자체는 발생).
- (CLI 사이드카/주석은 수동 스냅샷 부담 → 단위 + injectSourceReference로 충분.)

## 6. 성공 기준
1. `extractSourceCss`/`extractSourceScript`: 인라인 본문 + 외부 URL 주석 + 안내 헤더 정확 추출, 없으면 `''`.
2. `injectSourceReference`: 존재하는 사이드카만 참조하는 포인터 주석을 헤드에 삽입, non-throw.
3. CLI: 소스 있는 입력에 `.source.css`/`.source.js` 사이드카 + XML 헤드 포인터 주석.
4. 파이프라인 순수 출력·골든 불변(현 fixture 영향 0).
5. 순수·non-throw.

## 7. 리스크/미해결
| 리스크 | 완화 |
|---|---|
| 참조 주석이 골든을 바꿀 우려 | 주석 주입은 **CLI 전용**, 파이프라인은 onStage만 → 골든(파이프라인 출력) 불변 |
| 대용량 CSS/JS(프로토타입 196KB) | 사이드카 별도 파일이라 XML 비대 없음 |
| 외부 CDN CSS/JS는 내용 미보존 | 참조용이므로 URL 목록만(주석). 내용 fetch는 범위 외 |

미해결 (후속):
1. **div→group 변환** — 매칭 안 되는 div 기반 요소를 `xf:group`으로 변환해 구조 누락을 줄이는 작업. 변환 결과가 거의 비는 근본 원인 해소. **별도 spec으로 설계 예정**(본 spec과 독립).
2. **원본 JS의 WebSquare 네이티브 이식** — div 대상 JS를 WebSquare 컴포넌트 API로 재작성. 훨씬 후속.

## 8. 부록 — CLI 산출물 예시 (프로토타입 변환 시)

```
FX001M01.xml          ← 변환 출력 (헤드에 포인터 주석 1줄 추가)
FX001M01.source.css   ← 원본 인라인 CSS + 외부 link URL 목록 (참조용)
FX001M01.source.js    ← 원본 인라인 JS + 외부 script src URL 목록 (참조용)
```
`FX001M01.xml` 헤드:
```xml
<head ...>
<!-- 원본 소스 참조(자동 적용 안 됨, 수동 포팅용): FX001M01.source.css / FX001M01.source.js -->
...
```

---

*문서 끝.*
