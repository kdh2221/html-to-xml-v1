# Phase 3A: 정적 안티패턴 검증기 + CRITICAL 해결 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-22 |
| 상태 | Draft v1.1 (CRITICAL 해결방안 반영) |
| 선행 | Phase 0+1, 2A~2C-3 (파이프라인이 최종 XML 산출) |
| 접근 | 결정론. ① 9개 룰 정적 검출(위반마다 대안 remediation 동반, 비파괴 리포트) ② #2 await→async 자동수정(안전) ③ #9 grid-reconciler를 sourceBodyId/chk-aware 매칭으로 근본개선. #8/#10은 검출 가드(생성단계서 이미 구조적 예방) |

## 결정 요약 (CRITICAL 4종 해결 범위)

| 룰 | 안티패턴 | 대안(올바른 형태) | 우리 현황 | 해결 |
|---|---|---|---|---|
| #2 async/await | `function(){await…}` | `async function(){await…}` | 깨끗(생성기가 올바름) | **검출 + 자동수정**(await 있는데 async 없으면 삽입) |
| #8 ID 중복 | 조회·상세 동일 `ibx_empNm` | 접미사 `…Detail` | 깨끗(접미사 적용 중) | **검출 가드**(생성 명명규칙으로 예방, post-hoc rename 비권장) |
| #9 grid header/body | header 3 vs gBody 5 | 컬럼 1:1·id 동일 | 깨끗(3=3)이나 위치정렬 취약 | **검출 + 근본개선**(grid-reconciler sourceBodyId/chk-aware) |
| #10 submission ref | 미선언 dma 참조 | ref/target 전부 선언 | 깨끗 | **검출 가드**(submission-generator IR 기반이라 예방) |

> 모든 위반(critical·warning)은 `remediation`(올바른 대안)을 동반해 리포트한다.

## 0. 관련 자산
- deepsquare: `websquare/codeRule/CodeRules.md` §[WRM-규칙-ANTI] 15개 금지 패턴 표
- 메모리: `reference-websquare-deepsquare`(ANTI-PATTERN 표가 LLM 실수 방지 게이트), `project-phase1-implementation`
- 부모 spec: `2026-05-13-html-to-websquare-design.md` (로드맵 Phase 3 = 안티패턴 검증)

## 1. 배경과 문제

파이프라인은 2C-3까지 완성된 워크플로우 XML을 산출한다. 그러나 출력이 deepsquare 안티패턴(컴포넌트 ID 중복, grid header/body 컬럼 불일치, 미선언 submission 참조 등)을 위반하지 않는다는 **자동 보증이 없다**. 특히 grid-reconciler의 위치 정렬은 취약하다고 알려져 있다(2B carryover) — #9 위반이 잠재.

Phase 3A는 최종 XML을 정적 검사해 위반을 **리포트**한다. XML을 수정하지 않으며(3B 자동수정·3C LLM 피드백은 후속), CRITICAL 위반은 경고로 알리되 변환은 계속한다(비파괴).

## 2. 범위 — Phase 3 분해

Phase 3(원래 "15개 룰 + 자동수정 + LLM 피드백")은 한 spec에 과대 → 분해:
- **3A (이 spec)**: 9개 룰 정적 검증 리포트(대안 동반) + **CRITICAL 안전 해결**(#2 await→async 자동수정, #9 grid-reconciler 근본개선). #8/#10은 검출 가드.
- 3B (후속): 나머지 fixable 위반의 post-hoc 자동수정(#8/#10 등 — 위험 검토 후).
- 3C (후속): LLM 피드백 루프.

### 적용 룰 (9개) vs 제외

| 룰 | 심각도 | 검출 |
|---|---|---|
| #8 컴포넌트 ID 중복 | critical | 컴포넌트 id 2회+ (데이터 컬럼 id 제외) |
| #9 grid header/body 컬럼 1:1 | critical | header/gBody 컬럼 수·id 불일치 |
| #10 submission ref/target 선언 | critical | ref/target이 dataCollection 미선언 |
| #2 async/await 불일치 | critical | async 없이 await (SyntaxError 패턴) |
| #1 금지 API | warning | `$p.getComponentById`/`document.*`/`addEventListener` |
| #3 confirm/alert 직접 | warning | `$c.win.` 없는 bare `confirm(`/`alert(` |
| #4 ev: 이벤트 환각 | warning | 허용목록 외 `ev:` 이벤트 |
| #11 grid header inputType | warning | header column inputType이 text/checkbox 외 |
| #15 취소 reform | warning | script에 `.reform(` (취소엔 undoGridView) |

**제외 (우리 미생성/판정불가)**: #6 팝업, #7 탭, #14 show/hide(미생성); #13 컬럼 무단추가(검증시점 원본명세 없음); #5(#10과 중복), #12 allOption(marginal).

## 3. 모듈

`src/validate/anti-pattern-validator.ts`
```typescript
export interface Violation {
  rule: string;        // 예: 'ANTI-08'
  severity: 'critical' | 'warning';
  message: string;     // 사람이 읽는 설명 (위반 대상 포함)
  remediation: string; // 올바른 대안 (예: "조회/상세 동일 필드는 접미사로 구분: ibx_empNmDetail")
  location?: string;   // 위반 식별자 (예: 중복 id, grid id) — 선택
}

export function validateAntiPatterns(xml: string): Violation[];
```
- 순수·결정론. XML 불변(읽기만), **throw 금지**(잘못된 입력도 위반목록/빈배열 반환).
- 내부: 룰별 checker 함수 `(xml) => Violation[]`를 호출해 합산. 탐지는 cheerio(구조 룰) + 정규식(script 룰) 혼용.
- checker 목록(전부 같은 모듈 내 export — 단위 테스트용):
  `checkDuplicateIds`(#8), `checkGridColumns`(#9), `checkSubmissionRefs`(#10), `checkAsyncAwait`(#2), `checkForbiddenApi`(#1), `checkDirectDialog`(#3), `checkEventNames`(#4), `checkHeaderInputType`(#11), `checkCancelReform`(#15).

추가 모듈/변경(§5-3 해결):
- `src/validate/anti-pattern-fixer.ts` — `fixAsyncAwait(xml): string` (#2 자동수정, 순수).
- `src/stage3/grid-reconciler.ts` — `rewriteColumnIds`를 sourceBodyId 기반 매칭으로 개선(#9), sourceBodyId 부재 시 위치순 fallback.

## 4. 룰별 검출 로직

### #8 checkDuplicateIds (critical)
- cheerio로 `[id]` 요소 순회. **`w2:column`·`w2:key` 태그는 제외**(데이터 컬럼/키 네임스페이스 — id가 columnInfo/header/gBody에 의도적 반복).
- 나머지 컴포넌트 요소의 `id` 값을 카운트. 2회+ 값마다 `ANTI-08` critical 위반(`location` = 중복 id).

### #9 checkGridColumns (critical)
- 각 `w2:gridView`: `w2:header > w2:row > w2:column` id 목록 H, `w2:gBody > w2:row > w2:column` id 목록 B 추출.
- `H.length !== B.length` 또는 `H`와 `B`의 id 집합 불일치 → `ANTI-09` critical(`location` = grid id).

### #10 checkSubmissionRefs (critical)
- 선언 집합 D = `w2:dataMap`·`w2:dataList`의 `id` 모음.
- 각 `xf:submission`의 `ref`/`target` 속성에서 `data:json,X` 또는 `data:X`의 X(첫 토큰, `.` 앞부분) 추출.
- X ∉ D → `ANTI-10` critical(`location` = `submissionId→X`).

### #2 checkAsyncAwait (critical)
- script CDATA에서 `scwin.\w+ = (async\s+)?function` 핸들러 블록 추출(중괄호 매칭 또는 `};` 경계).
- 블록에 `await `가 있는데 `async`가 없으면 → `ANTI-02` critical(`location` = 핸들러명).

### #1 checkForbiddenApi (warning)
- script에 `\$p\.getComponentById|document\.(getElementById|querySelector)|addEventListener\(` → `ANTI-01` warning.

### #3 checkDirectDialog (warning)
- script에서 `\b(confirm|alert)\s*\(` 중 직전이 `$c.win.`가 아닌 것 → `ANTI-03` warning.

### #4 checkEventNames (warning)
- `ev:([a-zA-Z]+)=` 수집. 허용목록 = {onclick, onpageload, submitdone, oncellclick, oncelldblclick, onrowindexchange, ontabindexchange, onviewchange}. 외 → `ANTI-04` warning(`location` = 이벤트명).

### #11 checkHeaderInputType (warning)
- 각 `w2:gridView`의 `w2:header` 내 `w2:column`의 `inputType`이 `text`/`checkbox` 외 → `ANTI-11` warning.

### #15 checkCancelReform (warning)
- script에 `\.reform\s*\(` → `ANTI-15` warning(취소엔 undoGridView 권장).

## 5. 통합

### 5-1. 파이프라인 (관찰만)
`convertHtmlToWebSquare` 마지막, 반환 직전:
```typescript
options.onStage?.('validation', validateAntiPatterns(result));
```
반환 타입(string) 불변. validation 실패해도 변환 결과는 그대로 반환(비파괴).

### 5-2. CLI (리포트)
변환·파일 출력 후:
```typescript
const violations = validateAntiPatterns(xml);
if (violations.length) {
  // stderr에 리포트: [CRITICAL] ANTI-09 grid grd_007 ... 형태. critical 개수 강조.
}
process.exit(0);  // 비파괴 — 위반 있어도 정상 종료
```

## 5-3. 해결(Resolution) — #2 자동수정 + #9 근본개선

검출(§4)에 더해, 두 CRITICAL은 실제로 "해결"한다. #8/#10은 생성단계에서 이미 구조적 예방되므로 검출 가드로만 둔다(post-hoc 패치 비권장 — 의도 추측·ref 깨짐 위험).

### #2 자동수정 — `fixAsyncAwait(xml): string`
- 신규 `src/validate/anti-pattern-fixer.ts`. script CDATA의 `scwin.\w+ = function() {…}` 핸들러 중 본문에 `await `가 있고 `async`가 없으면 `function`→`async function` 치환(결정론·무위험).
- 파이프라인 마지막(scwin-scaffolder 이후, validation 이전)에 적용: `result = fixAsyncAwait(result);`.
- 우리 scwin-scaffolder는 이미 저장 핸들러를 `async`로 생성 → 현 출력엔 fire 안 함(belt-and-suspenders). 손으로 깨진 입력/향후 생성기 변화 대비.

### #9 근본개선 — grid-reconciler를 sourceBodyId/chk-aware 매칭으로
현재 `rewriteColumnIds`는 grid 컬럼을 **위치순**(`dl.columns[i]`)으로 DataList id에 덮어쓴다. 선행 `chk`/rowNum 컬럼이 있으면 한 칸씩 밀려 오바인딩(2B carryover).

개선: **id 기반 매칭**
- IR의 각 `DataListColumn.sourceBodyId`(원본 grid body 컬럼 id, 예: `col_1`)를 사용.
- gBody 컬럼: 각 `<w2:column>`의 현재 id가 어떤 DataList 컬럼의 sourceBodyId와 일치하면 → 그 DataList 컬럼 id로 교체. **일치하는 sourceBodyId 없으면(예: chk) 원본 id 보존**(덮어쓰지 않음).
- header 컬럼: gBody가 결정한 (원본id→DataList id) 매핑을 동일 적용 → header/gBody id 1:1 보장(#9 충족).
- sourceBodyId가 IR에 전혀 없으면(레거시 IR) 기존 위치순 fallback 유지(하위호환).
- **출력 중립성**: 현 3 fixture는 chk 없고 col_1..col_3가 순서대로라 id기반=위치순 → 골든 불변. chk-leading 케이스에서만 동작 차이(개선).

## 6. 테스트 전략

### 6-1. 단위 (checker별, XML 직접 입력)
- 각 checker: 깨끗한 입력 → `[]` / 주입 위반 → 정확히 1건 탐지
  - #8: 컴포넌트 dup id 탐지 + **데이터 컬럼 반복(EMP_CD)은 위반 아님** (오탐 방지)
  - #9: header 3 vs gBody 2 → 위반 / 일치 → 없음
  - #10: 미선언 ref → 위반 / 선언된 ref → 없음
  - #2: `function(){await x}` → 위반 / `async function(){await x}` → 없음
  - #1·#3·#4·#11·#15: 각 주입 패턴 탐지 + 정상 패턴 무위반

### 6-2. 핵심 통합 (골든 파일 읽어 순수 validator 실행 — Puppeteer 불필요)
- 3개 골든(simple-form·search-grid·master-detail) → **critical 위반 0**.
- 만약 critical 발견 시 STOP & report (테스트를 깨서 통과시키지 않음 — 진짜 파이프라인 버그 신호).

### 6-3. 해결 검증
- `fixAsyncAwait`(#2): `function(){await}` → `async function(){await}` 자동수정 / 이미 async면 불변 / await 없으면 불변.
- grid-reconciler(#9): **chk-leading 합성 grid 단위테스트** — `[chk, col_1, col_2]` 입력 시 chk 보존 + col_1→첫 데이터 컬럼, col_2→둘째(밀림 없음). 기존 chk-free 케이스(col_1..col_3) 회귀 = 동일 출력. sourceBodyId 없는 IR이면 위치순 fallback.

### 6-4. 파이프라인/CLI
- `onStage('validation', violations)` 발생(배열 수신) — Mock LLM e2e 1건.
- `fixAsyncAwait` 파이프라인 적용 후에도 3 골든 불변(현 출력 이미 정합).
- (CLI 리포트는 수동/스냅샷 부담 → 단위로 충분. CLI는 validateAntiPatterns 호출+출력만 추가.)

## 7. 성공 기준
1. 모든 unit + 골든 검증 PASS
2. 3개 골든 critical 위반 0 (파이프라인 출력 정합성 증명), 각 위반에 remediation 동반
3. 각 룰이 주입된 위반 정확 탐지
4. **#2 자동수정**: 깨진 await/async 입력을 고침, 정상 입력 불변, 3 골든 불변
5. **#9 근본개선**: chk-leading grid에서 id 기반 정확 매칭(밀림 없음), chk-free 골든 회귀 0, sourceBodyId 없으면 위치순 fallback
6. 파이프라인 onStage('validation') 발생, CLI 리포트 출력 + exit 0
7. `validateAntiPatterns`/`fixAsyncAwait` 순수(non-throw), `--no-llm` 0 위반

## 8. 리스크/미해결
| 리스크 | 완화 |
|---|---|
| #8 데이터 컬럼 id 오탐 | w2:column/w2:key 제외로 컴포넌트 네임스페이스만 검사 |
| script 룰의 정규식이 문자열 리터럴 내 가짜 매칭 | 우리 출력 script는 결정론적·단순(scwin 핸들러). 현 범위 충분. 복잡 JS는 3C에서 AST |
| #9 grid-reconciler 개선이 기존 골든을 바꿀 위험 | chk-free·col_1..col_3 순서 fixture는 id기반=위치순 → 골든 불변(테스트로 보장). chk 케이스는 신규 단위테스트로 검증 |
| #9 header 원본 id가 body와 다를 수 있음 | gBody가 결정한 (원본id→DataList id) 매핑을 header에 동일 적용. 매핑 못 찾는 header 컬럼은 위치 fallback |
| ev: 허용목록이 불완전 | 현 출력 이벤트(onclick/onpageload/submitdone) 포함 + WRM 흔한 이벤트. 누락 시 false-positive warning(비파괴)이라 안전. 목록 확장 용이 |
| #2 자동수정이 현 출력엔 fire 안 함 | belt-and-suspenders. 단위테스트(주입 입력)로 동작 보장, 골든 불변으로 무해 확인 |

미해결 (후속):
1. **#8/#10 post-hoc 자동수정** — 의도 추측·ref 동기화 위험으로 3A는 검출 가드만. 필요 시 3B에서 신중히.
2. **LLM 피드백 루프** — 3C.
3. **#13(컬럼 무단추가)** — 검증시점 원본 명세 채널 필요(향후).
4. CLI 리포트 포맷 정밀화(색상/요약) — 최소 stderr 출력으로 시작.

## 9. 부록 — Violation 예시

```typescript
// grid header 3 vs gBody 2 인 경우
{ rule: 'ANTI-09', severity: 'critical',
  message: 'GridView grd_007: header 컬럼 3개 vs gBody 2개 불일치',
  location: 'grd_007' }

// 미선언 submission ref
{ rule: 'ANTI-10', severity: 'critical',
  message: 'submission sbm_search의 ref "dma_search"가 dataCollection에 미선언',
  location: 'sbm_search→dma_search' }
```

깨끗한 출력(현 3 골든)은 `validateAntiPatterns(xml).filter(v => v.severity==='critical')` 가 빈 배열이어야 한다.

---

*문서 끝.*
