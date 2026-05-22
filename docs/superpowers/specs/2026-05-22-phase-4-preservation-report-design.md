# Phase 4: 변환 보존 리포트 (Preservation Report) 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-22 |
| 상태 | Draft v1.0 |
| 선행 | Phase 0+1, 2A~2C-3, 3A (파이프라인이 최종 XML 산출) |
| 접근 | 결정론. 입력 추출(Stage 0)의 의미 요소(필드/버튼/grid 컬럼)가 최종 XML에 보존됐는지 라벨 multiset diff로 측정 → 보존율 리포트(비파괴). 렌더링·WebSquare 엔진 불필요 |

## 0. 관련 자산
- 부모 spec: `2026-05-13-html-to-websquare-design.md` (로드맵 "Stage 5 시각 회귀 (Puppeteer 보존율)")
- 메모리: `project-phase1-implementation`
- `src/dom-extractor.ts`(입력 추출), `src/types.ts`(`ExtractionResult`/`ComponentSpec`), `packages/legacy-converter/tools/capture-server.js`(스크린샷 서비스 — 출력 렌더엔 엔진 필요)

## 1. 배경과 문제 — 왜 "픽셀 diff"가 아니라 "보존율"인가

로드맵의 "시각 회귀"는 원래 입력 화면 vs 출력 화면의 시각 일치 검증을 의도했다. 그러나 **출력은 WebSquare XML이고, 이를 픽셀로 렌더하려면 WebSquare 엔진(WRM workspace, websquare.html)이 구동되어 그 XML을 서빙해야 한다**(`capture-server.js`는 실행 중 URL을 `page.goto`로 스크린샷). 자체완결적 결정론 도구에 엔진 구동을 요구하는 건 무겁고 부서지기 쉽다.

따라서 로드맵 표현 **"보존율(preservation rate)"**에 충실하게, 렌더링 없이 **구조 보존**을 측정한다: 입력 HTML에서 추출한 의미 요소(입력 필드·버튼·grid 컬럼)가 최종 XML에 라벨 단위로 얼마나 보존됐는지. 변환 과정의 *유실*(필드 드롭, 라벨 변형, 컬럼 손실)을 잡는다 — 지금까지 단계가 *기능* 정합이었다면 이건 *완전성* 정합.

(픽셀 비교는 입력 HTML만 렌더 가능하고 출력은 불가하므로 input-vs-output 픽셀 diff는 본질적으로 불가능. 선택적으로 입력 스크린샷을 사람 검수용 아티팩트로만 저장.)

## 2. 모듈

`src/validate/preservation-report.ts`
```typescript
import type { ExtractionResult } from '../types';

export type LostFamily = 'field' | 'button' | 'gridColumn';
export interface LostItem { family: LostFamily; label: string; }
export interface PreservationReport {
  total: number;       // 전체 입력 라벨 수 (3 패밀리 합)
  preserved: number;
  rate: number;        // preserved/total (total 0이면 1)
  lost: LostItem[];    // 입력엔 있는데 출력에 없는 라벨
}

export function computePreservation(extraction: ExtractionResult, finalXml: string): PreservationReport;
```
- 순수·결정론·**non-throw**. 렌더링·엔진·네트워크 없음. 입력 측은 `extraction.components`(Stage 0 결과, 파이프라인이 이미 생성), 출력 측은 cheerio로 finalXml 파싱.

(선택) `src/dom-extractor.ts`에 `captureInputScreenshot(html: string): Promise<Buffer>` — 기존 Puppeteer 브라우저 재사용해 입력 HTML 렌더 PNG 반환. CLI `--screenshot <path>`에서만 사용. 핵심 리포트와 분리.

## 3. 패밀리 + 매칭 (라벨 multiset diff)

| 패밀리 | 입력(`extraction.components`) | 출력(XML 태그) | 라벨 소스 |
|---|---|---|---|
| **field** | ctype ∈ {Edit, SelectBox, Calendar, CheckBox, Radio, TextArea} | `xf:input`·`xf:select1`·`xf:select`·`xf:inputCalendar`·`xf:textarea` | 입력: 컴포넌트 `label` / 출력: 태그 `label=` 속성 |
| **button** | ctype = Button | `xf:trigger` | 입력: 컴포넌트 `label` / 출력: `<xf:label><![CDATA[…]]></xf:label>` 텍스트 |
| **gridColumn** | ctype = GridView의 `columns[].label` (전체 grid 평탄화) | `w2:gridView`의 `w2:header w2:column` `value=` 속성 | 컬럼 라벨 |

매칭: 각 패밀리에서 **입력 라벨 multiset과 출력 라벨 multiset의 차집합**(multiset difference)을 `lost`로 계산.
- `total` = 3 패밀리 입력 라벨 총 개수.
- `preserved` = total − lost.length.
- `rate` = total>0 ? preserved/total : 1.
- 빈 라벨(`''`)은 양측에서 제외(매칭 무의미).

**Text/Desc 제외 근거**: th 헤더·타이틀 등 장식 라벨은 필드 label로 이미 포착되며(중복), 2C-0가 그룹 구조를 크게 재편하므로 비교 시 노이즈/오탐. 의미 요소(field/button/gridColumn)만 보존율에 포함.

multiset diff: 입력 라벨을 카운트(Map<label, n>), 출력 라벨로 차감, 남은 양수 카운트만큼 lost.

## 4. 통합

### 4-1. 파이프라인 (관찰만)
`convertHtmlToWebSquare`는 Stage 0에서 `extraction`을 이미 보유. 반환 직전:
```typescript
options.onStage?.('preservation', computePreservation(extraction, result));
```
반환 타입(string) 불변. 비파괴.

### 4-2. CLI (리포트)
변환·파일 출력 후:
```typescript
const report = computePreservation(extraction, xml);  // 또는 onStage로 수집
console.log(`📐 보존율 ${(report.rate * 100).toFixed(1)}% (${report.preserved}/${report.total})`);
if (report.lost.length) {
  console.warn(`⚠️  유실 ${report.lost.length}건:`);
  for (const l of report.lost) console.warn(`  [${l.family}] ${l.label}`);
}
process.exit(0);  // 비파괴
```
> CLI가 report를 얻으려면 `convertHtmlToWebSquare`에서 extraction을 노출해야 한다. 현재 반환은 string. 깔끔하게: CLI는 `onStage`로 'stage0-extraction'과 최종 결과를 수집해 직접 `computePreservation` 호출하거나, 파이프라인이 onStage('preservation')로 emit한 report를 수집. **선택: CLI는 onStage('preservation') 콜백으로 report를 받아 출력**(파이프라인이 단일 소스로 계산).

## 5. 엣지케이스 / 안전성

| 상황 | 동작 |
|---|---|
| 컴포넌트 없음 / 빈 화면 | total 0 → rate 1, lost [] |
| `--no-llm` 출력 | 필드/버튼/grid는 XML에 존재(바인딩만 없음) → 라벨 보존 동일 |
| 같은 라벨 N개 | multiset(개수) 비교 → 정확 |
| 잘못된/부분 XML | **throw 안 함** — 파싱 가능한 만큼 비교 |
| 출력 라벨이 입력보다 많음(synthetic) | 유실만 측정 → 무관 |
| 빈 라벨 | 양측 제외 |

## 6. 테스트 전략

### 6-1. 단위 (구성된 extraction + xml 직접 입력)
- multiset diff: 유실/중복 정확 (입력 2× "성명", 출력 2× → lost 0; 출력 1× → lost 1)
- 출력 파싱: field(label 속성)·button(CDATA)·gridColumn(header value) 추출
- `computePreservation`: 전부 보존 → rate 1·lost [] / 필드 1개 누락 xml → 그 필드 lost / 빈 입력 → rate 1 / non-throw(깨진 xml)

### 6-2. 핵심 통합 (Mock LLM e2e — 입력 추출 필요, Puppeteer)
- 3개 fixture를 변환하며 `onStage`로 'stage0-extraction' + 최종 결과 캡처 → `computePreservation` → **field/button/gridColumn 유실 0 (rate 1.0)**.
- 유실 발견 시 **STOP & report** (테스트 느슨화 금지 — 진짜 보존 갭일 수 있음. 보고 후 판단).

### 6-3. 파이프라인/CLI + (선택) 스크린샷
- `onStage('preservation', report)` 발생 (e2e 1건).
- (선택) `captureInputScreenshot` smoke: 비어있지 않은 PNG Buffer 반환.

## 7. 성공 기준
1. 모든 unit + 통합 PASS
2. **3개 fixture: field/button/gridColumn 유실 0 (보존율 1.0)** — 변환이 의미 요소를 잃지 않음 증명
3. 요소 누락이 단위테스트에서 검출됨
4. `onStage('preservation')` 발생, CLI 보존율 출력 + exit 0
5. `computePreservation` 순수·non-throw / (선택) 스크린샷 PNG 생성

## 8. 리스크/미해결
| 리스크 | 완화 |
|---|---|
| 입력 라벨과 출력 라벨이 미세하게 다를 수 있음(trim/대소문자) | 양측 trim 후 비교. 발견 시 정규화 규칙 추가 |
| 통합 테스트가 실제 보존 갭을 드러낼 수 있음 | 그게 목적 — STOP & report 후 실 버그/허용손실 판단 (3A 0-critical과 동일 철학) |
| Text/Desc 제외로 일부 라벨 변형 놓침 | 의도적 — 의미 요소에 집중. 필요 시 후속에서 Text 패밀리 추가 |
| 픽셀 시각 비교 부재 | 출력 렌더는 엔진 필요로 범위 외. 입력 스크린샷은 사람 검수용으로만 |

미해결:
1. **출력 픽셀 렌더/diff** — WebSquare 엔진 통합 필요. 별도 대형 작업(향후).
2. **라벨 정규화/유사도 매칭** — 현재 exact(trim). 변형 감지(relabel)는 향후.
3. **좌표/레이아웃 보존** — 현재 라벨만. 상대 위치 보존 검증은 향후.

## 9. 부록 — PreservationReport 예시

```typescript
// 전부 보존
{ total: 6, preserved: 6, rate: 1, lost: [] }

// 조회 버튼이 출력에서 누락된 경우
{ total: 6, preserved: 5, rate: 0.833,
  lost: [{ family: 'button', label: '조회' }] }
```

깨끗한 변환(현 3 fixture)은 `computePreservation(extraction, finalXml).lost` 가 빈 배열이어야 한다.

---

*문서 끝.*
