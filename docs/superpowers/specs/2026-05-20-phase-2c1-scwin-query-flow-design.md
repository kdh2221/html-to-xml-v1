# Phase 2C-1: scwin 핸들러 스캐폴딩 (조회 흐름) 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-20 |
| 상태 | Draft v1.0 |
| 선행 | Phase 0+1, 2A(DataCollection), 2B(ref 바인딩 + Submission) |
| 접근 | 결정론 (LLM 불필요) — 최종 XML에서 id 탐지 후 핸들러 템플릿 생성 |

## 0. 관련 자산
- 부모 spec: `2026-05-13-html-to-websquare-design.md`, Phase 2B spec `2026-05-20-phase-2b-binding-submission-design.md`
- **선행 spec: Phase 2C-0 `2026-05-20-phase-2c0-schbox-normalization-design.md` (구현 완료)** — 검색영역을 표준 schbox(`schbox > schbox_inner#tbl_search > .w2tb.tbl` + 형제 `btn_schbox`)로 정규화. 2C-1은 이 정규화된 구조 위에서 동작
- 메모리: `project-phase1-implementation` (Phase 2C scope + carryover, 2C-0 완료 노트)
- deepsquare: CodeRules EV-01 (onpageload 필수 호출), GCC_Reference `$c.win.setEnterKeyEvent`/`$c.util.setGridViewDelCheckBox`/`$c.data.setChangeCheckedDc`/`$c.sbm.execute`
- **WRM 레퍼런스 확정**: `setEnterKeyEvent`의 컨테이너는 `tbl_search`(=schbox_inner id). Publishing_Snippets.md "schbox_inner의 id는 반드시 tbl_search로 고정 (onpageload에서 setEnterKeyEvent(tbl_search,...) 참조)". 신규 페이지(BM/HM/AI) 전부 `tbl_search` 사용 — 2C-0 출력과 일치

## 1. 배경과 문제

Phase 2B 후 화면은 `<xf:submission id="sbm_search">`가 *선언*만 됐고 `scwin.onpageload`는 비어있다(`scwin.onpageload = function() {};`). 조회 버튼(`class="btn_cm sch"`)에 `ev:onclick`도 없다. → **버튼을 눌러도 아무 일도 안 일어난다.** 화면이 선언적으로 데이터에 묶였지만 *실행 로직*이 없다.

Phase 2C-1은 조회 흐름의 scwin 핸들러를 생성해서 화면을 **실제 작동**하게 한다.

## 2. 파이프라인 — Stage 4 (Phase 1 *이후*)

```
Stage 0~2 → Stage 3(inject) → Stage 3.5(bind) → Phase 1 rules → ★ Stage 4 (scwin) ★
```

**Phase 1 이후 실행 근거**: 조회버튼은 Phase 1의 `applyButtonModifiersInXml`가 `class="btn_cm sch"`를 붙인 *후*에야 "sch"로 식별 가능. 핸들러가 참조하는 id(`btn_*`, `grd_*`, `dlt_*`, `sbm_search`, 검색 컨테이너 `tbl_search`)는 모두 `renameIdToUi01`이 건드리지 않는 안정 id (input id `edt_→ibx_`는 핸들러가 참조 안 함). 특히 `tbl_search`는 2C-0이 부여한 고정 id라 탐지가 결정적.

```typescript
result = renameIdToUi01(enrichedXml);
result = applyButtonModifiersInXml(result);
result = scaffoldScwinHandlers(result);   // NEW Stage 4 — sbm_search·bound-grid 없으면 no-op
return result;
```

`--no-llm` 시: sbm_search·바인딩된 grid 둘 다 없음 → no-op → Phase 0+1 동작 유지.

## 3. 모듈

`src/stage3/scwin-scaffolder.ts` — `scaffoldScwinHandlers(xml: string): string`
- 결정론, IR 불필요 (최종 XML에서 id 탐지)
- 탐지는 cheerio (읽기), 편집은 문자열 치환 (xml-injector 패턴 — 포맷 보존)

## 4. 탐지 대상 (cheerio 읽기)

골든 검증 결과 (simple-form, **2C-0 정규화 후**):
- 조회버튼: `<xf:trigger id="btn_006" ... class="btn_cm sch">` — class에 `sch` 포함, id는 카운터 기반(`btn_006`). 2C-0이 이 버튼을 `<xf:group class="btn_schbox">` 안으로 옮김
- 바인딩된 grid: `<w2:gridView id="grd_007" ... dataList="data:dlt_list">`
- submission: `<xf:submission id="sbm_search" ...>`
- 검색 컨테이너: **`<xf:group class="schbox_inner" id="tbl_search">`** — 2C-0이 부여한 **고정 id `tbl_search`**. WRM 표준대로 `setEnterKeyEvent(tbl_search, ...)`. (2C-0 이전의 `grp_search_001`/tblbox는 더 이상 존재 안 함)

> **2C-0 이전 대비 변경**: 검색 컨테이너 탐지가 "버튼의 최근접 상위 그룹" 휴리스틱 → **고정 id `tbl_search` 존재 여부**로 단순화. 2C-0 후 버튼은 `btn_schbox`(id 없음) 안에 있어 `tbl_search`의 형제이지 자식이 아니므로, 옛 "상위 그룹" 방식은 애초에 작동 불가.

탐지 함수:
```
detectSearchButton(xml): {id} | null    // class에 "sch" 토큰 포함하는 xf:trigger
detectBoundGrid(xml): {gridId, dltId} | null   // dataList="data:X" 있는 w2:gridView
detectSubmission(xml): boolean                  // <xf:submission id="sbm_search"
detectSearchContainer(xml): string | null       // id="tbl_search" 그룹 있으면 "tbl_search", 없으면 null
```

## 5. 동작 로직

```
1. sbmSearch = detectSubmission()
   boundGrid = detectBoundGrid()
2. !sbmSearch && !boundGrid → return xml (no-op, 빈 onpageload 유지)
3. searchBtn = detectSearchButton()
   container = detectSearchContainer()   // "tbl_search" | null (버튼 id 무관)
4. onpageload 본문 줄 조립:
   - searchBtn && sbmSearch && container:
       $c.win.setEnterKeyEvent(${container}, scwin.${searchBtn.id}_onclick);
   - boundGrid:
       $c.util.setGridViewDelCheckBox([${boundGrid.gridId}]);
       $c.data.setChangeCheckedDc([${boundGrid.dltId}]);
5. 핸들러 세트:
   - scwin.onpageload = function() { <위 줄들> };
   - searchBtn && sbmSearch:
       · 버튼 태그에 ev:onclick="scwin.${searchBtn.id}_onclick" 부여 (없을 때만)
       · scwin.${searchBtn.id}_onclick = function() { $c.sbm.execute(sbm_search); };
   - sbmSearch:
       · scwin.sbm_search_submitdone = function(e) { };
6. <script> CDATA 내부의 `scwin.onpageload = function() { };`를 생성된 핸들러 세트로 교체
```

## 6. 케이스별 결과

| 화면 | onpageload | 버튼 onclick | submitdone |
|---|---|---|---|
| simple-form (검색폼+grid+sbm) | setEnterKeyEvent(tbl_search) + grid 2종 | `scwin.btn_006_onclick` → `$c.sbm.execute(sbm_search)` | ✓ stub |
| search-grid (동일) | 동일 | ✓ | ✓ |
| master-detail (grid+조회버튼, **sbm 없음**) | grid 2종만 (setEnterKeyEvent X) | ✗ (sbm 없으니 onclick 미부여) | ✗ |
| noLlm | 빈 onpageload 유지 (no-op) | ✗ | ✗ |

> master-detail: 조회버튼은 있으나 DataMap 미추론 → sbm_search 없음 → `$c.sbm.execute(sbm_search)`가 깨진 참조가 되므로 onclick 미생성. grid EV-01 호출만.

## 7. 생성 핸들러 예시 (simple-form)

```javascript
scwin.onpageload = function() {
	$c.win.setEnterKeyEvent(tbl_search, scwin.btn_006_onclick);
	$c.util.setGridViewDelCheckBox([grd_007]);
	$c.data.setChangeCheckedDc([dlt_list]);
};
scwin.btn_006_onclick = function() {
	$c.sbm.execute(sbm_search);
};
scwin.sbm_search_submitdone = function(e) {
};
```

조회버튼: `<xf:trigger id="btn_006" ... class="btn_cm sch" ev:onclick="scwin.btn_006_onclick">`

## 8. 테스팅 전략

### 8-1. 단위 (XML 직접 입력, mock 불필요)
- `detectSearchButton` / `detectBoundGrid` / `detectSubmission` / `detectSearchContainer`: 각 탐지
- onpageload 조립: grid-only(master-detail형), 검색+grid+sbm(simple-form형)
- onclick + submitdone 생성, 버튼 ev:onclick 부여(이미 있으면 보존)
- script CDATA 교체 정확성
- no-op: sbm·grid 둘 다 없으면 원본 그대로

### 8-2. E2E (Mock LLM, 기존 fixture 재사용)
- simple-form: `scwin.btn_006_onclick`(또는 실제 버튼 id) + `$c.sbm.execute(sbm_search)` + `setGridViewDelCheckBox([grd_007])` + `sbm_search_submitdone` + 버튼 `ev:onclick`
- master-detail: `setGridViewDelCheckBox` 있고 `$c.sbm.execute` 없음
- noLlm: 빈 onpageload

### 8-3. 골든 재생성 + 회귀
3개 골든을 Stage 4 통과 결과로 재생성. master-detail은 grid 호출만, simple/search는 전체 핸들러.

## 9. 성공 기준
1. 모든 unit + e2e PASS
2. simple-form/search-grid 출력: onpageload에 EV-01 호출 3종(검색 컨테이너 detected), 조회버튼 `ev:onclick` + onclick 핸들러(`$c.sbm.execute(sbm_search)`), submitdone stub
3. master-detail: onpageload에 grid 호출 2종만, onclick 없음
4. `--no-llm`: 빈 onpageload 유지 (Phase 0+1 회귀)
5. 골든 재생성 + 회귀 0 fail

## 10. 리스크/미해결
| 리스크 | 완화 |
|---|---|
| 검색 컨테이너 id | 2C-0이 `tbl_search` 고정 부여 → 결정적 탐지(`id="tbl_search"` 존재 여부). 휴리스틱 불필요 |
| 버튼 id가 카운터 기반(btn_006) — 의미 없음 | 기능엔 무관. 의미 ID 명명은 드롭(E). 핸들러명도 btn_006_onclick으로 일관 |
| ev:submitdone/onclick 핸들러 본문이 stub | 조회는 `$c.sbm.execute`로 실작동. submitdone은 결과 후처리 자리(stub). 충분히 동작 |
| script CDATA에 기존 핸들러가 더 있으면 | 현재 Phase 0+1 출력은 빈 onpageload만. 교체 시 `scwin.onpageload = function() {...};` 단일 매칭. 다른 핸들러가 이미 있으면 append 모드 고려 (현재는 단일 onpageload만 가정) |

미해결:
1. **setEnterKeyEvent 적용 여부** — `tbl_search` 그룹이 없으면(검색폼 없는 화면: 탭 자식·팝업) setEnterKeyEvent 생략하고 나머지(grid 호출, onclick)는 생성. graceful degradation. (CodeRules: "검색영역 없는 화면에서는 이 호출을 생략")
2. **다중 검색버튼/다중 그리드** — 2C-1은 첫 번째만. 다중은 향후.

---

## 11. 부록 — script 블록 before/after

**Phase 2B 출력 (simple-form)**:
```xml
<script type="text/javascript" lazy="false"><![CDATA[
scwin.onpageload = function() {
};
]]></script>
```

**Phase 2C-1 통과 후**:
```xml
<script type="text/javascript" lazy="false"><![CDATA[
scwin.onpageload = function() {
	$c.win.setEnterKeyEvent(tbl_search, scwin.btn_006_onclick);
	$c.util.setGridViewDelCheckBox([grd_007]);
	$c.data.setChangeCheckedDc([dlt_list]);
};
scwin.btn_006_onclick = function() {
	$c.sbm.execute(sbm_search);
};
scwin.sbm_search_submitdone = function(e) {
};
]]></script>
```

scwin 핸들러 본문(저장/검증/MSG), 의미 ID 명명, master-detail 상세영역 바인딩은 후속 Plan(2C-2/2C-3).

---

*문서 끝.*
