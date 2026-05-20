# 그림을 웹 화면으로 바꿔주는 자동 번역 공장 🏭

> **한 줄 설명:** 디자인 그림(Figma)으로 만든 웹페이지를, 회사 프로그램(WebSquare)이 알아들을 수 있는 특별한 형태로 **자동으로 바꿔주는 도구**입니다.

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

> **지금 상태**: 자동 검사(테스트) **213개 모두 통과**, 실수 0개. 예시 화면 3개(간단폼·검색표·마스터디테일)로 매번 확인하고 있어요.

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
| **골든(golden) 파일** | "정답지". 도구 출력이 정답지와 똑같은지 매번 비교해서 실수를 잡아요 |

---

## 🗺️ 앞으로 할 일 (로드맵)

| 순서 | 할 일 | 상태 |
|---|---|---|
| 2C-3 | "저장" 버튼 동작 + 입력 검사(필수값 확인) | ⏳ 다음 |
| 3 | 금지 규칙 15가지 자동 검사 | ⏳ 예정 |
| 4 | 원래 그림과 결과 화면이 똑같이 보이는지 비교 | ⏳ 예정 |

---

<details>
<summary>👩‍💻 <b>개발자용 안내</b> (클릭해서 펼치기 — 명령어·구조)</summary>

### 사전 요구사항
- Node.js 20+, pnpm 9+ (corepack로 호출)

### 설치 / 빌드
```bash
corepack pnpm install
corepack pnpm --filter @kdh/figma-ingest build
```
(첫 설치 시 Puppeteer가 Chrome을 받느라 5~10분 걸립니다)

### 변환 실행 (CLI)
```bash
node packages/figma-ingest/dist/cli.js \
  packages/figma-ingest/tests/fixtures/simple-form.html \
  output.xml
```

### 테스트
```bash
corepack pnpm --filter @kdh/figma-ingest test            # 전체 (199 PASS)
corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate  # 골든 재생성(로직 변경 후만)
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
| Stage 4 scwin 핸들러 (2C-1) | `src/stage3/scwin-scaffolder.ts` |
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

</details>

---

## 📚 관련 문서 (설계·계획서)

설계서는 `docs/superpowers/specs/`, 단계별 작업 계획은 `docs/superpowers/plans/` 폴더에 있어요.
- 전체 설계: `2026-05-13-html-to-websquare-design.md`
- 2A: LLM 데이터 추론 / 2B: 바인딩+제출 / 2C-0: schbox 정규화 / 2C-1: 조회 동작 / 2C-2: 상세영역 연결

> **메모**: 새로운 단계(플랜)를 끝낼 때마다 이 README도 함께 쉽게 업데이트합니다.
