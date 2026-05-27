# 사용 매뉴얼 — Figma → WebSquare XML 변환 파이프라인

이 문서는 도구를 **실제로 돌리고, 결과를 보고, 활용**하는 전 과정을 단계별로 설명합니다.
(쉬운 개요는 [README.md](../README.md) 참고. 이 문서는 실사용 상세판입니다.)

---

## 목차
1. [한눈에 보기](#1-한눈에-보기)
2. [사전 준비](#2-사전-준비)
3. [설치 & 빌드](#3-설치--빌드)
4. [빠른 시작 (1분)](#4-빠른-시작-1분)
5. [CLI 레퍼런스](#5-cli-레퍼런스)
6. [두 가지 변환 모드 (LLM vs --no-llm)](#6-두-가지-변환-모드)
7. [실행 출력(리포트) 읽는 법](#7-실행-출력리포트-읽는-법)
8. [원본 CSS/JS 참조 보존](#8-원본-cssjs-참조-보존)
9. [⭐ 출력 XML을 "화면"으로 보는 법](#9-출력-xml을-화면으로-보는-법)
10. [입력 HTML 작성 가이드](#10-입력-html-작성-가이드)
11. [프로그램(코드)에서 호출하기](#11-프로그램코드에서-호출하기)
12. [테스트 & 골든](#12-테스트--골든)
13. [문제 해결 (FAQ)](#13-문제-해결-faq)
14. [부록: 파이프라인 단계 요약](#14-부록-파이프라인-단계-요약)

---

## 1. 한눈에 보기

**입력**: Figma 디자인을 AI에 통과시켜 얻은 일반 HTML 파일 한 개.
**출력**: WebSquare 생태계에서 바로 쓰는 XML 파일 한 개 (+ 검증 리포트).

```
input.html  ──[ figma-ingest CLI ]──▶  output.xml  (+ 보존율·안티패턴 리포트)
```

핵심: 단순 마크업 변환이 아니라 **DataCollection(데이터 상자) 추론 → ref 바인딩 → 표준 schbox 구조 → 조회/저장 동작(scwin) → 안티패턴 검증 → 보존율 검사**까지 자동 수행합니다.

---

## 2. 사전 준비

| 항목 | 요구 | 확인 |
|---|---|---|
| Node.js | 20 이상 | `node -v` |
| pnpm | 9 이상 (corepack로 호출) | `corepack pnpm -v` |
| Chrome | Puppeteer가 자동 다운로드 | 첫 설치 시 자동 |
| (선택) Anthropic API 키 | LLM 의미 추론 모드에서만 | [6장](#6-두-가지-변환-모드) |

> **Windows 기준**으로 작성. 경로 구분자만 환경에 맞추면 macOS/Linux도 동일.

---

## 3. 설치 & 빌드

```bash
# 1) 의존성 설치 (첫 실행 시 Puppeteer가 Chrome을 ~/.cache에 받습니다 — 5~10분)
corepack pnpm install

# 2) 빌드 (TypeScript → dist/)
corepack pnpm --filter @kdh/figma-ingest build
```

빌드가 끝나면 `packages/figma-ingest/dist/cli.js`가 생깁니다. 이게 CLI 엔트리입니다.

> 소스(`src/*.ts`)를 고친 뒤에는 **반드시 다시 빌드**해야 CLI에 반영됩니다.

---

## 4. 빠른 시작 (1분)

예제 입력(`tests/fixtures/simple-form.html`)을 변환해 봅니다.

```bash
node packages/figma-ingest/dist/cli.js \
  packages/figma-ingest/tests/fixtures/simple-form.html \
  out/simple-form.output.xml \
  --no-llm
```

실행하면 이런 출력이 뜹니다:
```
Converting .../simple-form.html -> .../out/simple-form.output.xml (adaptive=false, noLlm=true)
OK Wrote 3741 chars
📐 보존율 100.0% (6/6)
⚠️  안티패턴 1건 (critical 1)
  [CRITICAL] ANTI-09 grd_007 — GridView grd_007: header/gBody 컬럼 id 불일치 ...
```

`out/simple-form.output.xml`이 생성됩니다. (리포트 읽는 법은 [7장](#7-실행-출력리포트-읽는-법), `--no-llm`에서 ANTI-09가 뜨는 이유는 [13장 FAQ](#13-문제-해결-faq).)

---

## 5. CLI 레퍼런스

```
node packages/figma-ingest/dist/cli.js <input.html> <output.xml> [옵션]
```

### 위치 인자 (필수, 순서 고정)
| 인자 | 설명 |
|---|---|
| `<input.html>` | 변환할 입력 HTML 경로 |
| `<output.xml>` | 결과 XML을 쓸 경로 (폴더는 미리 있어야 함) |

### 옵션
| 옵션 | 설명 | 기본 |
|---|---|---|
| `--no-llm` | LLM 의미 추론을 건너뜀(결정론 경로만). API 키 없이 동작 | LLM 시도 |
| `--adaptive` | 반응형(상대폭) 변환 옵션 | off |
| `--screenshot <path>` | 입력 HTML을 렌더한 PNG를 `<path>`에 저장(사람 검수용) | off |

### 예시
```bash
# 결정론 변환 (API 키 불필요)
node packages/figma-ingest/dist/cli.js in.html out.xml --no-llm

# LLM 의미 추론 포함 (ANTHROPIC_API_KEY 필요)
node packages/figma-ingest/dist/cli.js in.html out.xml

# 입력 스크린샷도 같이
node packages/figma-ingest/dist/cli.js in.html out.xml --screenshot in.png
```

> **종료 코드**: 변환 실패 시에만 1로 종료합니다. 안티패턴·유실이 있어도 **0으로 종료**(비파괴) — 리포트는 경고로만 출력되고 파일은 정상 생성됩니다.

---

## 6. 두 가지 변환 모드

### (A) LLM 의미 추론 모드 (기본)
화면을 보고 AI가 **DataMap/DataList(데이터 상자)**, **ref 바인딩**, **조회/저장 동작**을 채웁니다. 가장 완성도 높은 출력. `ANTHROPIC_API_KEY` 환경변수가 필요합니다.

**API 키 설정 (Windows, 안전한 방법):**
```powershell
# 키를 코드/채팅에 절대 붙여넣지 말 것. 레지스트리 사용자 환경변수로:
setx ANTHROPIC_API_KEY "sk-ant-..."
# 새 터미널을 열어야 적용됨
```
도구는 실행 시 이 환경변수를 읽어 메모리에서만 사용하며, 로그에 키를 남기지 않습니다.

**비용 가드**: 단일 변환 $1 초과 시 경고, 세션 누적 $10 상한. 실행 끝에 `💰 LLM 비용`이 표시됩니다.

> 키가 없거나 클라이언트 초기화가 실패하면 **자동으로 `--no-llm` 모드로 강등**되어 계속 진행합니다 (에러로 멈추지 않음).

### (B) `--no-llm` 결정론 모드
LLM 없이 규칙 기반으로만 변환(Phase 0+1 동작). DataCollection/바인딩/조회·저장 동작은 생성되지 않습니다. 구조 변환·ID 규칙·버튼 modifier까지만. API 키 불필요, 빠르고 무료, 완전 재현 가능.

| | LLM 모드 | `--no-llm` |
|---|---|---|
| DataMap/DataList | ✅ 추론 | ❌ 빈 dataCollection |
| ref 바인딩 / submission | ✅ | ❌ |
| 조회/저장 scwin 동작 | ✅ | ❌ (빈 onpageload) |
| schbox 정규화·ID·버튼 | ✅ | ✅ |
| API 키 | 필요 | 불필요 |

---

## 7. 실행 출력(리포트) 읽는 법

실행이 끝나면 콘솔에 여러 줄이 뜹니다:

- `OK Wrote N chars` — 출력 XML을 N글자로 정상 기록.
- `📐 보존율 X% (preserved/total)` — 입력의 의미 요소(입력칸·버튼·표 컬럼) 중 출력에 보존된 비율. **100%면 변환에서 아무것도 안 잃음**. 100% 미만이면 아래 `⚠️ 유실` 목록에 무엇이 빠졌는지(`[field/button/gridColumn] 라벨`) 표시.
- `✅ 안티패턴 검증 통과 (위반 0)` 또는 `⚠️ 안티패턴 N건 (critical M)` — deepsquare 금지패턴 9종 검사. 각 위반은 `[심각도] 룰코드 위치 — 설명` + `↳ 대안`(올바른 형태)으로 표시.
- `🖼️ 입력 스크린샷 저장: ...` — `--screenshot` 사용 시.
- `🎨 원본 CSS 참조 저장: ...` / `📜 원본 JS 참조 저장: ...` — 입력 HTML에 `<style>`/`<script>`가 있으면, 그 원본을 출력 옆 `<출력이름>.source.css` / `.source.js` 사이드카 파일로 보존하고 출력 XML 헤드에 포인터 주석을 답니다. **자동 적용은 안 함**(수동 포팅 참고용). 자세한 건 [8장](#8-원본-cssjs-참조-보존).
- `💰 LLM 비용: $...` — LLM 모드에서만.

검사하는 안티패턴 9종(요약): #8 컴포넌트 ID 중복, #9 grid header/body 컬럼 불일치, #10 submission ref 미선언, #2 async/await 불일치(자동수정됨), #1 금지 API, #3 confirm/alert 직접 호출, #4 잘못된 ev: 이벤트, #11 grid header inputType, #15 reform 사용.

---

## 8. 원본 CSS/JS 참조 보존

변환은 입력 HTML에서 **의미 컴포넌트(입력칸·버튼·표)만** 뽑아 WebSquare XML을 만들고, 입력의 `<style>`(CSS)·`<script>`(JS)는 출력에 넣지 않습니다. 이는 의도된 설계입니다 — 출력 XML은 WebSquare 엔진이 표준 클래스에 자기 스킨 CSS를 입히고, 동작은 우리가 생성한 scwin 핸들러가 담당하기 때문입니다.

하지만 변환 결과를 사람이 다듬을 때 **원본 스타일·스크립트가 참고 자료**로 필요합니다. 그래서 CLI는 입력에 `<style>`/`<script>`가 있으면 다음을 만듭니다.

```
FX001M01.xml          ← 변환 출력 (헤드에 포인터 주석 1줄 추가)
FX001M01.source.css   ← 원본 인라인 CSS + 외부 <link> URL 목록 (참조용)
FX001M01.source.js    ← 원본 인라인 JS  + 외부 <script src> URL 목록 (참조용)
```

`FX001M01.xml`의 `<head>` 바로 뒤에는 사이드카를 가리키는 주석이 1줄 들어갑니다:
```xml
<head ...>
<!-- 원본 소스 참조(자동 적용 안 됨, 수동 포팅용): FX001M01.source.css / FX001M01.source.js -->
```

**중요 — 비목표(자동 적용 안 함)**: 원본 CSS/JS를 출력에 자동 적용하지 **않습니다**. 이유는 ① 변환 중 id·구조가 바뀌어 원본 셀렉터가 안 맞고, ② WebSquare 스킨과 충돌하며, ③ 원본 JS는 div 기반 원본 DOM을 대상으로 해서 WebSquare DOM에서는 동작하지 않기 때문입니다. 사이드카는 **수동 포팅용 참고 자료**일 뿐입니다.

> 외부 CDN의 `<link>`/`<script src>`는 내용을 받아오지 않고 **URL 목록만** 주석으로 남깁니다. 입력에 `<style>`/`<script>`가 전혀 없으면 사이드카·주석은 만들지 않습니다(출력 영향 0).

---

## 9. ⭐ 출력 XML을 "화면"으로 보는 법

> **가장 자주 묻는 것**: 출력 `.xml`을 브라우저로 더블클릭하면 **화면이 안 나오고 XML 태그 트리만** 보입니다. 정상입니다.

출력은 **WebSquare 전용 XML**(XHTML+XForms+`w2:`)이라, 일반 브라우저가 아니라 **WebSquare 엔진이 구동**해야 실제 화면이 됩니다. 목적별로:

### (1) 그냥 디자인을 눈으로 보고 싶다
- `--screenshot`로 저장한 PNG를 열거나,
- **입력 HTML 파일**을 브라우저로 직접 엽니다 (이게 렌더 가능한 원본 디자인).

### (2) 변환 결과를 진짜 WebSquare 화면으로 구동하고 싶다 — 구체 절차

> **자주 하는 오해**: workspace 폴더를 통째로 옮기는 게 **아닙니다.** 프로젝트는 그대로 두고, **출력 XML 한 파일만** WRM 안의 `WebContent/ui/` 아래에 넣습니다. WRM은 Java 웹앱(WEB-INF/Spring)이라 file:// 더블클릭이 아니라 **서버가 서빙**해야 하며, 보통 **WebSquare Studio**가 그 역할을 합니다.

전제: 사내에 WebSquare Studio가 설치돼 있음 (예: `C:\WebSquare_Studio\ai_x64\websquare_26.0417\websquare.exe`), 작업 workspace는 `...\workspace\WRM`. (우리 출력은 실제 WRM 페이지와 동일한 `<w2:type>COMPONENT</w2:type>`라 같은 방식으로 로드됩니다.)

**Step 1 — 출력 XML을 WRM ui 폴더에 넣기**
- 위치: `...\workspace\WRM\WebContent\ui\<모듈폴더>\<화면ID>.xml`
- `<모듈폴더>`는 기존 관례대로 `ai`(AI 생성), `BM`, `HM`, `SP` 등 아무거나. 화면ID는 `영문+숫자`(예: `AI001M01.xml`).
- 변환할 때 출력 경로를 아예 그 폴더로 지정하면 복사 불필요:
  ```bash
  node packages/figma-ingest/dist/cli.js in.html \
    "C:/WebSquare_Studio/ai_x64/websquare_26.0417/workspace/WRM/WebContent/ui/ai/AI001M01.xml"
  ```

**Step 2 — WebSquare Studio로 열기**
1. `websquare.exe`(또는 `launcher.exe`) 실행 → workspace로 `...\workspace\WRM` 선택/열기.
2. 좌측 탐색기에서 방금 넣은 `WebContent/ui/<모듈>/<화면ID>.xml`을 찾아 더블클릭.
3. 스튜디오의 **미리보기/실행(Preview/Run)** 기능으로 렌더 — 스튜디오가 내장 서버 + WebSquare 엔진으로 화면을 띄웁니다.
   - 직접 URL로 열 경우(스튜디오/WAS가 서빙 중): `http://<host:port>/websquare/websquare.html?w2xPath=/ui/<모듈>/<화면ID>.xml`

**Step 3 — 한계 인지 (지금 출력 기준)**
- submission `action="/TODO_VERIFY"` → **서버 조회/저장은 미동작**. 레이아웃·데이터 바인딩·이벤트 배선의 **구조 미리보기**입니다.
- 실제 조회/저장까지 보려면: ① action URL을 실 서버 엔드포인트로 교체, ② 해당 서버 서비스가 떠 있어야 함.
- ID는 자동 생성된 값(`ibx_*`, `grd_007` 등). 의미 ID 명명은 후속 과제.

> **준비된 샘플**: 바로 열어볼 수 있게 `...\WRM\WebContent\ui\ai\SAMPLE_figma01.xml`에 simple-form 변환 샘플을 넣어 뒀습니다. 스튜디오에서 열어 미리보기 해보세요. (불필요하면 그 파일만 삭제하면 됩니다.)

### (3) 출력 내용을 텍스트로 점검하고 싶다
`.xml`을 편집기로 열면 됩니다. 핵심만 보려면:
- `<w2:dataCollection>` — 추론된 데이터 상자(DataMap/DataList)
- `ref="data:..."` — 입력칸↔데이터 연결
- `<script><![CDATA[` 안 `scwin.onpageload`/`*_onclick` — 조회·저장 동작
- `<!-- TODO: ... -->` 주석 — **사람이 확인/보완해야 할 지점**(특히 action URL)

---

## 10. 입력 HTML 작성 가이드

도구는 표준 HTML 구조를 읽어 컴포넌트를 분류합니다. 잘 변환되려면:

| 원하는 것 | 권장 HTML |
|---|---|
| 입력칸 + 라벨 | `<label for="empCd">사번</label><input id="empCd">` (label-for 연결 권장) |
| 셀렉트박스 | `<select id="deptCd">...</select>` |
| 날짜 | `<input type="date" id="orderDate">` |
| 버튼 (조회/저장/취소/초기화/엑셀) | `<button type="button">조회</button>` — **라벨 텍스트로 역할 자동 분류** |
| 표(그리드) | `<table><thead><tr><th>사번</th>...</tr></thead><tbody>...</tbody></table>` — `<th>` 텍스트가 컬럼 라벨 |
| 검색영역 묶음 | 검색 input들 + "조회" 버튼을 한 영역에 (자동으로 표준 schbox로 정규화) |
| 상세영역(마스터-디테일) | 그리드 아래 별도 입력 테이블 (그리드와 같은 DataList에 자동 바인딩) |

팁:
- **버튼 텍스트가 동작을 결정**합니다: 조회/검색→검색, 저장→저장흐름, 취소→되돌리기, 초기화·엑셀 다운로드→modifier.
- `<th>` 헤더가 있어야 그리드 컬럼이 라벨과 함께 인식됩니다.
- `id`를 주면 의미명으로 활용되고, 없으면 자동 번호가 붙습니다.

예제는 `packages/figma-ingest/tests/fixtures/`의 `simple-form.html`(검색폼+그리드), `search-grid.html`(검색+다중버튼), `master-detail.html`(검색+그리드+상세폼) 참고.

---

## 11. 프로그램(코드)에서 호출하기

```typescript
import { convertHtmlToWebSquare } from '@kdh/figma-ingest/pipeline';
import { LLMClient } from '@kdh/figma-ingest/stage3/llm-client';

const xml = await convertHtmlToWebSquare(htmlString, {
  llmClient: new LLMClient({ /* tracker 등 */ }),  // 없으면 결정론 경로
  noLlm: false,            // true면 LLM 단계 skip
  adaptive: false,         // 반응형 옵션
  onStage: (name, payload) => {
    // 중간 단계 결과 관찰 (디버그/리포트 수집)
    // name: 'stage0-extraction' | 'stage1-absolute' | 'stage2-relative'
    //     | 'stage2.5-schbox' | 'stage3-enriched' | 'validation'
    //     | 'preservation' | 'phase1-finalized'
    if (name === 'preservation') console.log('보존율', payload);
    if (name === 'validation') console.log('위반', payload);
  },
});
```

- 반환값은 **출력 XML 문자열**.
- 검증/보존 리포트는 `onStage('validation' | 'preservation')` 콜백으로 수집하거나, 별도로:
```typescript
import { validateAntiPatterns } from '@kdh/figma-ingest/validate/anti-pattern-validator';
import { computePreservation } from '@kdh/figma-ingest/validate/preservation-report';
const violations = validateAntiPatterns(xml);          // Violation[]
// computePreservation은 extraction(Stage0 결과)이 필요 → onStage('stage0-extraction')로 수집
```
- 테스트 종료 시 `closeBrowser()`(`dom-extractor`)로 Puppeteer 정리.

---

## 12. 테스트 & 골든

```bash
# 전체 테스트 (Puppeteer 포함, 277개)
corepack pnpm --filter @kdh/figma-ingest test

# 특정 모듈만
corepack pnpm --filter @kdh/figma-ingest test preservation-report

# 실제 LLM smoke (opt-in, API 키 + 비용 발생)
corepack pnpm --filter @kdh/figma-ingest test:llm:live
```

**골든(정답지) 재생성** — legacy 변환/파이프라인/Mock LLM 응답을 *의도적으로* 바꾼 경우에만:
```bash
corepack pnpm --filter @kdh/figma-ingest build
corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate
```
재생성 후 **반드시 `git diff`로 골든 변경을 확인**하세요. (참고: 골든 비교는 Puppeteer 렌더 폭 ±px 흔들림을 무시하도록 정규화되어 있어, 구조·라벨·ref·핸들러만 엄격 비교합니다.)

---

## 13. 문제 해결 (FAQ)

**Q. 출력 `.xml`을 브라우저로 열었더니 화면이 안 나와요.**
정상입니다. WebSquare XML은 엔진이 구동해야 합니다 → [9장](#9-출력-xml을-화면으로-보는-법).

**Q. `--no-llm`로 돌렸더니 `ANTI-09 grid header/body 컬럼 불일치`가 떠요.**
`--no-llm`은 grid-reconciler(header/body 컬럼 id 정렬)가 IR이 없어 실행되지 않습니다. 그래서 그리드 머리(`column1..`)와 몸통(`col_1..`) id가 어긋난 채 나옵니다. **LLM 모드에서는 정렬되어 위반이 사라집니다.** 결정론 출력만 필요하면서 이 경고가 거슬리면 LLM 모드를 쓰거나, 해당 갭 수정은 백로그(결정론 경로 grid 정렬)로 추적 중입니다.

**Q. `LLM client 초기화 실패`가 떠요.**
`ANTHROPIC_API_KEY`가 없거나 잘못됨 → 자동으로 `--no-llm`으로 진행됩니다. LLM 출력을 원하면 [6장](#6-두-가지-변환-모드)대로 키를 설정하고 새 터미널에서 실행.

**Q. 소스를 고쳤는데 CLI 동작이 그대로예요.**
빌드를 다시 하세요: `corepack pnpm --filter @kdh/figma-ingest build`.

**Q. 출력에 `/TODO_VERIFY`, `<!-- TODO ... -->`가 있어요.**
도구가 자동으로 알 수 없는 값(특히 서버 action URL, 추가 필수필드)을 **사람이 확인하라고 표시**한 자리입니다. 실제 배포 전 채워야 합니다.

**Q. 폴더가 없다고 출력 기록이 실패해요.**
출력 경로의 상위 폴더를 미리 만들어 주세요 (`mkdir out`).

---

## 14. 부록: 파이프라인 단계 요약

| 단계 | 하는 일 | 모듈 |
|---|---|---|
| Stage 0 | 입력 HTML을 Puppeteer로 렌더 → 컴포넌트·좌표 추출 | `dom-extractor.ts` |
| Stage 1 | 컴포넌트 → 절대좌표 XML | `absolute-xml-builder.ts` |
| Stage 2 | 절대→상대 + 섹션 분류(schbox/grid/…) | `relative-converter.ts` |
| Stage 2.5 | 검색영역 표준 schbox 정규화 | `stage3/schbox-normalizer.ts` |
| Stage 3 | (LLM) DataMap/DataList 추론·주입 | `stage3/data-collection-inferrer.ts` |
| Stage 3.5 | ref 바인딩·grid 정렬·submission·상세 바인딩 | `stage3/data-binder.ts` 외 |
| Phase 1 | ID prefix(UI-01)·버튼 modifier | `id-renamer.ts`, `button-modifier.ts` |
| Stage 4 | scwin 조회/저장 핸들러 + async 자동수정 | `stage3/scwin-scaffolder.ts`, `validate/anti-pattern-fixer.ts` |
| 검증 | 안티패턴 9종 + 변환 보존율 | `validate/anti-pattern-validator.ts`, `validate/preservation-report.ts` |
| 원본 보존 | 원본 CSS/JS 사이드카(.source.css/.js) + XML 포인터 주석 (CLI) | `source-assets.ts` |

전체 설계·단계별 계획은 [`docs/superpowers/specs/`](superpowers/specs/) · [`docs/superpowers/plans/`](superpowers/plans/) 참고.

---

*문서 끝. 추가로 궁금한 사용 시나리오가 있으면 알려주세요.*
