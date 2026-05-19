# Figma → WebSquare XML 변환 파이프라인

**Figma → AI HTML → WebSquare XML** 자동 변환을 위한 사내 운영 파이프라인.
인스웨이브 WebSquare 생태계에 직접 컴파일되는 XML을 결정론적 룰 + LLM 의미 추론 하이브리드로 생성한다.

> **현재 상태**: Phase 0+1 완료 — 결정론적 변환 경로 (HTML → 컴파일 가능한 XML) 작동
> Phase 2~4 (LLM Semantic Enricher, 안티패턴 검증, 시각 회귀)는 후속 작업

| | |
|---|---|
| **테스트** | 74/74 PASS (9개 test 파일) |
| **검증된 입력** | 3개 HTML 픽스처 (simple-form / search-grid / master-detail) |
| **검증된 출력** | 3개 골든 XML (회귀 baseline) |
| **CLI 작동** | `node packages/figma-ingest/dist/cli.js <in.html> <out.xml>` |

---

## 배경

기존 외환송금 정정 같은 워크플로우 화면을 만들 때 Figma 디자인을 AI에 통과시키면 HTML/CSS는 비교적 쉽게 얻을 수 있다. 그러나 WebSquare 생태계는 단순 HTML을 받지 않는다 — XHTML + XForms + 자체 `w2:` 네임스페이스 + DataCollection SSOT + `deepsquare/codeRule/CodeRules.md`의 15개 CRITICAL 안티패턴 0 위반이 요구된다.

이 도구는 그 변환을 자동화한다.

설계 배경과 시장 컨텍스트는 [`docs/superpowers/specs/2026-05-13-html-to-websquare-design.md`](docs/superpowers/specs/2026-05-13-html-to-websquare-design.md) 참고.

---

## 파이프라인 아키텍처

```
HTML
 │
 ▼
Stage 0  Puppeteer DOM 추출 (실좌표)              [구현 완료]
 │
 ▼
Stage 1  ABSOLUTE-coord WebSquare XML             [구현 완료]
 │
 ▼
Stage 2  RELATIVE 섹션 분류 (legacy SampleConverter [구현 완료, KB 도구 흡수]
 │      → schbox/gvwbox/titbox/btnbox/tblbox)
 ▼
Phase 1 룰  ID prefix UI-01 + 버튼 modifier        [구현 완료]
 │          (id-renamer + button-modifier)
 ▼
Stage 3  LLM Semantic Enricher                    [Phase 2 — 미구현]
 │      DataMap/DataList/Submission 추론
 │      ref="data:..." 바인딩, scwin handler
 ▼
Stage 4  deepsquare 안티패턴 정적 검증            [Phase 3 — 미구현]
 │      15개 CRITICAL 룰 + 자동 수정
 ▼
Stage 5  시각 회귀 (Puppeteer 보존율)             [Phase 4 — 미구현]
 ▼
최종 WebSquare XML + 리포트
```

---

## Quick Start

### 사전 요구사항
- Node.js 20+
- pnpm 9+ (corepack로 호출 가능)

### 설치
```bash
corepack pnpm install
```

(Puppeteer가 Chrome 127을 ~/.cache/puppeteer/에 다운로드합니다 — 첫 설치 시 5~10분 소요)

### 빌드
```bash
corepack pnpm --filter @kdh/figma-ingest build
```

### CLI로 변환
```bash
node packages/figma-ingest/dist/cli.js \
  packages/figma-ingest/tests/fixtures/simple-form.html \
  output.xml
```

출력 XML은:
- `<?xml version="1.0"`로 시작
- WebSquare 4-네임스페이스 (`xmlns:w2`, `xmlns:xf`, `xmlns:ev`)
- UI-01 prefix ID (`ibx_empCd`, `sbx_deptCd`, `btn_search`)
- 버튼 modifier (`class="btn_cm sch"`, `btn_cm pt`, `btn_cm download`)
- 상대좌표 (`position:absolute` 없음)

### 테스트
```bash
# figma-ingest 전체 (74개)
corepack pnpm --filter @kdh/figma-ingest test

# legacy converter 회귀 (32개 reference-pair smoke)
corepack pnpm --filter @kdh/legacy-converter regression

# 골든 XML 재생성 (legacy 변환 로직 변경 후만)
corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate
```

---

## 프로젝트 구조

```
.
├── packages/
│   ├── legacy-converter/                # KB 단말 절대→상대 변환 도구 import
│   │   ├── adapter.js                   # jsdom 기반 IIFE 로더
│   │   ├── js/                          # sample-converter.js 등 9개 모듈
│   │   ├── samples/reference-pairs/     # 42개 검증 페어 (KB Craft 출력)
│   │   └── tests/regression.smoke.js    # 32/32 PASS
│   │
│   └── figma-ingest/                    # TS 신규 파이프라인
│       ├── src/
│       │   ├── types.ts                 # ComponentSpec, ScreenMeta, QualityScore
│       │   ├── element-map.ts           # 태그/role/aria → LegacyCtype 분류
│       │   ├── quality-score.ts         # HTML 시맨틱 점수 (Phase 2 LLM 깊이 분기용)
│       │   ├── id-renamer.ts            # legacy prefix → UI-01 prefix
│       │   ├── button-modifier.ts       # 라벨 → btn_cm modifier (UI-04-1)
│       │   ├── dom-extractor.ts         # Puppeteer DOM 추출 (실좌표)
│       │   ├── absolute-xml-builder.ts  # ABSOLUTE-coord XML 생성
│       │   ├── relative-converter.ts    # legacy SampleConverter 래퍼
│       │   ├── pipeline.ts              # Stage 0→1→2 + Phase 1 룰 오케스트레이터
│       │   └── cli.ts                   # CLI 엔트리
│       ├── tests/
│       │   ├── fixtures/                # 3개 입력 HTML
│       │   ├── golden/                  # 3개 expected XML
│       │   └── *.test.ts                # 9개 test 파일
│       └── dist/                        # tsc 빌드 출력
│
├── docs/superpowers/
│   ├── specs/2026-05-13-html-to-websquare-design.md
│   └── plans/2026-05-13-phase-0-1-foundation-and-figma-ingest.md
│
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── package.json
```

---

## 흡수된 기존 자산 (legacy-converter)

이 프로젝트는 별도 모듈로 import한 **KB국민은행 단말 변환 도구**를 Stage 2 엔진으로 재사용한다:

- **sample-converter.js (2,304줄)** — 42개 reference-pair에서 학습된 섹션 분류 패턴 엔진. schbox/gvwbox/titbox/btnbox/tblbox 자동 판별
- **42개 검증 페어** — 골든 회귀 기반
- **TAG_RENAME_MAP 훅** — 사이트별 태그 매핑 재타기팅
- **capture-server.js (Puppeteer)** — Phase 4 시각 회귀에 흡수 예정

원본 출처: `C:/Users/user/.claude/kdh_proj/websquare-publishing-editor/` (KB Craft → 절대좌표 → 상대좌표 변환용)

---

## Phase 0+1에서 의도적으로 남긴 trade-offs

각 trade-off는 소스 코드에 명시적 주석으로 문서화되어 있다.

| # | 항목 | 위치 | Phase 2에서 해결 예정 |
|---|---|---|---|
| 1 | ID 라운드트립 (`empCd` → `edt_empCd` → `ibx_empCd`) | [dom-extractor.ts](packages/figma-ingest/src/dom-extractor.ts) | Semantic Enricher가 `ComponentSpec.rawHtmlId` 채널로 원본 활용 |
| 2 | Synthetic GroupBox 휴리스틱 (`planLayout`) | [absolute-xml-builder.ts](packages/figma-ingest/src/absolute-xml-builder.ts) | DOM 단계에서 `<form>`/`<fieldset>` 자연 인식 |
| 3 | adapter.js global pollution (단일 스레드 전제) | [legacy-converter/adapter.js](packages/legacy-converter/adapter.js) | `vm.runInNewContext` 컨텍스트 격리 |
| 4 | element-map 인라인 중복 (browser context) | [dom-extractor.ts](packages/figma-ingest/src/dom-extractor.ts) | `page.evaluate(fn, mapJson)` 단일 소스 주입 |

---

## 로드맵

| Phase | 상태 | 산출물 |
|---|---|---|
| **0 (편입)** | ✅ | 기존 KB 변환 도구 모노레포 import, 32/32 회귀 통과 |
| **1 (Figma ingest 결정론)** | ✅ | Stage 0~2 + ID 리네임 + 버튼 modifier, 74/74 tests, CLI 작동 |
| **2 (Semantic Enricher)** | 📋 미구현 | LLM 기반 DataMap/DataList/Submission 추론, ref 바인딩, scwin skeleton |
| **3 (안티패턴 검증)** | 📋 미구현 | deepsquare 15개 CRITICAL 룰 정적 + 자동 수정 + LLM 피드백 루프 |
| **4 (시각 회귀)** | 📋 미구현 | capture-server.js 확장 — 입력 HTML vs 최종 XML 보존율 |
| **5 (검수 UI)** | 📋 미구현 | userspec export + IR diff viewer |

전체 설계는 [`docs/superpowers/specs/2026-05-13-html-to-websquare-design.md`](docs/superpowers/specs/2026-05-13-html-to-websquare-design.md).

---

## 컴포넌트 인터페이스

### `convertHtmlToWebSquare(html, options)`

```typescript
import { convertHtmlToWebSquare } from '@kdh/figma-ingest/pipeline';

const xml = await convertHtmlToWebSquare(htmlString, {
  adaptive: false,            // 반응형 옵션
  onStage: (name, payload) => console.log(name)  // 디버그 콜백
});
```

### `extractFromHtml(html)`

```typescript
import { extractFromHtml, closeBrowser } from '@kdh/figma-ingest/dom-extractor';

const result = await extractFromHtml(htmlString);
// result: { meta, components, qualityScore }
//   components[i]: { id, rawHtmlId, ctype, label, left, top, width, height, columns? }
//   qualityScore: { overall, semanticRatio, labelIdRatio, ariaRatio }

await closeBrowser();  // 테스트 cleanup
```

---

## 개발

### TDD 워크플로

각 src 모듈은 동일 이름의 `tests/*.test.ts`에 unit test가 있다. 변경 시:

```bash
corepack pnpm --filter @kdh/figma-ingest test:watch
```

### 골든 회귀 업데이트

legacy 변환 로직이 의도적으로 변경된 경우에만 골든을 재생성:

```bash
corepack pnpm --filter @kdh/figma-ingest build
corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate
```

**반드시 `git diff`로 골든 변경사항을 확인**하고 PR description에 변경 의도를 적는다. 골든 무심코 regenerate는 진짜 회귀를 놓친다.

---

## 라이선스 / 출처

- WebSquare 엔진 — 인스웨이브 시스템즈
- 본 변환 도구 — 인스웨이브 사내 도구
- 기존 KB 변환 도구 (legacy-converter) — 원작자 별도

---

## 관련 문서

- [설계 spec](docs/superpowers/specs/2026-05-13-html-to-websquare-design.md) — 전체 5단계 파이프라인 설계
- [Phase 0+1 구현 plan](docs/superpowers/plans/2026-05-13-phase-0-1-foundation-and-figma-ingest.md) — 13개 태스크 상세
- WRM 레퍼런스 모델 — `C:/WebSquare_Studio/ai_x64/websquare_26.0417/workspace/WRM/`
- deepsquare LLM DSL — `<WRM>/deepsquare/`
