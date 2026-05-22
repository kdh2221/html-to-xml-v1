# Phase 2C-3: 저장 흐름 + 입력 검사 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-22 |
| 상태 | Draft v1.0 |
| 선행 | 2A(DataCollection), 2B(바인딩+Submission), 2C-0(schbox 정규화), 2C-1(조회 핸들러), 2C-2(상세영역 바인딩) |
| 접근 | 결정론 (LLM 불필요). 각 단계 기존 모듈 확장 — submission-generator(3.5) + detail-binder(3.5) + scwin-scaffolder(Stage 4) |

## 0. 관련 자산
- 부모 spec: `2026-05-13-html-to-websquare-design.md`, 2C-1 spec `2026-05-20-phase-2c1-scwin-query-flow-design.md`
- 메모리: `project-phase1-implementation` (Phase 2C carryover)
- **WRM 레퍼런스 검증**: `WebContent/ui/HM/HM002M01.xml` `btn_saveMember_onclick` + deepsquare `gcc/GCC_Reference.md`(MSG_CM 표, validateGroup/isModified/getMessage)
  - 표준 저장 핸들러: `isModified(dlt)` → `validateGroup(grp)` → `confirm(getMessage("MSG_CM_00031"))` → `sbm.execute(sbm_save)`, else `alert(getMessage("MSG_CM_00032"))`
  - MSG_CM_00031 = "데이터를 저장 하시겠습니까?", MSG_CM_00032 = "저장할 데이터가 없습니다.", MSG_CM_00002 = "$[1] 필수입력값입니다."

## 1. 배경과 문제

2C-2 후 master-detail 화면은 조회·상세 바인딩까지 작동한다. 그러나 저장(`btn_013`)·취소(`btn_014`) 버튼은 `ev:onclick`이 없어 **눌러도 아무 일도 안 일어난다**. 저장 제출(`sbm_save`)도 없다.

Phase 2C-3은 WRM 표준 저장 흐름(변경감지 → 필수값 검증 → 확인 → 제출)과 취소(되돌리기)를 생성한다.

## 2. 파이프라인 — 각 단계 기존 모듈 확장

```
Stage 2.5 → Stage 3 → Stage 3.5(bind) → Phase 1 → Stage 4(scwin)
                          ↑ submission-generator + detail-binder 확장   ↑ scwin-scaffolder 확장
```

| 조각 | 모듈 (단계) | 추가 내용 |
|---|---|---|
| `sbm_save` 제출 | `submission-generator.ts` (3.5) | 편집 DataList 송수신 제출 선언 |
| `grp_detail` id + 키 필수 | `detail-binder.ts` (3.5) | 상세 그룹에 id 부여 + 키 컬럼 입력에 `mandatory="true"` |
| 저장/취소 핸들러 | `scwin-scaffolder.ts` (Stage 4) | 저장/취소 onclick + `sbm_save_submitdone` stub + 버튼 `ev:onclick` |

**안정 id 근거**: `grp_detail`/`sbm_save`/`grd_*`/`dlt_*`는 `renameIdToUi01`이 안 건드림 → Stage 3.5에서 부여한 id를 Stage 4 핸들러가 안전 참조. 저장/취소 버튼은 Phase 1 button-modifier 이후에도 라벨(저장/취소) 유지 → Stage 4에서 라벨로 탐지.

`--no-llm` 시: IR 없음 → DataList 없음 → sbm_save 미생성 → 저장흐름 no-op (Phase 0+1 회귀 유지).

## 3. 조각별 설계

### 3-1. sbm_save 제출 (submission-generator 확장)

생성 조건: **저장 라벨 버튼 존재 + IR에 DataList 존재**. 편집 대상 = IR 첫 DataList.

```xml
<!-- TODO: [서버 확인] action URL("/TODO_VERIFY") 확인 필요 -->
<xf:submission id="sbm_save" ref="data:json,dlt_memberBasic" target="data:json,dlt_memberBasic"
  action="/TODO_VERIFY" method="post" mediatype="application/json" ev:submitdone="scwin.sbm_save_submitdone"/>
```
- `ref`(송신) = `target`(수신) = 편집 DataList (변경 행 송신, 갱신 결과 수신).
- 기존 sbm_search 생성과 병렬. action은 sbm_search와 동일하게 TODO 주석.
- Stage 3.5 시점 탐지: 저장 버튼은 라벨 `저장`(CDATA)로 식별(button-modifier 이전).

### 3-2. grp_detail id + 키 필수 (detail-binder 확장)

상세 region(2C-2가 식별한 조회버튼 없는 최외곽 폼)이 존재하면:
- 그 region 여는 태그의 `id`를 `grp_detail`로 설정(현재 `id=""`).
- IR 첫 DataList의 **첫 컬럼**(관례상 PK, 예: `EMP_CD`)에 바인딩된 상세 입력에 `mandatory="true"` 추가.

```xml
<xf:group class="tblbox" id="grp_detail" ...>
  ...<xf:input id="ibx_empCdDetail" ref="data:dlt_memberBasic.EMP_CD" mandatory="true" .../>
```
- 키 입력 식별: 첫 컬럼 name(예 "사번")과 라벨이 일치하는 상세 입력 (2C-2 matchColumn 역방향).
- 나머지 필수규칙은 모름 → `<!-- TODO: 추가 필수필드는 업무 확인 -->` 주석(키만 결정론적으로 마킹).
- 편집은 문자열 치환(키 입력 id로 위치 특정 → 그 입력 태그에 mandatory 삽입; region 여는 태그는 키 입력에서 역방향 스캔으로 `<xf:group ...tblbox...>` 특정). cheerio 전체 재직렬화 회피(CDATA 보존).

### 3-3. 저장/취소 핸들러 (scwin-scaffolder 확장, Stage 4)

탐지(최종 XML): 저장버튼(라벨 저장), 취소버튼(라벨 취소), `sbm_save`(id), `grp_detail`(id), 바인딩 grid(2C-1 detectBoundGrid 재사용).

**저장 핸들러** (저장버튼 + sbm_save + 바인딩 DataList 시):
```javascript
scwin.btn_013_onclick = async function() {
	if ($c.data.isModified(dlt_memberBasic)) {
		if ($c.data.validateGroup(grp_detail)) {
			if (await $c.win.confirm($c.data.getMessage("MSG_CM_00031"))) {
				$c.sbm.execute(sbm_save);
			}
		}
	} else {
		await $c.win.alert($c.data.getMessage("MSG_CM_00032"));
	}
};
```
- `grp_detail` 없으면 `validateGroup` 줄을 생략(중첩 if 한 겹 제거):
```javascript
scwin.btn_009_onclick = async function() {
	if ($c.data.isModified(dlt_orderList)) {
		if (await $c.win.confirm($c.data.getMessage("MSG_CM_00031"))) {
			$c.sbm.execute(sbm_save);
		}
	} else {
		await $c.win.alert($c.data.getMessage("MSG_CM_00032"));
	}
};
```
- `await` 사용 → `async function`.

**취소 핸들러** (취소버튼 + 바인딩 grid 시):
```javascript
scwin.btn_014_onclick = function() {
	$c.data.undoGridView(grd_005);
};
```

**submitdone stub** (sbm_save 시): `scwin.sbm_save_submitdone = function(e) {};`

저장·취소 버튼 태그에 `ev:onclick="scwin.{btnId}_onclick"` 부여(없을 때만, 멱등). 위 핸들러들은 기존 scwin 스크립트(2C-1 onpageload/조회)에 **추가**된다.

## 4. 케이스별 동작

| 화면 | sbm_save | 저장 핸들러 | 취소 | grp_detail/키 mandatory |
|---|---|---|---|---|
| master-detail (저장+취소+grid+상세폼) | ✓ | isModified→**validateGroup(grp_detail)**→confirm→execute | undoGridView(grd_005) | ✓ |
| search-grid (저장+grid, 상세폼 없음) | ✓ | isModified→confirm→execute (**validateGroup 생략**) | — (취소버튼 없음) | ✗ |
| simple-form (저장버튼 없음) | ✗ | ✗ | ✗ | ✗ |

> search-grid: 저장버튼+편집 grid 있으니 저장 흐름 wire, 상세폼(grp_detail) 없어 validateGroup 생략(graceful).

## 5. 엣지케이스 / no-op

| 상황 | 동작 |
|---|---|
| 저장버튼 없음 | sbm_save·저장핸들러 미생성 |
| IR DataList 없음 | sbm_save 미생성 |
| 상세폼(grp_detail) 없음 | 저장핸들러 validateGroup 생략 |
| 취소버튼 없음 | 취소핸들러 미생성 |
| 키 컬럼 매칭 입력 없음 | mandatory 마킹 생략 (grp_detail은 상세폼 있으면 부여) |
| 버튼에 이미 ev:onclick | 보존 (멱등) |
| `--no-llm` | 저장흐름 no-op (기존 동작 유지) |

## 6. 테스팅 전략

### 6-1. 단위 (XML/IR 직접 입력)
- `submission-generator`: 저장버튼+DataList → sbm_save(ref/target=DataList, ev:submitdone) 생성 / 저장버튼 없으면 미생성 / 기존 sbm_search 회귀
- `detail-binder`: 상세 region에 grp_detail 부여 + 키(첫 컬럼) 입력 mandatory / 비키 입력 미마킹 / 상세 없으면 no-op / 기존 ref 바인딩 회귀
- `scwin-scaffolder`: 저장핸들러(grp_detail O→validateGroup 포함 / X→생략), 취소핸들러(undoGridView), sbm_save_submitdone, 저장·취소 ev:onclick, async function, no-op(저장버튼 없음), 기존 조회 흐름 회귀

### 6-2. E2E (Mock LLM)
- master-detail: sbm_save + 저장 onclick(validateGroup(grp_detail)) + 키 mandatory + 취소 undoGridView + MSG_CM_00031/00032 + 저장·취소 ev:onclick
- search-grid: sbm_save + 저장 onclick(validateGroup 생략); 취소 핸들러 없음
- simple-form: 저장흐름 없음

### 6-3. 골든 재생성 + 회귀
master-detail·search-grid 골든 변경, simple-form 불변. 2A/2B/2C-0/2C-1/2C-2 산출물 전부 보존. 전체 0 fail.

## 7. 성공 기준
1. 모든 unit + e2e PASS
2. master-detail: sbm_save + validateGroup(grp_detail) 포함 저장 흐름 + 키 mandatory + 취소 undo
3. search-grid: sbm_save + validateGroup 생략 저장 흐름
4. 기존 단계 산출물 전부 보존, simple-form 회귀 0
5. `--no-llm` no-op 유지

## 8. 리스크/미해결
| 리스크 | 완화 |
|---|---|
| 필수 필드를 모름 (업무 지식 부재) | 키(첫 컬럼)만 결정론적 mandatory, 나머지 TODO 주석. validateGroup 호출은 WRM 정합 구조로 생성 |
| sbm_save action URL 미상 | sbm_search와 동일하게 `/TODO_VERIFY` + 주석 |
| grp_detail 부여 시 정확한 region 태그 특정 | 키 입력 id에서 역방향으로 최근접 `<xf:group ...tblbox...>` 스캔 (cheerio 재직렬화 회피) |
| search-grid 저장 흐름이 의도와 다를 수 있음 | 저장버튼+편집 grid 신호로 결정론 wire. validateGroup은 상세폼 있을 때만 |
| scwin-scaffolder 비대화 | 저장 흐름 조립을 별도 헬퍼(buildSaveHandlers)로 분리, 단일 모듈 유지 |

미해결:
1. **다중 필수필드/복합 검증** — 키만. 정밀 규칙은 향후(LLM 힌트/userspec).
2. **삭제(행추가/del) 흐름** — 2C-3 범위 외.
3. **submitdone 본문** — stub (재조회 등 후처리는 향후).

## 9. 부록 — master-detail script before/after

**2C-2 출력 (현재)** — onpageload(grid 2종)만:
```javascript
scwin.onpageload = function() {
	$c.util.setGridViewDelCheckBox([grd_005]);
	$c.data.setChangeCheckedDc([dlt_memberBasic]);
};
```

**2C-3 통과 후** — 저장/취소/submitdone 추가:
```javascript
scwin.onpageload = function() {
	$c.util.setGridViewDelCheckBox([grd_005]);
	$c.data.setChangeCheckedDc([dlt_memberBasic]);
};
scwin.btn_013_onclick = async function() {
	if ($c.data.isModified(dlt_memberBasic)) {
		if ($c.data.validateGroup(grp_detail)) {
			if (await $c.win.confirm($c.data.getMessage("MSG_CM_00031"))) {
				$c.sbm.execute(sbm_save);
			}
		}
	} else {
		await $c.win.alert($c.data.getMessage("MSG_CM_00032"));
	}
};
scwin.btn_014_onclick = function() {
	$c.data.undoGridView(grd_005);
};
scwin.sbm_save_submitdone = function(e) {
};
```

저장 결과 후처리(재조회)·삭제 흐름·다중 필수필드는 후속.

---

*문서 끝.*
