# Phase 2C-2: master-detail 상세영역 바인딩 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-20 |
| 상태 | Draft v1.0 |
| 선행 | Phase 2A(DataCollection), 2B(ref 바인딩 + Submission), 2C-0(schbox 정규화), 2C-1(scwin 조회 핸들러) |
| 접근 | 결정론 (LLM 불필요) — Stage 3.5 바인딩 확장. 라벨→DataList 컬럼명 매칭 |

## 0. 관련 자산
- 부모 spec: `2026-05-13-html-to-websquare-design.md`, 2B spec `2026-05-20-phase-2b-binding-submission-design.md`
- 메모리: `project-phase1-implementation` (Phase 2C carryover)
- **WRM 레퍼런스 검증**: `사원정보_화면설계서.md` §4.3/§5.3 + 실제 `WebContent/ui/HM/HM002M01.xml`
  - §4.3 상세 입력폼: "GridView와 동일 DataList(dlt_memberBasic) ref 바인딩 — 행 선택 시 자동 반영"
  - §5.3 행 선택: "GridView 행 클릭 시 상세영역이 동일 DataList로 자동 바인딩되므로 **별도 로직 불필요**"
  - HM002M01.xml 실측: 상세 입력 전부 `ref="data:dlt_memberBasic.{COL}"`, 행 선택→상세 복사 핸들러 **없음**(`onrowindexchange`/`oncellclick`은 다른 용도)

## 1. 배경과 문제

2C-1 후 master-detail 화면은 조회가 동작하고 grid가 `dlt_memberBasic`에 바인딩됐다. 그러나 상세 편집테이블(5_02 테이블(2단))의 입력 `ibx_empCdDetail`/`ibx_empNmDetail`/`sbx_deptNmDetail`은 **ref 없이 떠 있다** → 행을 선택해도 상세영역에 아무것도 안 채워진다.

WebSquare 표준 master-detail 패턴은 **상세 입력을 grid와 동일한 DataList에 직접 바인딩**하는 것이다. 그러면 엔진이 grid의 현재 행과 상세영역을 자동 동기화한다 — scwin 핸들러 불필요. Phase 2C-2는 이 바인딩을 생성한다.

## 2. 파이프라인 — Stage 3.5 확장

```
Stage 2.5(schbox 정규화) → Stage 3(LLM inject) → Stage 3.5(bind) → Phase 1 → Stage 4(scwin)
                                                        ↑ 여기 확장
```

`data-binder.ts`의 `bindDataCollection(xml, ir)`이 2B 바인더들 *뒤에* detail-binder를 조립:

```typescript
xml = bindRefs(xml, ir);          // 2B: schbox 입력 → dma_search
xml = reconcileGrid(xml, ir);     // 2B: grid → dataList
xml = generateSubmission(xml, ir);// 2B
xml = bindDetailTables(xml, ir);  // ★ 2C-2 신규
```

**Stage 3.5(rename 이전) 실행 근거**: 상세 입력은 pre-rename id(`edt_empCdDetail`/`sel_deptNmDetail`/`cal_*`)를 가지고, ref/dataList는 `renameIdToUi01`이 안 건드려 보존된다(2B와 동일). DataList 컬럼은 IR에서 직접 읽는다.

`--no-llm` 시: IR 없음 → `bindDataCollection` 자체가 skip → 2C-2도 no-op (Phase 0+1 회귀 유지).

## 3. 모듈

`src/stage3/detail-binder.ts` — `bindDetailTables(xml: string, ir: DataCollectionIR): string`
- 결정론. 탐지는 읽기(cheerio/region), 편집은 문자열 치환(2B ref-binder 패턴 — ref/포맷 보존).
- IR의 `dataLists[].columns`(각 `{id, name}`)를 바인딩 대상으로 사용.

## 4. 탐지 — 어떤 테이블이 "상세"인가

상세 테이블 = **감싸는 영역에 조회 버튼이 없는 입력 테이블**(input/select1/inputCalendar 포함).

### 4-1. 판정 원칙 — class 리터럴이 아니라 "조회버튼 존재"로 구분

검색영역(schbox)과 입출력테이블(tblbox)을 가르는 본질 신호는 **조회/검색/초기화 버튼의 존재**다:
- 조회버튼 **있는** 영역 = 검색영역 → 2B가 dma_search에 바인딩 → detail-binder **제외**
- 조회버튼 **없는** 입력 테이블 = 입출력(상세) 테이블 → DataList에 바인딩 **대상**

이는 2C-0가 schbox 정규화 시 이미 적용하는 기준과 동일하다(2C-0는 `grp_search` id + 조회버튼 둘 다 있을 때만 schbox 생성). 따라서 정상 파이프라인에선 `schbox` ⟺ "조회버튼 있음"이 보장된다. 그럼에도 class가 아닌 **조회버튼 유무**로 판정하는 이유: `class="schbox"`인데 조회버튼이 없는 영역(2C-0 엣지케이스/타 입력 소스)이 생기면, class 기반 제외는 그것을 상세에서 잘못 누락시킨다. 의미 기반 판정은 그런 영역을 자연히 상세(tblbox)로 해석한다.

### 4-2. 타이밍·영역 단위 주의

- **타이밍**: 2C-2는 Stage 3.5(Phase 1 button-modifier *이전*) → 버튼에 `btn_cm sch` 클래스가 아직 없다. 따라서 조회버튼은 **라벨(조회/검색/초기화)**로 탐지한다(`btn_cm sch`는 동일 신호의 최종-XML 형태; 2C-0 `hasSearchButton`과 동일 기준).
- **영역 단위**: 2C-0가 조회버튼을 폼(`schbox_inner#tbl_search`)에서 떼어 **형제** `btn_schbox`로 옮긴다. "테이블 안에 버튼 있나"로 보면 검색 폼조차 버튼이 없어 보여 오분류된다 → 판정은 **감싸는 바깥 영역(schbox/tblbox 그룹) 기준**으로, 형제까지 포함해 조회버튼 존재를 본다.

### 4-3. 바인딩 대상 = IR의 DataList

운영 게이트는 "IR에 DataList가 존재하는가". IR에 DataList가 없으면 대상 없음 → no-op. 2C-2는 IR의 (단일) 첫 DataList를 대상으로 한다 — 다중 grid/DataList는 향후.

```
detectBoundDataList(ir): { dltId, columns } | null   // IR에 DataList 있으면 첫 번째
hasSearchButtonInRegion(regionXml): boolean          // 영역(형제 포함)에 조회/검색/초기화 라벨 trigger 존재 (2C-0 hasSearchButton 재사용)
detectDetailInputs(xml): DetailInput[]   // 조회버튼 없는 입력 테이블의 input/select1/inputCalendar
                                          // DetailInput { id, label }
```

## 5. 바인딩 로직 (라벨 → 컬럼 매칭)

각 상세 입력에 대해:
1. 입력의 `label` 추출 (예: "사번").
2. DataList 컬럼 중 `name`이 라벨과 정확히 일치하는 것 탐색 (예: name "사번" → id `EMP_CD`).
3. `ref="data:{dltId}.{colId}"` 주입 — **ref 없을 때만**(멱등).
4. 매칭 실패 → 그 입력만 바인딩 생략 (추측 금지, 깨진 ref 방지).

`xf:input`/`xf:select1`/`xf:inputCalendar` 모두 동일하게 ref 주입. (selectbox `sbx_deptNmDetail`도 ref 바인딩.)

매칭 함수:
```
matchColumn(label, columns): colId | null   // columns 중 name === label인 컬럼의 id
```

## 6. 케이스별 결과

| 화면 | 상세 테이블 | 바인딩 결과 |
|---|---|---|
| master-detail | 5_02 편집테이블 (3입력) | `ibx_empCdDetail`→`data:dlt_memberBasic.EMP_CD`, `ibx_empNmDetail`→`.EMP_NM`, `sbx_deptNmDetail`→`.DEPT_NM` |
| simple-form | 없음 | no-op (상세 ref 없음) |
| search-grid | 없음 | no-op |
| noLlm (master-detail) | — | no-op (IR 없음) |

## 7. 엣지케이스 / no-op

| 상황 | 동작 |
|---|---|
| IR에 DataList 없음 | no-op (원본 그대로) |
| 상세 테이블 없음 | no-op |
| IR DataList 부재 (= 바인딩 대상 없음) | no-op |
| 상세 입력 라벨이 어느 컬럼명과도 불일치 | 그 입력만 바인딩 생략 |
| 입력에 이미 ref 있음 | 보존 (멱등) |
| 검색영역 입력 (조회버튼 보유 영역) | 제외 (조회버튼 없는 입력 테이블만 상세로 바인딩) |

## 8. 테스트 전략

### 8-1. 단위 (XML 직접 입력, mock 불필요)
- `hasSearchButtonInRegion`: 영역(형제 btn_schbox 포함)에 조회 라벨 trigger 있으면 true
- `detectDetailInputs`: 조회버튼 **없는** 입력 테이블의 input/select/calendar 추출
  - 검색영역(schbox + btn_schbox/조회) 제외 (조회버튼 형제 존재)
  - **조회버튼 없는 schbox는 상세로 포함** (의미 기반 판정 검증 — 핵심 케이스)
- `matchColumn`: 라벨→컬럼명 매칭 (일치/불일치)
- `bindDetailTables`: ref 주입 (input + select1 + calendar), 검색폼 입력 제외, 라벨 불일치 생략, 멱등(기존 ref 보존)
- no-op: DataList 없음 / 상세 테이블 없음

### 8-2. E2E (Mock LLM, 기존 fixture 재사용)
- master-detail: 상세 3입력이 `dlt_memberBasic`의 EMP_CD/EMP_NM/DEPT_NM에 바인딩. grid·검색 입력 보존
- simple-form/search-grid: 상세 ref 없음 (no-op)

### 8-3. 골든 재생성 + 회귀
master-detail 골든만 상세 ref 추가. simple-form/search-grid 골든 불변(no-op). 전체 0 fail.

## 9. 성공 기준
1. 모든 unit + e2e PASS
2. master-detail: 상세 입력 3종이 `dlt_memberBasic` 컬럼에 바인딩 (`ref="data:dlt_memberBasic.{COL}"`)
3. 검색 입력·grid(2B)·CDATA·2C-0 schbox·2C-1 scwin 핸들러 전부 보존
4. simple-form/search-grid 회귀 0
5. `--no-llm` no-op 유지 (Phase 0+1 회귀)

## 10. 리스크/미해결
| 리스크 | 완화 |
|---|---|
| 상세 테이블을 검색폼과 오인 | **조회버튼 유무로 의미 판정**(영역 단위, 형제 포함). 검색영역은 조회버튼 보유 → 제외. 조회버튼 없는 schbox도 상세로 올바르게 해석 (class 리터럴 비의존) |
| 라벨이 컬럼명과 불일치 (예: "사원코드" vs "사번") | 정확 일치만 바인딩, 나머지 생략(graceful). 향후 정규화/LLM 힌트 가능 |
| 다중 grid/상세 테이블 | 2C-2는 첫 DataList만. 다중은 향후 |
| 2B ref-binder와 영역 중복 | detail-binder는 schbox 밖만 → 2B는 schbox 안만. 영역 분리로 충돌 없음 |

미해결:
1. **라벨 매칭 fallback** — 2C-2는 정확 일치만. 부분/정규화 매칭은 불일치 사례 등장 시 추가.
2. **다중 상세 테이블** — 단일만. 다중은 향후.
3. **저장 흐름** (sbm_save, 키필드 readonly, 검증, MSG_CM_*) — 2C-3.

## 11. 부록 — before/after (master-detail 상세 입력)

**2C-1 출력 (현재)**:
```xml
<xf:input ctype="Edit" ... id="ibx_empCdDetail" label="사번" .../>
<xf:input ctype="Edit" ... id="ibx_empNmDetail" label="성명" .../>
<xf:select1 ctype="SelectBox" ... id="sbx_deptNmDetail" label="부서명" .../>
```
(pre-rename 시점엔 `edt_empCdDetail`/`edt_empNmDetail`/`sel_deptNmDetail`)

**2C-2 통과 후**:
```xml
<xf:input ... id="ibx_empCdDetail" label="사번" ref="data:dlt_memberBasic.EMP_CD" .../>
<xf:input ... id="ibx_empNmDetail" label="성명" ref="data:dlt_memberBasic.EMP_NM" .../>
<xf:select1 ... id="sbx_deptNmDetail" label="부서명" ref="data:dlt_memberBasic.DEPT_NM" .../>
```

저장 흐름·키필드 readonly·검증은 후속 Plan(2C-3).

---

*문서 끝.*
