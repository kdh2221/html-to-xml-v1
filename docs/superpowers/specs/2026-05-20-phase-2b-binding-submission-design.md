# Phase 2B: ref 바인딩 + Submission 추론 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-20 |
| 상태 | Draft v1.0 |
| 선행 spec | `2026-05-19-phase-2a-llm-datacollection-design.md` |
| 선행 구현 | Phase 0+1 (74 tests), Phase 2A (Stage 3, 123 tests) |
| 접근 | C. 하이브리드 — LLM 힌트 최소 + 결정론 적용 |

## 0. 관련 자산

- 부모 spec: [`2026-05-13-html-to-websquare-design.md`](2026-05-13-html-to-websquare-design.md) (전체 5단계)
- Phase 2A spec: [`2026-05-19-phase-2a-llm-datacollection-design.md`](2026-05-19-phase-2a-llm-datacollection-design.md)
- 메모리: `project-phase1-implementation` (Phase 2A 완료 + 2B blocker 기록)
- deepsquare: `<WRM>/deepsquare/codeRule/CodeRules.md` (DL-04 submission ref/target, DL-07 zero-script binding, DL-08 가상 URL)

---

## 1. 배경과 문제 정의

### 1-1. 현재 상태 (Phase 2A 끝)

`<w2:dataCollection>`은 LLM이 추론한 DataMap/DataList로 채워진다. 그러나:
- schbox input/select에 `ref="data:..."` 바인딩이 없음 → 입력값이 DataMap에 안 담김
- gridView에 `dataList="data:..."` 속성 없음 + body 컬럼 id가 `col_1`/`col_2` (DataList 컬럼 `EMP_CD`와 불일치) → 그리드가 데이터에 안 묶임
- `<xf:submission>` 없음 → 조회/저장 서버 통신 불가

즉 데이터 *그릇*은 있지만 화면 컴포넌트와 *연결*되지 않았다.

### 1-2. Phase 2A 최종 리뷰가 명시한 blocker

> 그리드 body 컬럼 ID(`col_1` — Stage 1 자동생성, 소문자)와 DataList 컬럼 ID(`EMP_CD` UPPER_SNAKE)가 불일치. `ref="data:dlt_list"` 바인딩하려면 둘을 reconcile 필요.

또한 골든 분석에서 폼 라벨 불일치 케이스 확인:
- `<xf:input id="ibx_empCd" label="사번"/>` ↔ key `EMP_CD` name="사번" → 라벨 정확 일치 ✓
- `<xf:select1 id="sbx_deptCd" label="부서"/>` ↔ key `DEPT_CD` name="부서 코드" → 라벨 **불일치** ✗

→ 순수 라벨 매칭만으론 불안정. LLM 힌트 필요.

### 1-3. 목표

Phase 2A 출력 위에 **데이터 바인딩 레이어**를 추가:
- schbox input → `ref="data:dma_search.{KEY}"`
- gridView → `dataList="data:dlt_list"` + 컬럼 id 정렬
- `<xf:submission id="sbm_search">` 선언

성공 기준은 §8.

---

## 2. 파이프라인 — Stage 3.5 삽입

Phase 2A 파이프라인:
```
Stage 2 → Stage 3 (DataCollection 주입) → Phase 1 rules
```

Plan 2B 후:
```
Stage 2 → Stage 3 → ★ Stage 3.5 (바인딩) ★ → Phase 1 rules
          ↑                ↑
          inferDataCollection (IR with binding hints)
          injectDataCollection (dataCollection 채움)
                           bindDataCollection (ref + grid + submission)
```

`pipeline.ts`에서:
```typescript
const ir = await inferDataCollection(relativeXml, options.llmClient);
let enrichedXml = injectDataCollection(relativeXml, ir);
enrichedXml = bindDataCollection(enrichedXml, ir);   // NEW Stage 3.5
```

**같은 `ir`가 inject와 bind 양쪽에 흐른다** (IR이 binding 힌트를 담음). `--no-llm` 또는 llmClient 없으면 Stage 3 + 3.5 모두 skip → Phase 0+1 동작.

---

## 3. 모듈 분해

```
packages/figma-ingest/src/stage3/
├── (Phase 2A 기존 9개 모듈)
├── ref-binder.ts            schbox input → ref="data:dma_search.{KEY}" 부착
├── grid-reconciler.ts       gridView dataList= 추가 + header/body 컬럼 id 정렬
├── submission-generator.ts  <xf:submission> 생성 + <xf:model> 주입
└── data-binder.ts           Stage 3.5 orchestrator: bindDataCollection(xml, ir)
```

수정 파일:
- `src/types.ts` — IR에 binding 힌트 필드 추가
- `src/stage3/ir-schema.ts` — Zod에 optional 필드
- `src/stage3/prompt-builder.ts` — LLM에 binding 힌트 요청 + tool schema 확장
- `src/stage3/xml-region-parser.ts` — schbox를 `fields:[{label,componentId}]`로 추출
- `src/pipeline.ts` — Stage 3.5 wiring
- `tests/fixtures/llm-responses/*.json` — binding 힌트 추가
- `tests/golden/*.expected.xml` — 재생성

### 3-1. 모듈 인터페이스

| 모듈 | export | 의존 |
|---|---|---|
| `ref-binder.ts` | `bindRefs(xml: string, ir: DataCollectionIR): string` | (정규식/문자열) |
| `grid-reconciler.ts` | `reconcileGrids(xml: string, ir: DataCollectionIR): string` | (정규식/cheerio) |
| `submission-generator.ts` | `generateSubmissions(xml: string, ir: DataCollectionIR): string` | (문자열) |
| `data-binder.ts` | `bindDataCollection(xml: string, ir: DataCollectionIR): string` | 위 3개 모듈 |

`bindDataCollection`은 세 binder를 순차 적용: `generateSubmissions(reconcileGrids(bindRefs(xml, ir), ir), ir)`.

---

## 4. IR 확장

`src/types.ts`:

```typescript
export interface DataMapKeyIR {
  id: string;
  name: string;
  dataType: 'text' | 'number' | 'date';
  boundComponentId?: string;  // NEW — 이 key가 바인딩될 컴포넌트 id (예: "ibx_empCd")
}

export interface DataListColumnIR {
  id: string;
  name: string;
  dataType: 'text' | 'number' | 'date';
  sourceBodyId?: string;      // NEW — 원본 grid body 컬럼 id (예: "col_1")
}
```

Zod (`ir-schema.ts`): 두 필드 모두 `.optional()`. boundComponentId는 자유 문자열(`z.string().optional()`), sourceBodyId도 동일.

Tool schema (`prompt-builder.ts`): key properties에 `boundComponentId: { type: 'string' }`, column properties에 `sourceBodyId: { type: 'string' }` 추가 (required 아님).

### 4-1. xml-region-parser 확장

현재 schbox region: `{ kind: 'schbox', labels: string[], ... }`
변경: `{ kind: 'schbox', fields: Array<{ label: string; componentId: string }>, ... }`

추출 로직: schbox 내부에서 `xf:input` / `xf:select1` / `xf:select` / `w2:*` 입력 컴포넌트의 `id`와, 그 컴포넌트의 `label` 속성(또는 인접 `w2:textbox` label)을 페어링.

> 골든 확인 결과 input/select1이 `label="사번"` 속성을 직접 가지므로 페어링이 단순함. label 속성이 없으면 인접 `w2:textbox`의 label로 fallback.

gvwbox region은 2A에서 이미 `columns: [{label, bodyId}]` 형태 → 변경 없음.

prompt-builder 유저 프롬프트에 컴포넌트 id를 노출:
```
## 검색조건 영역 (schbox)
- 사번 (component: ibx_empCd)
- 부서 (component: sbx_deptCd)
## 그리드 영역 (gvwbox)
컬럼: 사번 (body id: col_1), 성명 (body id: col_2), 부서명 (body id: col_3)
```
시스템 프롬프트에 지침 추가: "각 DataMap key에는 바인딩될 컴포넌트 id를 `boundComponentId`로, 각 DataList 컬럼에는 원본 grid body id를 `sourceBodyId`로 함께 반환하라."

---

## 5. 매칭 로직 (결정론 binder + fallback)

### 5-1. ref-binder

각 DataMap(보통 `dma_search`)의 각 key에 대해:
1. `key.boundComponentId`가 있으면 → 그 id를 가진 컴포넌트(`xf:input`/`xf:select1`/`xf:select`)에 `ref="data:{dataMapId}.{key.id}"` 속성 추가
2. 없으면 → schbox 컴포넌트 중 `label` 속성 == `key.name` 인 것 찾아 ref 추가
3. 없으면 → 위치 fallback: schbox i번째 입력 컴포넌트 ↔ DataMap i번째 key
4. 다 실패 → skip, 리포트에 미바인딩 경고

ref 추가 방식: 대상 컴포넌트 태그에 이미 `ref=`가 없으면 `id="..."` 뒤에 `ref="..."` 삽입. 있으면 덮어쓰지 않음(이미 바인딩된 것 존중).

### 5-2. grid-reconciler

각 gridView에 대해:
1. `<w2:gridView ...>` 여는 태그에 `dataList="data:{dlt_id}"` 속성 추가 (이미 있으면 skip). 어느 DataList에 묶을지: IR에 dataList가 하나면 그것. 여러 개면 컬럼 매칭이 가장 많은 것.
2. 컬럼 id 정렬:
   - 각 DataList 컬럼의 `sourceBodyId`가 있으면 → 그 id를 가진 body 컬럼을 찾아 id를 `column.id`로 재작성, **같은 위치(index)의 header 컬럼 id도** 동일하게 재작성
   - `sourceBodyId` 없으면 → 위치 fallback: body[i].id ← columns[i].id, header[i].id ← columns[i].id
3. body/header 컬럼 수가 DataList 컬럼 수와 다르면 → 가능한 만큼만 정렬 + 리포트 경고 (안티패턴 #9 위험 표시)

> WebSquare 규약: gridView body 컬럼 id가 dataList 컬럼 id와 일치해야 데이터 바인딩됨. header 컬럼 id도 동일 데이터 컬럼 id 사용 (CodeRules #8/#9).

### 5-3. submission-generator

IR에 DataMap이 하나 이상 있으면:
- 첫 DataMap을 ref, 첫 DataList를 target으로 submission 생성:
```xml
<!-- TODO: [서버 확인] action URL("/TODO_VERIFY") 확인 필요 -->
<xf:submission id="sbm_search" ref="data:json,dma_search" target="data:json,dlt_list"
               action="/TODO_VERIFY" method="post" mediatype="application/json"
               ev:submitdone="scwin.sbm_search_submitdone"/>
```
- `</w2:dataCollection>` 바로 뒤, `</xf:model>` 앞에 주입
- DataList가 없으면 target 생략
- DataMap이 없으면(마스터-디테일 등) submission 생략

> `ev:submitdone`이 참조하는 `scwin.sbm_search_submitdone`은 Plan 2C에서 생성. 2B는 선언만 — 컴파일은 되나 핸들러 미존재 (런타임 경고 가능, §9 참조).

---

## 6. 데이터 플로우

```
              Stage 3 출력 (dataCollection 채워진 XML) + IR(binding 힌트 포함)
                              │
                              ▼
              ┌──────────────────────────────┐
              │  data-binder (Stage 3.5)      │
              │   1. bindRefs(xml, ir)        │  schbox input에 ref=
              │   2. reconcileGrids(xml, ir)  │  gridView dataList= + 컬럼 id 정렬
              │   3. generateSubmissions(xml,ir) │ <xf:submission> 주입
              └──────────────┬───────────────┘
                             │
                             ▼
              바인딩 완료 XML → Phase 1 rules (renameIdToUi01, button-modifier)
```

---

## 7. 테스팅 전략

### 7-1. 단위 (mock 불필요 — IR을 직접 입력)
- `ref-binder`: boundComponentId 경로 / label 매칭 fallback / 위치 fallback / 미바인딩 skip / 이미 ref 있으면 보존
- `grid-reconciler`: dataList= 추가 / sourceBodyId 컬럼 정렬 / 위치 fallback / header+body 동시 정렬 / 컬럼 수 불일치 경고
- `submission-generator`: DataMap 있을 때 생성 / DataList 없을 때 target 생략 / DataMap 없을 때 skip / 주입 위치
- `data-binder`: 3개 binder 순차 적용 통합

### 7-2. E2E (Mock LLM, binding 힌트 포함 fixture)
- simple-form: input에 `ref="data:dma_search.EMP_CD"`, gridView에 `dataList="data:dlt_list"`, body 컬럼 id가 EMP_CD/EMP_NM/DEPT_NM, `<xf:submission id="sbm_search">` 존재
- search-grid: date/number 타입 + 바인딩
- master-detail: DataList만 → grid 바인딩 O, submission 생략

### 7-3. 골든 회귀
mock fixture에 binding 힌트 추가 후 골든 재생성 + 검토 + 채택.

### 7-4. `--no-llm` 회귀
llmClient 없으면 Stage 3.5도 skip → DataCollection·ref·submission 모두 없음 = Phase 0+1 동작.

---

## 8. 성공 기준

1. 모든 unit + e2e PASS (mock LLM, 기존 123 + 신규 ~30)
2. 3개 fixture 출력 검증:
   - schbox input/select에 `ref="data:dma_search.{KEY}"` (정확한 key 매칭)
   - gridView에 `dataList="data:{dlt_id}"`
   - grid body **및** header 컬럼 id가 DataList 컬럼 id와 일치 (col_1 → EMP_CD)
   - DataMap 있는 화면에 `<xf:submission id="sbm_search">` 존재 (ref/target/action)
3. `--no-llm` 시 Phase 0+1 동작 유지 (Stage 3.5 skip)
4. 골든 재생성 + 회귀 통과 (deterministic)
5. 부서/부서코드 불일치 케이스: boundComponentId 힌트로 정확히 바인딩됨 (sbx_deptCd → DEPT_CD)

---

## 9. 리스크와 미해결 질문

| 리스크 | 영향 | 완화 |
|---|---|---|
| ev:submitdone이 미존재 scwin 핸들러 참조 | 런타임 경고 가능 | 2B는 선언만. 핸들러 stub은 2C. 컴파일은 통과 |
| boundComponentId 힌트 부정확 (LLM 환각) | 잘못된 컴포넌트에 ref | 컴포넌트 id 존재 여부 검증 후 부착, 없으면 label/위치 fallback |
| grid 컬럼 수 ≠ DataList 컬럼 수 | 부분 정렬 | 가능한 만큼 정렬 + 경고. 안티패턴 #9는 Phase 2A에서 이미 header/body 일치 보장 |
| ref 정규식이 namespace-prefixed 속성 오매칭 | 잘못된 치환 | id 기준 컴포넌트 타겟팅, 속성 삽입은 해당 태그 범위 내로 한정 |
| 다중 dma_/dlt_ (외환송금급) | submission 1개만 생성 | 2B는 첫 DataMap→첫 DataList submission. 다중 submission은 향후 |

미해결:
1. **마스터-디테일 상세영역 ref 바인딩** — fieldset 상세 input을 같은 dlt_ ref로 묶으면 DL-07 zero-script 바인딩 작동. 그러나 상세영역(fieldset) 감지가 필요 → **2B 스코프 외, Plan 2C로 미룸.** 2B는 schbox/gvwbox만.
2. **action URL** — 2B는 `/TODO_VERIFY` placeholder + 주석. 실제 URL은 userspec/사람 입력 (별도)
3. **저장 submission (sbm_save)** — 2B는 조회(sbm_search)만. 저장은 향후

---

## 10. 부록 — 기대 출력 변화 (simple-form)

**Phase 2A 출력**:
```xml
<xf:input ctype="Edit" id="ibx_empCd" label="사번" .../>
<w2:gridView ctype="IBSheet" id="grd_007" ...>
  <w2:header><w2:row>
    <w2:column id="column1" value="사번" .../>
  </w2:row></w2:header>
  <w2:gBody><w2:row>
    <w2:column id="col_1" .../>
  </w2:row></w2:gBody>
</w2:gridView>
<!-- submission 없음 -->
```

**Plan 2B 통과 후**:
```xml
<xf:input ctype="Edit" id="ibx_empCd" label="사번" ref="data:dma_search.EMP_CD" .../>
<xf:select1 ctype="SelectBox" id="sbx_deptCd" label="부서" ref="data:dma_search.DEPT_CD" .../>
<w2:gridView ctype="IBSheet" id="grd_007" dataList="data:dlt_list" ...>
  <w2:header><w2:row>
    <w2:column id="EMP_CD" value="사번" .../>
  </w2:row></w2:header>
  <w2:gBody><w2:row>
    <w2:column id="EMP_CD" .../>
  </w2:row></w2:gBody>
</w2:gridView>
<!-- <xf:model> 안에: -->
<!-- TODO: [서버 확인] action URL 확인 필요 -->
<xf:submission id="sbm_search" ref="data:json,dma_search" target="data:json,dlt_list"
               action="/TODO_VERIFY" method="post" mediatype="application/json"
               ev:submitdone="scwin.sbm_search_submitdone"/>
```

ref 바인딩 + 그리드 dataList 연결 + 컬럼 id 정렬 + submission 선언이 핵심 변화. scwin 핸들러와 의미 ID 재명명은 Plan 2C.

---

*문서 끝.*
