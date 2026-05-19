# Figma HTML → WebSquare XML 변환 파이프라인 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-13 |
| 상태 | Draft v1.0 |
| 작성 컨텍스트 | 인스웨이브 UX 팀 (claude_ux_03@inswave.com) |

## 0. 관련 자산

- **인스웨이브 WRM 레퍼런스 프로젝트**: `C:/WebSquare_Studio/ai_x64/websquare_26.0417/workspace/WRM/`
- **기존 변환 도구 (재사용 대상)**: `C:/Users/user/.claude/kdh_proj/websquare-publishing-editor/`
- **deepsquare LLM DSL 레이어**: `<WRM>/deepsquare/`
- **선행 분석 결과**: 메모리(`MEMORY.md`)의 `project-webtop-prototype`, `project-inswave-ai-si`, `project-websquare-architecture`, `reference-websquare-deepsquare`

---

## 1. 배경과 문제 정의

### 1-1. 현재 상황

Figma 디자인을 AI(예: figma-to-react 류, Claude/GPT 기반 추출기)에 통과시키면 **HTML/CSS 파일**을 비교적 쉽게 얻을 수 있다. 이는 디자인 단계에서 개발 단계로 넘어가는 첫 결과물이다.

### 1-2. 당면한 문제

WebSquare 생태계는 단순 HTML을 받지 않는다. 다음 요구를 모두 충족하는 **`.xml` 파일**이 필요하다:

- XHTML + XForms(`xf:`) + WebSquare(`w2:`) + XML Events(`ev:`) 4-네임스페이스 마크업
- `<xf:model>` 내부의 `<w2:dataCollection>`에 DataMap/DataList 선언
- `<xf:submission>`으로 서버 통신 선언
- 컴포넌트는 `ref="data:dma_search.KEY"` 식 SSOT 바인딩
- ID는 deepsquare UI-01의 prefix 규칙(`dlt_`, `dma_`, `sbm_`, `ibx_`, `sbx_`, `btn_`, `grd_` 등)을 따라야 함
- `deepsquare/codeRule/CodeRules.md`의 15개 CRITICAL 안티패턴 0 위반

플레인 HTML과 WebSquare XML 사이의 *임피던스 차이*는 의미적이라 정규식 치환으로 해결되지 않는다.

### 1-3. 목표

**Figma → AI → HTML** 결과물을 입력으로 받아, **WRM 생태계에 그대로 컴파일되고 안티패턴 0 위반인 WebSquare XML**을 출력하는 사내 운영 파이프라인을 구축한다.

성공 기준은 §10에 정의한다.

### 1-4. 기존 변환 도구 진단

`C:/Users/user/.claude/kdh_proj/websquare-publishing-editor/`에 이미 변환 도구가 존재한다. 정체는 다음과 같다:

**원래 용도**: KB국민은행 단말 차세대 화면 변환. `KB .scn (WebTop/iWorks)` → `Inswave Craft : 절대좌표 WebSquare XML` → `본 도구 : 상대좌표 WebSquare XML`.

**구조**:

| 파일 | 줄수 | 역할 |
|---|---|---|
| `js/sample-converter.js` | 2,304 | 핵심 패턴 엔진. 절대좌표 → 상대좌표. 42개 reference-pair에서 학습된 섹션 분류 |
| `js/xml-parser.js` | 516 | 공통 XML 파싱 + Row/cell 분석 + 섹션 분류 |
| `js/rel-wireframe-gen.js` | 1,022 | 변환 결과 와이어프레임 시각화 |
| `js/abs-to-rel-converter.js` | 585 | 레거시(룰 기반) 변환기 — `skill/convert-xml.md` 규칙을 JS에 하드코딩 |
| `js/abs-wireframe-gen.js` | 346 | 원본 좌표 와이어프레임 |
| `js/wireframe-gen.js` | 395 | 레거시 와이어프레임 |
| `js/html-converter.js` | 288 | **HTML → 컴포넌트 추출** (iframe 렌더 + 좌표) |
| `js/script-validator.js` | 281 | 스크립트의 ID/ref/속성 보존 검증 |
| `js/xml-generator.js` | 178 | **컴포넌트 → ABSOLUTE-coord WebSquare XML 생성** |
| `tools/capture-server.js` | (별도) | Puppeteer 기반 시각 회귀 (포트 5678) |

**보유 자산 요점**:

- HTML 변환 경로(`html-converter.js` + `xml-generator.js`)는 *보조 입력*이고 핵심은 절대→상대 엔진
- `samples/reference-pairs/` 42개 입력 XML + 10개 페어 출력(`*_pub.xml`) — 검증된 학습 데이터
- 배치 비교 기능: 변환 전/후 XML을 실 WebSquare 서버에 Puppeteer로 띄워 스크린샷 + 컴포넌트 카운트 + Jaccard 텍스트 보존율 비교
- 클래스 매핑은 KB 전용이지만 `TAG_RENAME_MAP` 훅으로 재타기팅 가능

**결정적 갭** (§3에서 우리가 채울 부분):

1. 출력 XML의 `<w2:dataCollection>`은 비어있음 — DataMap/DataList 생성 안 함
2. 컴포넌트에 `ref="data:..."` 바인딩 부재 — SSOT 미작동
3. `<xf:submission>` 생성 안 함 — 조회/저장 동작 불가
4. ID는 `txt_001` 같은 카운터 기반 — 의미 없음, deepsquare UI-01 prefix와 불일치
5. deepsquare 15개 CRITICAL 안티패턴 미검사
6. `MSG_CM_*` 메시지 코드 자동 매칭 없음

**결론**: 이 도구는 *레이아웃 분류*를 거의 완벽히 해결하지만 *살아있는 화면이 되기 위한 데이터/바인딩/이벤트*는 전부 비어 있다. 우리는 이 빈 공간을 채운다.

---

## 2. 설계 결정 — 하이브리드(LLM + 룰)

### 2-1. 검토한 3가지 접근

| 접근 | 요약 | 결정 |
|---|---|---|
| A. 단일-쇼트 LLM | HTML 통째 → LLM이 XML 직접 생성 | 기각. 컨텍스트 커질수록 환각·누락 급증, 안티패턴 검증 부재 |
| B. **하이브리드 (IR + LLM + 룰)** | LLM은 의미 추론만, 코드 생성은 결정론 | **채택** |
| C. userspec 우회 | HTML → 화면설계서.md → 기존 deepsquare 파이프라인 | 기각. HTML 디테일이 마크다운에서 손실, HTML→userspec 자체가 어려움 |

### 2-2. 선택 근거

세 가지 이유에서 B를 선택:

1. **WebSquare의 핵심은 데이터바인딩(DataCollection-SSOT)이고, HTML에는 그게 없다.** LLM이 *추론*해야 하는 것은 데이터 의미 정확히 그 한 가지. 좁은 schema로 강제하면 환각 면적이 작아진다.
2. **deepsquare 안티패턴 표는 결정론적으로 체크 가능하다.** ID 유일성, header/body 컬럼 수 일치, `with(scopeObj)` 스코프 충돌, async/await 짝 — 전부 정적 검증 + 자동 수정 가능. LLM에 의존하지 않는다.
3. **IR이 자체로 자산이 된다.** 디자인시스템 변경 시 IR 그대로 다시 컴파일만 하면 됨.

---

## 3. 전체 파이프라인 (Stage 0 ~ 5)

```
HTML
 │
 ▼
Stage 0  HTML Normalizer + 좌표 추출       [기존 흡수: html-converter.js]
 │      iframe 렌더 + getBoundingClientRect
 │      + Figma class 휴리스틱 추가
 │      → 컴포넌트 리스트 (with 실좌표)
 ▼
Stage 1  ABSOLUTE-coord WebSquare XML      [기존 흡수: xml-generator.js]
 │      좌표 기반 self-contained XML
 │      (의미 추론 없음, scaffolding만)
 ▼
Stage 2  RELATIVE-coord 섹션 분류 변환     [기존 흡수: sample-converter.js]
 │      schbox / gvwbox / titbox / btnbox / tblbox 자동 판별
 │      Row 클러스터링 + overlap + 좌우분할 + standalone 병합
 ▼
Stage 3  Semantic Enricher                  [★ 신규]
 │      LLM 청크 단위 호출
 │      · DataMap/DataList/Submission 추론
 │      · ID 의미명 재명명 + UI-01 prefix 강제
 │      · ref="data:..." 바인딩 부여
 │      · scwin 핸들러 skeleton 생성
 │      · MSG_CM_* 자동 매칭
 ▼
Stage 4  deepsquare 안티패턴 검증 + 자동수정 [★ 신규]
 │      15개 CRITICAL 룰 + UI-01 + UI-04-1
 │      실패 → 진단을 Stage 3에 피드백 (최대 3회 재시도)
 ▼
Stage 5  시각 회귀                          [기존 흡수: capture-server.js + 확장]
 │      입력 HTML vs 최종 XML Puppeteer 렌더
 │      카테고리별 보존율 + 텍스트 Jaccard
 ▼
WebSquare XML + 리포트
```

### 3-1. Stage 0: HTML Normalizer

**입력**: 원본 HTML 문자열
**출력**: 컴포넌트 리스트 `[{id, ctype, label, left, top, width, height, ...}]` + 메타 `{screenId, screenName, width, height}`

기존 [html-converter.js](C:/Users/user/.claude/kdh_proj/websquare-publishing-editor/websquare-publishing-editor/js/html-converter.js)의 iframe 렌더링 트릭을 그대로 사용. hidden iframe에 HTML을 그려서 실제 `getBoundingClientRect`로 좌표를 얻는다. flex/grid든 absolute든 동일하게 작동.

**확장 (신규)**:
- ELEMENT_MAP 보강: `role="combobox"`, `role="searchbox"`, `aria-label` 등 ARIA 시그널을 ctype 분류 힌트로 사용
- HTML 품질 점수 산출: 시맨틱 태그 비율, ID/label 페어 비율, ARIA 사용률을 0~1로 정량화 → §5-1의 LLM 호출 깊이 조정에 활용
- Figma export 노이즈 제거: `data-figma-*`, 자동생성 클래스명 정리

### 3-2. Stage 1: ABSOLUTE-coord WebSquare XML

**입력**: Stage 0의 컴포넌트 리스트
**출력**: `position:absolute; left:Xpx; top:Ypx` 기반 XML (자체로는 운영용 아님, Stage 2의 입력 포맷)

기존 [xml-generator.js](C:/Users/user/.claude/kdh_proj/websquare-publishing-editor/websquare-publishing-editor/js/xml-generator.js)를 거의 그대로 사용. 출력 형태는 sample-converter가 학습한 KB Craft 출력과 동일해야 한다.

### 3-3. Stage 2: RELATIVE-coord 섹션 분류

**입력**: Stage 1의 ABSOLUTE-coord XML
**출력**: WRM 표준 RELATIVE-coord XML (`schbox` / `gvwbox` / `titbox` / `btnbox` / `tblbox` / `tbcbox` / `pnlbox` 구조)

기존 [sample-converter.js](C:/Users/user/.claude/kdh_proj/websquare-publishing-editor/websquare-publishing-editor/js/sample-converter.js)를 통째로 사용. 다음 휴리스틱이 이미 검증됨:

- 첫 GroupBox + 폼 요소 + 그리드 없음 + 버튼 텍스트 정확히 `조회`/`검색`/`초기화` → schbox
- standalone 버튼 + 다음에 content 섹션 → `titbox .rt`로 흡수
- Text Row + Form Row 연속 → thead/tbody (리스트형 테이블)
- 폼 옆 30px 내 `%`,`~`,`-`,`/` → 같은 td (단위 텍스트)
- 부모 `display:none` → 전체 자식 hidden 전파 → `.hidden_field`로 출력

### 3-4. Stage 3: Semantic Enricher (★ 신규)

**입력**: Stage 2의 RELATIVE XML (레이아웃은 정리되었으나 데이터 바인딩 비어있음)
**출력**: SSOT 바인딩이 부착된 WebSquare XML

LLM이 청크 단위로 다음을 수행한다:

1. **DataMap 추론** — schbox의 입력 컴포넌트들을 묶어서 `dma_search` 키 목록 생성. 라벨/placeholder를 보고 KEY 이름 추론(`사번` → `EMP_CD`, `부서` → `DEPT_CD`)
2. **DataList 추론** — GridView의 헤더 + body 컬럼 + 정적 데이터 발견 시 → `dlt_list` 컬럼 정의. `IS_*` 라벨이면 dataType=text + `trueValue="Y"`/`falseValue="N"` 자동 부여
3. **Submission 추론** — schbox + 조회 버튼 발견 시 `sbm_search` 생성. action은 `// TODO: [서버 확인] action URL ("/api/...") 확인 필요` 주석과 함께 placeholder
4. **ID 의미명 재명명** — `txt_001` → `tbx_titleMain`, `edt_002` → `ibx_empCd`, `btn_003` → `btn_search`. UI-01 prefix 강제 + 카운터 제거
5. **ref 바인딩 부여** — 모든 input/select1/checkbox에 `ref="data:dma_search.KEY"` 또는 `ref="data:dlt_list.COLUMN"` 부여. 마스터-디테일 패턴 감지 시 *같은 DataList* ref (DL-07 zero-script binding)
6. **scwin 핸들러 skeleton** — `scwin.onpageload`에 `$c.win.setEnterKeyEvent`/`$c.util.setGridViewDelCheckBox`/`$c.data.setChangeCheckedDc` 자동 삽입(EV-01). 조회 버튼에 `scwin.btn_search_onclick` async skeleton
7. **MSG_CM_* 매칭** — confirm/alert 필요 시 GCC_Reference.md의 메시지 코드 표에서 후보 선택 + 주석으로 alternatives 제시

**LLM 호출 전략**:

- 페이지 전체를 한 번에 보내지 않는다. *region 단위*(schbox 하나, gvwbox 하나)로 쪼개서 별도 호출
- `deepsquare/` 문서(`CodeRules.md`, `Component_Catalog.md`, `GCC_Reference.md`)는 system prompt에 **프롬프트 캐싱**으로 1회만 토큰 결제
- 가장 유사한 reference-pair 1~2개를 few-shot으로 동봉 (유사도 = 컴포넌트 카운트 벡터 + 섹션 구성)
- 각 출력 노드에 `confidence: 0~1` 어노테이션. 임계값 미만은 RED FLAG로 검수 UI에 노출

### 3-5. Stage 4: 안티패턴 검증 + 자동 수정 (★ 신규)

**입력**: Stage 3 출력 XML
**출력**: 검증 통과한 XML + 진단 리포트

[CodeRules.md L36~](C:/WebSquare_Studio/ai_x64/websquare_26.0417/workspace/WRM/deepsquare/websquare/codeRule/CodeRules.md)의 15개 CRITICAL 안티패턴을 정적 룰로 구현. 자동 수정 가능한 것과 LLM 피드백이 필요한 것을 분리(§5-2 참조).

**실행 흐름**:
1. 정적 룰 전체 실행 → 위반 목록 산출
2. 자동 수정 가능한 위반은 그 자리에서 수정 → 재실행
3. 남은 위반은 *구체적 진단(라인·노드·원인)*을 만들어 Stage 3에 피드백
4. Stage 3 재시도 (최대 3회). 그래도 실패 시 XML은 출력하되 리포트에 RED FLAG

### 3-6. Stage 5: 시각 회귀 (Puppeteer)

**입력**: 원본 HTML + 최종 XML
**출력**: 보존율 리포트

기존 [capture-server.js](C:/Users/user/.claude/kdh_proj/websquare-publishing-editor/websquare-publishing-editor/tools/capture-server.js)를 확장. 원래는 절대XML vs 상대XML만 비교하지만, 우리는 *원본 HTML* 도 같은 viewport로 캡처해서 동일 metric 산출.

**metric**:
- 카테고리별 보존율 = `min(orig, conv) / max(orig, conv)`. 카테고리는 input/button/link/image/table/tableRow/tableCell/wsqGrid/wsqTab/wsqPanel
- 텍스트 보존율 = 가시 텍스트 토큰의 Jaccard 유사도
- 전체 점수 = 카테고리별 평균(둘 중 하나라도 0이 아닌 카테고리만)
- 픽셀 SSIM은 *참고용*. base.css/product.css가 외형을 결정하므로 신뢰도 낮음

---

## 4. 흡수할 기존 자산 (7개)

| 자산 | 출처 | 우리 파이프라인에서의 자리 |
|---|---|---|
| iframe 렌더링 좌표 추출 | `html-converter.js` | Stage 0 |
| 컴포넌트 → ABSOLUTE XML 생성 | `xml-generator.js` | Stage 1 |
| 섹션 분류 패턴 엔진 (2,304줄) | `sample-converter.js` | Stage 2 |
| 42개 reference-pair (검증 데이터) | `samples/reference-pairs/` | Stage 3 few-shot + Stage 5 회귀 |
| TAG_RENAME_MAP 재타기팅 훅 | `sample-converter.js` 상단 | 사이트별(WRM/KB/기타) 태그 매핑 |
| 시각 회귀 인프라 | `tools/capture-server.js` | Stage 5 |
| 스크립트 ID/ref/속성 보존 검증 | `script-validator.js` | Stage 4 룰 엔진 베이스 |

---

## 5. 신규 구현 모듈 상세

### 5-1. Stage 3 Semantic Enricher

**모듈 구성**:

```
enricher/
├── chunker.ts          # XML을 region 단위로 분할 (schbox/gvwbox/tblbox 경계)
├── llm-client.ts       # Anthropic SDK + 프롬프트 캐싱 + 재시도
├── few-shot-picker.ts  # reference-pair 유사도 매칭
├── data-inferrer.ts    # DataMap/DataList/Submission 추론
├── id-renamer.ts       # txt_001 → ibx_empCd, UI-01 prefix
├── ref-binder.ts       # ref="data:..." 부여, 마스터-디테일 감지
├── handler-scaffolder.ts # scwin onpageload + 핸들러 skeleton
└── msg-matcher.ts      # MSG_CM_* 코드 매칭
```

**입력 분기 (HTML 품질 점수 기반)**:
- 점수 ≥ 0.7 (시맨틱 풍부): LLM 호출 1패스, 결정론적 매핑 우선
- 점수 0.4~0.7: LLM 호출 2패스 (1차 추론 + 검증)
- 점수 < 0.4 (시맨틱 빈약): LLM 호출 3패스 + RED FLAG 비율 상향

**비용 추정**: deepsquare 문서 캐싱 후, region 1개당 입력 1~3K 토큰. 작은 화면(region 5개) ≈ $0.05~0.10, 외환송금급 복잡 화면(region 15+) ≈ $0.30~0.50.

### 5-2. Stage 4 Validator 룰 카탈로그

| # | 룰 | 검사 방법 | 자동 수정 |
|---|---|---|---|
| 1 | `$p.getComponentById`/`document.getElementById` 금지 | 정규식 | 가능: `$c.util.getComponent`로 치환 |
| 2 | await는 async 함수 안 [CRITICAL] | JS AST + 함수별 await 검사 | 가능: 함수 선언에 `async` 자동 추가 |
| 3 | `confirm/alert` 직접 호출 금지 | AST 호출 표현식 검사 | 부분: `await $c.win.confirm/alert`로 치환, 메시지는 RED FLAG |
| 4 | 이벤트명 화이트리스트 | 고정 set 대조 | 가능: 가장 가까운 정식 이벤트명 추천 |
| 5 | `setJSON({list:...})` 래핑 금지 | AST 인자 형태 검사 | 가능: 배열 형태로 자동 변환 |
| 8 | **ID 유일성** [CRITICAL] | XML 전체 id 속성 set 비교 | 부분: 후행 ID에 suffix `_2`, 충돌 다발 시 RED FLAG |
| 9 | **GridView header/body 컬럼 수 일치** [CRITICAL] | XML 카운트 비교 | 가능: 부족 측에 누락 컬럼 자동 추가 |
| 10 | **submission ref/target → DataCollection 선언** [CRITICAL] | 참조 그래프 검증 | 부분: DataMap/DataList 자동 선언 시도, 추론 불가 시 RED FLAG |
| 11 | header inputType ∈ {text, checkbox} | 속성 화이트리스트 | 가능: text로 강제 |
| 12 | "전체" 라벨 + `allOption="true"` | 라벨 휴리스틱 + 속성 존재 | 가능: 속성 자동 추가 |
| 13 | GridView 컬럼은 명세에 있는 것만 | IR vs XML 컬럼 set | 불가: RED FLAG (사람 확인 필요) |
| 14 | show/hide 컴포넌트 ref 충돌 | ref 동일 + visible 조건 검사 | 불가: RED FLAG |
| 15 | `reform()` 취소 처리 사용 금지 | AST 호출 위치 + 컨텍스트 | 부분: `$c.data.undoGridView(grdObj)`로 치환 |
| UI-01 | ID prefix 규칙 | 정규식 | 가능: prefix 자동 부여 |
| UI-04-1 | trigger class에 modifier 강제 | class 속성 파싱 | 가능: 라벨 매칭으로 sch/row_add/download/pt 자동 부여 |
| EV-01 | onpageload 필수 호출 | 함수 본문 검사 | 가능: 누락 호출 자동 삽입 |

---

## 6. 보완점 우선순위 표

> 우선순위 표기: **P0** = 첫 릴리즈 필수, **P1** = 두 번째 릴리즈, **P2** = 운영화 이후

| # | 보완 항목 | 단계 | 우선순위 |
|---|---|---|---|
| 1 | ID 네이밍 시스템 불일치 (기존 `txt_/edt_` ↔ deepsquare `ibx_/sbx_`) | Stage 3 첫 패스 | P0 (필수) |
| 2 | Figma 출력 HTML에 맞춘 ELEMENT_MAP 확장 (ARIA·role·class 휴리스틱) | Stage 0 | P0 (필수) |
| 3 | KB class 매핑 → 인스웨이브 WRM 매핑 재타기팅 (`btn_cm sch/pt/row_add/download`) | Stage 3 | P0 (필수) |
| 4 | Reference-pair를 LLM few-shot으로 활용 | Stage 3 | P1 |
| 5 | 시각 회귀에 *입력 HTML*도 포함 (현재는 변환 전/후 XML만 비교) | Stage 5 | P1 |
| 6 | 안티패턴 자동 수정 단계 (정적 룰 + 자동 수정 + 재검증 루프) | Stage 4 | P1 |
| 7 | HTML 품질 점수 기반 LLM 호출 깊이 분기 | Stage 0 → Stage 3 | P2 |

---

## 7. Phase 계획

| Phase | 기간 | 산출물 | 게이트 |
|---|---|---|---|
| **0 (편입)** | 0.5~1주 | 기존 도구를 모노레포에 import + 빌드 검증 + 42개 reference-pair 회귀 통과 확인 | 기존 도구가 그대로 빌드/실행되고 회귀 통과 |
| **1** | 1~2주 | ID 리네임 패스(UI-01) + Figma용 ELEMENT_MAP 확장 + 버튼 modifier 자동 부여 (P0 #1, #2, #3) | Figma sample HTML 3개 → 컴파일 가능한 XML 생성 (의미 ID는 미적용) |
| **2** | 3~4주 | Stage 3 Semantic Enricher MVP — DataMap/DataList/Submission 추론 + `ref` 바인딩 | 외환송금 정정 프로토타입 수준의 화면에서 최소 SSOT 형성 |
| **3** | 5주 | Stage 4 안티패턴 15개 정적 룰 + 자동 수정 + LLM 피드백 루프 (P1 #6) | 안티패턴 0 위반 자동 보장 |
| **4** | 6~7주 | capture-server.js를 HTML→XML 회귀로 확장 + 골든 페어 라이브러리화 (P1 #5) | 사내 다른 팀이 시범 사용 가능 |
| **5** | 8주~ | userspec export + 검수 UI (IR diff viewer) + HTML 품질 점수 분기 (P2 #7) | 디자이너/기획자도 결과 검수 가능 |

각 Phase 끝에는 *외부 사용자에게 보여줄 데모*가 있어야 한다. 내부 모듈만 잔뜩 만들고 데모 없는 Phase 금지.

---

## 8. 기술 스택

| 영역 | 선택 |
|---|---|
| 언어 | TypeScript + Node.js |
| HTML 파싱 | `parse5` (Stage 0 fallback. iframe 렌더는 브라우저/Puppeteer) |
| XML 파싱/생성 | `fast-xml-parser` + `xmlbuilder2` |
| JS AST (Stage 4 룰) | `@babel/parser` |
| LLM | Anthropic SDK + 프롬프트 캐싱 |
| 스키마 검증 | `zod` |
| 테스트 | Vitest + 골든 파일 비교 |
| 시각 회귀 | 기존 `capture-server.js` (Puppeteer + Express) 확장 |
| 모노레포 | pnpm workspaces (기존 도구는 zero-npm-deps이므로 그대로 패키지화 가능) |

**파이썬 미선택 이유**: WebSquare 생태계는 HTML/XML/JS이고, 기존 도구도 JS로 짜여 있음. 언어 통일이 유지보수에 유리.

---

## 9. 리스크와 미해결 질문

| 리스크 | 영향 | 완화 방안 |
|---|---|---|
| sample-converter.js의 좌표 임계값(50px gap, 30px unit text)이 KB .scn 분포에 튜닝됨 | Figma 출력은 분포가 다를 수 있어 섹션 분류 오동작 가능 | Phase 0에서 Figma HTML 5개로 회귀 → 임계값 별도 프로파일로 분리 |
| 기존 도구 출력 XML이 KB식 attribute(`class="content_body"`, `screentitle=""`)를 박음 | WRM 표준과 미세 차이 | Stage 2 후 attribute 정리 패스 추가, 차이표 문서화 |
| 두 ID 네이밍 시스템 공존 기간 | sample-converter.js 내부가 기존 prefix로 분기할 수 있음 | grep으로 영향 코드 식별 → Phase 1에서 TAG_RENAME_MAP과 유사한 ID_RENAME_MAP 도입 |
| LLM 비용 운영 시 누적 | 화면 1만 장 변환 시 $300~$5000 | 캐싱 + 결정론 우선 + 품질점수 분기로 호출 깊이 최소화 |
| Figma → HTML 추출기마다 출력 일관성 차이 | Stage 0 휴리스틱 불안정 | 지원 추출기 1~2개 명시 (예: "Figma to React" 류, "Anima" 류). 그 외는 best-effort |
| 안티패턴 #13(GridView 컬럼 무단 추가) 자동 수정 불가 | 사람 검수 부담 | 검수 UI에서 RED FLAG로 명확히 노출 |
| 이벤트 핸들러 본문 자동 이식 위험 | HTML의 JS 핸들러 본문을 그대로 scwin에 박으면 깨질 위험 큼 | skeleton만 생성, 본문은 TODO 마커 |

**미해결 질문**:
1. *입력 Figma HTML 추출기 표준*을 어디까지 좁힐 것인가? (현재 미정)
2. *userspec 마크다운*을 IR의 한 view로 export할 것인가, 아니면 별도 입력 채널로 둘 것인가? (Phase 5 이슈)
3. *반응형(adaptive) 옵션*을 기본 on/off 어느 쪽으로 둘 것인가? 기존 도구는 사용자 선택, 우리도 그대로 둘 수 있지만 디폴트 정책 필요

---

## 10. 성공 기준

각 Phase별 정량 게이트:

| Phase | 정량 기준 |
|---|---|
| 0 | 42개 reference-pair 회귀 100% 통과 (변환 결과가 기존 `*_pub.xml`/`*_rel_v*.xml`과 텍스트 diff 0) |
| 1 | Figma sample HTML 5개 입력 → wpack 컴파일 100% 성공 |
| 2 | 외환송금 프로토타입 변환 시 DataMap 1개 이상, DataList 1개 이상, Submission 1개 이상 자동 생성 |
| 3 | 안티패턴 #2/#3/#5/#8/#9/#10/#11/#12/#13/#14/#15/#UI-01/#UI-04-1/#EV-01 위반 = 0 |
| 4 | 시각 회귀 카테고리별 보존율 평균 ≥ 0.85, 텍스트 Jaccard ≥ 0.90 |
| 5 | 디자이너 1명 + 개발자 1명 검수 시간 합산 ≤ 화면당 15분 |

---

## 11. 부록

### 11-1. 입력 예시 (Figma → AI 추출 HTML 가정)

```html
<div class="search-area">
  <label for="empCd">사번</label>
  <input type="text" id="empCd" placeholder="사번 입력" />
  <label for="deptCd">부서</label>
  <select id="deptCd"><option>전체</option></select>
  <button type="button">조회</button>
</div>
<table id="empGrid">
  <thead><tr><th>사번</th><th>성명</th><th>부서</th></tr></thead>
  <tbody><tr><td></td><td></td><td></td></tr></tbody>
</table>
```

### 11-2. 기대 출력 XML (Stage 4 통과 후)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ev="http://www.w3.org/2001/xml-events"
      xmlns:w2="http://www.inswave.com/websquare"
      xmlns:xf="http://www.w3.org/2002/xforms">
  <head meta_screenId="EM001M01" meta_screenName="사원 조회">
    <w2:type>COMPONENT</w2:type>
    <xf:model>
      <w2:dataCollection baseNode="map">
        <w2:dataMap id="dma_search">
          <w2:keyInfo>
            <w2:key id="EMP_CD" name="사번" dataType="text"/>
            <w2:key id="DEPT_CD" name="부서 코드" dataType="text"/>
          </w2:keyInfo>
        </w2:dataMap>
        <w2:dataList id="dlt_list" baseNode="list" saveRemovedData="true">
          <w2:columnInfo>
            <w2:column id="EMP_CD" name="사번" dataType="text"/>
            <w2:column id="EMP_NM" name="성명" dataType="text"/>
            <w2:column id="DEPT_NM" name="부서명" dataType="text"/>
          </w2:columnInfo>
        </w2:dataList>
      </w2:dataCollection>
      <xf:submission id="sbm_search" ref="data:json,dma_search"
                     target="data:json,dlt_list"
                     action="/emp/selectList" method="post"
                     mediatype="application/json"
                     ev:submitdone="scwin.sbm_search_submitdone"/>
    </xf:model>
    <script type="text/javascript" lazy="false"><![CDATA[
scwin.onpageload = function() {
  $c.win.setEnterKeyEvent(tbl_search, scwin.btn_search_onclick);
  $c.util.setGridViewDelCheckBox([grd_list]);
  $c.data.setChangeCheckedDc([dlt_list]);
};

scwin.btn_search_onclick = async function() {
  // TODO: [서버 확인] action URL ("/emp/selectList") 확인 필요
  $c.sbm.execute(sbm_search);
};

scwin.sbm_search_submitdone = function(e) {
  // 결과 처리 로직 추가 가능
};
    ]]></script>
  </head>
  <body ev:onpageload="scwin.onpageload">
    <xf:group class="sub_contents">
      <xf:group class="schbox">
        <xf:group class="schbox_inner" id="tbl_search">
          <xf:group adaptive="layout" class="w2tb tbl" tagname="table">
            <xf:group tagname="tr">
              <xf:group class="w2tb_th" tagname="th"><w2:textbox label="사번"/></xf:group>
              <xf:group class="w2tb_td" tagname="td">
                <xf:input id="ibx_empCd" ref="data:dma_search.EMP_CD" style="width:150px;"/>
              </xf:group>
              <xf:group class="w2tb_th" tagname="th"><w2:textbox label="부서"/></xf:group>
              <xf:group class="w2tb_td" tagname="td">
                <xf:select1 id="sbx_deptCd" appearance="minimal" direction="auto"
                            ref="data:dma_search.DEPT_CD" style="width:150px;"
                            allOption="true"/>
              </xf:group>
            </xf:group>
          </xf:group>
          <xf:group class="btn_schbox">
            <xf:trigger class="btn_cm sch" id="btn_search"
                        ev:onclick="scwin.btn_search_onclick">
              <xf:label><![CDATA[조회]]></xf:label>
            </xf:trigger>
          </xf:group>
        </xf:group>
      </xf:group>
      <xf:group class="gvwbox">
        <w2:gridView id="grd_list" dataList="data:dlt_list" class="gvw"
                     autoFit="allColumn" rowStatusVisible="true">
          <w2:header id="header1">
            <w2:row>
              <w2:column id="EMP_CD" inputType="text" value="사번" width="100"/>
              <w2:column id="EMP_NM" inputType="text" value="성명" width="100"/>
              <w2:column id="DEPT_NM" inputType="text" value="부서명" width="150"/>
            </w2:row>
          </w2:header>
          <w2:gBody id="gBody1">
            <w2:row>
              <w2:column id="EMP_CD" inputType="text"/>
              <w2:column id="EMP_NM" inputType="text"/>
              <w2:column id="DEPT_NM" inputType="text"/>
            </w2:row>
          </w2:gBody>
        </w2:gridView>
      </xf:group>
    </xf:group>
  </body>
</html>
```

위 예시는 *Stage 0~4 통과 후 기대 결과*다. 11-1의 단순 HTML에서 자동으로 추론되어야 하는 것들:
- `<button>조회</button>` → `<xf:trigger class="btn_cm sch" id="btn_search">` (modifier 자동, ID 의미명, async 핸들러)
- `<select id="deptCd"><option>전체</option></select>` → `appearance="minimal"` + `allOption="true"` 자동
- `<table>` → `<w2:gridView>` + `<w2:header>`/`<w2:gBody>` 컬럼 ID 일치 (안티패턴 #9)
- DataMap `dma_search` + DataList `dlt_list` + Submission `sbm_search` 자동 생성
- `onpageload`에 EV-01 필수 호출 3종 자동 삽입

---

*문서 끝.*
