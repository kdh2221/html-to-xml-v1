# Figma → WebSquare XML 자동 변환 파이프라인

> Figma 디자인에서 생성한 HTML을, WebSquare 생태계에서 바로 작동하는 XML로 자동 변환하는 사내 도구입니다.
> 결정론적 규칙과 LLM 의미 추론을 결합해, 데이터 바인딩·이벤트 핸들러·표준 구조까지 갖춘 화면을 생성합니다.

> 📖 **실제로 돌리고·결과를 보고·활용하는 상세 사용법은 → [docs/USAGE.md (사용 매뉴얼)](docs/USAGE.md)**

---

## 🤔 이게 무슨 도구예요?

회사에서 새로운 화면(예: 은행 송금 화면)을 만들 때 순서가 이렇습니다.

1. 디자이너가 **Figma**라는 그림 프로그램으로 화면을 예쁘게 그립니다.
2. AI에게 그 그림을 주면, **HTML**(웹페이지를 만드는 보통의 재료)을 뚝딱 만들어 줍니다. — 여기까지는 쉬워요.
3. 그런데 우리 회사 프로그램인 **WebSquare**는 보통 HTML을 그대로 못 씁니다. **WebSquare 전용 언어(XML)**로 바꿔야만 작동합니다. — 이게 어렵고 손이 많이 가요.

이 도구는 **3번 과정을 사람 대신 자동으로** 해줍니다.
그림 → (AI) → HTML → **(이 도구)** → WebSquare가 바로 쓰는 화면 ✅

> 비유하자면, 한국어로 쓴 편지를 받아서 **회사 전용 암호 편지로 정확하게 번역해 주는 번역기**예요. 단어만 바꾸는 게 아니라, 회사 규칙(띄어쓰기, 서명 위치 등)까지 전부 맞춰 줍니다.

---

## 🧩 왜 그냥 HTML을 쓰면 안 돼요?

WebSquare는 까다로운 규칙쟁이라서, 화면이 제대로 작동하려면 이런 게 다 갖춰져야 해요:

- **데이터 상자**: 화면에 보이는 글자만으로는 부족하고, "이 칸에 들어온 값을 어디에 담을지" 정해 주는 보이지 않는 상자가 필요해요.
- **연결선**: 입력칸과 데이터 상자를 선으로 이어 줘야 값이 저장돼요.
- **버튼 동작**: "조회" 버튼을 눌렀을 때 무슨 일이 일어날지 적어 줘야 해요.
- **금지 규칙**: 하면 안 되는 실수 목록(15가지)이 있는데, 하나라도 어기면 안 돼요.

사람이 매번 이걸 손으로 맞추면 느리고 실수가 생깁니다. 그래서 자동화했어요.

---

## 🏭 어떻게 작동하나요? (컨베이어 벨트 공장 비유)

그림(HTML)이 공장 입구로 들어오면, 여러 작업대를 차례로 지나면서 조금씩 완성됩니다.

```
   HTML 그림
      │
   [1단계] 화면에 뭐가 있는지 읽기 (버튼, 입력칸, 표의 위치 파악)
      │
   [2단계] WebSquare 모양으로 1차 변환 (검색칸/표/제목/버튼 구역 나누기)
      │
   [2.5단계] 검색영역을 표준 모양으로 정리 ★2C-0
      │
   [3단계] AI가 "데이터 상자"를 똑똑하게 추측해서 채우기 ★2A
      │
   [3.5단계] 입력칸과 데이터 상자를 선으로 연결 + 서버로 보낼 택배 만들기 ★2B
      │        + 자세히보기(상세) 칸 연결 ★2C-2(작업 예정)
      │
   [4단계] 이름표(ID) 규칙 맞추기 + 버튼 꾸미기
      │
   [5단계] 버튼 동작(조회 누르면 실행) 적어 넣기 ★2C-1
      │
   완성된 WebSquare 화면 ✅
```

★ 표시는 우리가 단계별로 만들어 온 기능들이에요. 아래 "지금까지 만든 것"에서 쉽게 설명할게요.

---

## ✅ 지금까지 만든 것 (쉬운 설명)

| 단계 | 별명 | 무엇을 했나요? (쉽게) | 상태 |
|---|---|---|---|
| **기초 공사** | Phase 0+1 | 그림을 읽어서 WebSquare 기본 모양으로 바꾸는 **공장의 뼈대**를 세웠어요. 버튼·입력칸·표를 구분하고 이름표를 붙입니다. | ✅ 완료 |
| **AI 데이터 추측** | Phase 2A | 화면을 보고 **"이 값들을 어떤 상자에 담아야 할지"를 AI가 똑똑하게 추측**해서 채워 줍니다. (예: 사번·성명·부서) | ✅ 완료 |
| **선 잇기 + 택배** | Phase 2B | 입력칸과 데이터 상자를 **선으로 연결**하고, 검색 결과를 서버에 요청하는 **택배(제출서)**를 만들어요. 표의 칸도 데이터와 맞춰 줍니다. | ✅ 완료 |
| **검색칸 정리정돈** | Phase 2C-0 | 검색하는 칸 묶음을 WebSquare **표준 모양(schbox)**으로 깔끔하게 정리했어요. 조회 버튼도 제자리로 옮깁니다. | ✅ 완료 |
| **버튼에 생명 불어넣기** | Phase 2C-1 | **"조회" 버튼을 누르면 실제로 검색이 되도록** 동작을 적어 넣었어요. 엔터키로도 검색되게 했고요. 이제 화면이 진짜로 움직입니다! | ✅ 완료 |
| **자세히보기 칸 연결** | Phase 2C-2 | 표에서 한 줄을 고르면 **아래 "자세히 보기" 칸에 그 내용이 자동으로 채워지도록** 연결했어요. (검색칸은 건드리지 않고, 자세히보기 칸만 똑똑하게 골라서 연결합니다) | ✅ 완료 |
| **저장 버튼 동작 + 입력 검사** | Phase 2C-3 | **"저장" 버튼을 누르면** 바뀐 게 있는지 확인하고, 꼭 채워야 할 칸(예: 사번)이 비었는지 검사한 뒤, "저장하시겠습니까?" 물어보고 서버로 보냅니다. **"취소"**는 바꾼 내용을 되돌립니다. | ✅ 완료 |
| **자동 품질 검사** | Phase 3A | 완성된 화면이 **하면 안 되는 실수 9가지**(같은 이름표 두 번, 표의 머리·몸통 칸 수 안 맞음, 없는 상자 참조 등)를 했는지 **자동으로 점검**하고, 고칠 수 있는 건(버튼 동작의 async 빠짐) **자동으로 고칩니다**. 표 칸 짝맞춤도 더 똑똑하게 개선했어요. | ✅ 완료 |
| **빠뜨린 것 없나 검사** | Phase 4 | 원본 그림에 있던 **입력칸·버튼·표 항목이 변환 후에도 하나도 안 빠지고 다 살아있는지** 이름표로 대조해 **보존율 %**를 알려줍니다. (선택) 원본 화면 스크린샷도 한 장 저장해 사람이 눈으로 비교할 수 있어요. | ✅ 완료 |

> **지금 상태**: 자동 검사(테스트) **277개 모두 통과**, 실수 0개. 예시 화면 3개(간단폼·검색표·마스터디테일)는 품질 점검 **위반 0건** + 변환 **보존율 100%**로 깨끗합니다.

---

## 📖 어려운 단어 사전

| 단어 | 쉬운 뜻 |
|---|---|
| **Figma(피그마)** | 화면을 그림으로 그리는 디자인 프로그램 |
| **HTML** | 웹페이지를 만드는 가장 흔한 재료 (보통의 웹 언어) |
| **WebSquare(웹스퀘어)** | 우리 회사가 만든, 화면을 작동시키는 프로그램. 전용 언어가 필요해요 |
| **XML** | WebSquare가 알아듣는 특별한 언어 (HTML의 깐깐한 사촌) |
| **DataMap / DataList (데이터 상자/표)** | 화면 값을 담아 두는 보이지 않는 상자(한 건) / 표(여러 줄) |
| **ref 바인딩 (선 잇기)** | 입력칸과 데이터 상자를 잇는 선. 이어야 값이 저장돼요 |
| **Submission (택배/제출서)** | 입력한 내용을 서버에 보내거나 결과를 받아오는 요청서 |
| **schbox (검색칸 묶음)** | 검색 조건을 입력하는 칸들의 표준 묶음 |
| **grid (그리드/표)** | 결과를 여러 줄로 보여 주는 표 |
| **상세영역 (자세히 보기)** | 표에서 고른 한 줄의 자세한 내용을 보여 주는 칸 |
| **필수값 검사 (validateGroup)** | 저장 전에 꼭 채워야 할 칸이 비었는지 확인하는 검사 |
| **MSG_CM 코드** | "저장하시겠습니까?"처럼 회사 공통으로 쓰는 안내 문구의 번호표 |
| **보존율 (preservation rate)** | 원본의 입력칸·버튼·표 항목이 변환 후 몇 %나 그대로 살아남았는지 |
| **골든(golden) 파일** | "정답지". 도구 출력이 정답지와 똑같은지 매번 비교해서 실수를 잡아요 |

---

## 🗺️ 앞으로 할 일 (로드맵)

| 순서 | 할 일 | 상태 |
|---|---|---|
| 3B | 더 많은 실수 자동 고치기 (이름표 중복 등) | ⏳ 다음 |
| 3C | AI가 검사 결과를 보고 스스로 고치는 순환 | ⏳ 예정 |

---

<details>
<summary>👩‍💻 <b>개발자용 안내</b> (클릭해서 펼치기 — 아키텍처·Quick Start·구조)</summary>

### 파이프라인 아키텍처

HTML이 들어오면 단계(Stage)를 거치며 점점 완성된 WebSquare XML이 됩니다. `★`는 LLM 의미 추론이 관여하는 단계.

```
HTML
 │
 ▼
Stage 0   Puppeteer DOM 추출 (실좌표)                         [✅ Phase 0+1]
 │
 ▼
Stage 1   ABSOLUTE-coord WebSquare XML                       [✅ Phase 0+1]
 │
 ▼
Stage 2   RELATIVE 섹션 분류 (legacy SampleConverter         [✅ Phase 0+1]
 │        → schbox/gvwbox/titbox/btnbox/tblbox)
 ▼
Stage 2.5 schbox 구조 정규화 (tblbox#grp_search →            [✅ Phase 2C-0]
 │        schbox > schbox_inner#tbl_search + btn_schbox)
 ▼
Stage 3   ★ LLM Semantic Enricher                            [✅ Phase 2A]
 │        DataMap/DataList 추론 + DataCollection 주입
 ▼
Stage 3.5 바인딩: ref 부착 → grid 정렬 → submission →        [✅ Phase 2B + 2C-2]
 │        상세영역(detail) DataList 바인딩
 ▼
Phase 1 룰 ID prefix UI-01 + 버튼 modifier                    [✅ Phase 0+1]
 │        (id-renamer + button-modifier)
 ▼
Stage 4   scwin 조회/저장 핸들러 (onclick/submitdone)         [✅ Phase 2C-1·2C-3]
 │        + #2 await/async 자동수정 (fixAsyncAwait)            [✅ Phase 3A]
 ▼
검증      9개 안티패턴 정적 검사 (onStage/CLI 리포트, 비파괴)  [✅ Phase 3A]
 │        + 변환 보존 리포트 (입력→출력 라벨 보존율)          [✅ Phase 4]
 ▼
(예정)    더 많은 자동수정(3B) → LLM 피드백(3C)               [⏳ 미구현]
 ▼
최종 WebSquare XML
```

`--no-llm`(또는 llmClient 미제공) 시 LLM 단계(Stage 3)는 건너뛰고 결정론 경로만 작동 = Phase 0+1 동작. Stage 2.5(구조)는 항상 실행.

### Quick Start

**사전 요구사항**: Node.js 20+, pnpm 9+ (corepack로 호출)

```bash
# 설치 (첫 설치 시 Puppeteer가 Chrome을 받느라 5~10분)
corepack pnpm install

# 빌드
corepack pnpm --filter @kdh/figma-ingest build

# 변환 실행 (CLI)
node packages/figma-ingest/dist/cli.js \
  packages/figma-ingest/tests/fixtures/simple-form.html \
  output.xml

# 테스트 (전체 277 PASS, 1 live-llm skip)
corepack pnpm --filter @kdh/figma-ingest test

# 골든 재생성 (변환 로직 의도적 변경 후에만 — 반드시 git diff로 확인)
corepack pnpm --filter @kdh/figma-ingest build
corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate
```

### 프로젝트 구조

```
.
├── packages/
│   ├── legacy-converter/                # KB 단말 절대→상대 변환 도구 (Stage 2 엔진)
│   │   ├── adapter.js                   # jsdom 기반 IIFE 로더
│   │   ├── js/                          # sample-converter.js 등 9개 모듈
│   │   ├── samples/reference-pairs/     # 42개 검증 페어
│   │   └── tests/regression.smoke.js    # 32/32 PASS
│   │
│   └── figma-ingest/                    # TS 신규 파이프라인
│       ├── src/
│       │   ├── types.ts                 # ComponentSpec, DataCollectionIR 등 핵심 타입
│       │   ├── dom-extractor.ts         # Stage 0: Puppeteer DOM 추출
│       │   ├── absolute-xml-builder.ts  # Stage 1: ABSOLUTE-coord XML
│       │   ├── relative-converter.ts    # Stage 2: legacy SampleConverter 래퍼
│       │   ├── id-renamer.ts            # Phase 1: legacy prefix → UI-01 prefix
│       │   ├── button-modifier.ts       # Phase 1: 라벨 → btn_cm modifier
│       │   ├── pipeline.ts              # 전체 오케스트레이터
│       │   ├── cli.ts                   # CLI 엔트리
│       │   └── stage3/                  # LLM 의미 추론 + 바인딩 + 핸들러
│       │       ├── data-collection-inferrer.ts # Stage 3: LLM DataCollection 추론 (2A)
│       │       ├── llm-client.ts / llm-mock.ts # Anthropic SDK / 테스트 mock
│       │       ├── xml-region-parser.ts        # schbox/gvwbox region 추출(cheerio)
│       │       ├── xml-injector.ts             # DataCollection XML 주입
│       │       ├── schbox-normalizer.ts        # Stage 2.5: schbox 정규화 (2C-0)
│       │       ├── data-binder.ts              # Stage 3.5 오케스트레이터 (2B)
│       │       ├── ref-binder.ts               # schbox 입력 → dma_search ref (2B)
│       │       ├── grid-reconciler.ts          # grid → dataList 정렬 (2B)
│       │       ├── submission-generator.ts     # sbm_search 생성 (2B)
│       │       ├── detail-binder.ts            # 상세영역 → DataList ref (2C-2)
│       │       └── scwin-scaffolder.ts         # Stage 4: scwin 조회 핸들러 (2C-1)
│       └── tests/
│           ├── fixtures/                # 3개 입력 HTML (+ llm-responses/ mock IR)
│           ├── golden/                  # 3개 expected XML (회귀 baseline)
│           └── **/*.test.ts             # unit + e2e + golden 회귀
│
├── docs/superpowers/
│   ├── specs/                           # 단계별 설계서
│   └── plans/                           # 단계별 구현 계획
├── pnpm-workspace.yaml
└── package.json
```

### 파이프라인 단계 ↔ 소스 모듈
| 단계 | 모듈 |
|---|---|
| Stage 0 DOM 추출 | `src/dom-extractor.ts` |
| Stage 1 ABSOLUTE XML | `src/absolute-xml-builder.ts` |
| Stage 2 RELATIVE 변환 | `src/relative-converter.ts` (legacy 흡수) |
| Stage 2.5 schbox 정규화 (2C-0) | `src/stage3/schbox-normalizer.ts` |
| Stage 3 LLM DataCollection 추론 (2A) | `src/stage3/data-collection-inferrer.ts`, `xml-injector.ts` |
| Stage 3.5 바인딩 (2B + 2C-2) | `src/stage3/data-binder.ts` (`ref-binder`, `grid-reconciler`, `submission-generator`, `detail-binder`) |
| Phase 1 룰 | `src/id-renamer.ts`, `src/button-modifier.ts` |
| Stage 4 scwin 핸들러 (2C-1·2C-3) | `src/stage3/scwin-scaffolder.ts` |
| 안티패턴 검증·자동수정 (3A) | `src/validate/anti-pattern-validator.ts`, `anti-pattern-fixer.ts` |
| 변환 보존 리포트 (4) | `src/validate/preservation-report.ts` (+ `dom-extractor.captureInputScreenshot`) |
| 오케스트레이터 | `src/pipeline.ts` |

### 핵심 함수
```typescript
import { convertHtmlToWebSquare } from '@kdh/figma-ingest/pipeline';
const xml = await convertHtmlToWebSquare(htmlString, {
  llmClient,        // 있으면 LLM 의미 추론(2A~) 작동, 없으면 결정론 경로만
  noLlm: false,     // true면 LLM 단계 건너뜀 (Phase 0+1 동작)
  onStage: (name, payload) => {},  // 디버그 콜백
});
```

### 흡수된 기존 자산 (legacy-converter)
이 프로젝트는 별도 모듈로 import한 **KB국민은행 단말 변환 도구**를 Stage 2 엔진으로 재사용한다: `sample-converter.js`(섹션 분류 패턴 엔진, 42개 reference-pair 학습) + 골든 회귀(32/32). 원본: `C:/Users/user/.claude/kdh_proj/websquare-publishing-editor/`.

### 골든 회귀 주의
변환 로직이 **의도적으로** 변경된 경우에만 골든을 재생성하고, **반드시 `git diff`로 변경사항을 확인**한다. 무심코 regenerate하면 진짜 회귀를 놓친다.

</details>

---

## 📚 관련 문서 (설계·계획서)

설계서는 `docs/superpowers/specs/`, 단계별 작업 계획은 `docs/superpowers/plans/` 폴더에 있어요.
- 전체 설계: `2026-05-13-html-to-websquare-design.md`
- 2A: LLM 데이터 추론 / 2B: 바인딩+제출 / 2C-0: schbox 정규화 / 2C-1: 조회 동작 / 2C-2: 상세영역 연결 / 2C-3: 저장 흐름+검증 / 3A: 안티패턴 검증+해결 / 4: 변환 보존 리포트

> **메모**: 새로운 단계(플랜)를 끝낼 때마다 이 README도 함께 쉽게 업데이트합니다.
