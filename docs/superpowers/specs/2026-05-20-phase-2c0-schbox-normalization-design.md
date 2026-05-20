# Phase 2C-0: schbox 구조 정규화 설계

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-20 |
| 상태 | Draft v1.0 |
| 선행 | Phase 0+1, 2A, 2B |
| 후행 | Phase 2C-1 (scwin) — 이 정규화 위에 얹힘 |
| 접근 | 결정론적 후처리 (Stage 2.5). legacy 변환기 미수정, 출력 재구성 |

## 0. 관련 자산
- 부모 spec: `2026-05-13-html-to-websquare-design.md`
- 2C-1 spec: `2026-05-20-phase-2c1-scwin-query-flow-design.md` (이 정규화 결과의 tbl_search/btn_schbox에 의존)
- deepsquare: UI-08(`schbox_inner` id=`tbl_search`), UI-03/UI-04(버튼 `.btn_schbox`/`.rt` 배치), WRM 레퍼런스 SP001M01의 schbox 구조

## 1. 배경과 문제

WRM 표준 검색영역(schbox) 구조 (사용자 확인 + SP001M01):
```
.schbox
├── .schbox_inner#tbl_search
│   └── .w2tb.tbl          ← 폼 (th/td 입력)
└── .btn_schbox
    └── .btn_cm.sch        ← 조회 버튼 (폼 밖, 형제)
```

**현재 파이프라인 출력 (골든 검증)**:
```
.tblbox#grp_search_001          ← schbox 아님
└── .w2tb.tbl
    └── tr > td
        ├── <xf:select1 부서>
        └── <xf:trigger 조회 class="btn_cm sch">   ← 버튼이 폼 td 안에 박힘
```

원인: Phase 0+1 `planLayout`(absolute-xml-builder)이 검색폼 클러스터를 synthetic `<xf:group ctype="GroupBox" id="grp_search_NNN">`로 감싸고, legacy sample-converter가 이를 일반 GroupBox=`tblbox`로 분류(schbox 미분류) + 버튼이 폼 td에 잔류. 골든은 이 비표준 출력을 고정했을 뿐.

→ 검색영역이 WRM 표준 schbox가 아니고, 조회 버튼이 `.btn_schbox`로 분리되지 않음. 2C-1의 `setEnterKeyEvent(tbl_search, ...)`가 얹힐 토대가 비표준.

## 2. 목표

Stage 2 출력의 synthetic 검색그룹을 표준 schbox 구조로 재구성:
- `.tblbox#grp_search` → `.schbox`
- 폼 테이블을 `.schbox_inner#tbl_search`로 래핑
- 조회/검색/초기화 버튼을 폼 td에서 떼어 `.btn_schbox`로 이동

legacy 변환기는 수정하지 않는다 (블랙박스). 출력을 후처리한다.

## 3. 파이프라인 — Stage 2.5 (Stage 2 이후, Stage 3 이전)

```
Stage 2(legacy → tblbox#grp_search) → ★ Stage 2.5 (normalizeSchbox) ★ → Stage 3 → 3.5 → Phase 1 → Stage 4
```

**llmClient 게이트 *밖* — 항상 실행.** 구조 정규화는 데이터 바인딩과 독립이므로 `--no-llm` 출력도 표준 schbox가 되는 게 옳다.

```typescript
const relativeXml = convertAbsoluteToRelative(absoluteXml, { adaptive });
const normalizedXml = normalizeSchbox(relativeXml);   // NEW Stage 2.5 (항상)
options.onStage?.('stage2.5-schbox', normalizedXml);

let enrichedXml = normalizedXml;
if (!options.noLlm && options.llmClient) {
  const ir = await inferDataCollection(normalizedXml, options.llmClient);
  enrichedXml = injectDataCollection(normalizedXml, ir);
  enrichedXml = bindDataCollection(enrichedXml, ir);
  ...
}
// Phase 1 rules on enrichedXml ...
```

**보너스**: Stage 3 이전이라 xml-region-parser가 schbox를 정상 추출 → 실제 LLM이 schbox field 힌트 수신 (현재는 tblbox라 0건).

## 4. 모듈

`src/stage3/schbox-normalizer.ts` — `normalizeSchbox(xml: string): string`
- 트리 재구성 → cheerio 사용
- **검색그룹 substring만** 추출/변환/재삽입 → 나머지 문서 포맷 보존 (xml-injector 철학)

## 5. 탐지 + 변환 로직

### 5-1. 탐지
검색그룹 = `<xf:group>` 중:
- class에 `tblbox` 포함 AND id가 `grp_search`로 시작 (planLayout synthetic 마커)
- 내부에 라벨이 `조회`/`검색`/`초기화`인 `<xf:trigger>` 1개 이상 존재

> Stage 2.5는 Phase 1 *이전* → 버튼에 아직 `btn_cm sch` 없음 → **라벨 텍스트로 탐지**.
> 두 조건(grp_search id + 검색버튼) 모두 충족해야 정규화 (오탐 방지).

### 5-2. 변환 (cheerio 노드 기반 — 균형 매칭 보장)
중첩 `<xf:group>`이 많아 정규식 균형 매칭은 불가. **cheerio로 전체 문서를 로드해 grp_search 노드를 찾고, 그 노드의 직렬화 문자열을 원본 추출 키로 삼는다**:
1. `cheerio.load(xml, {xmlMode:true})` → grp_search 검색그룹 노드 찾기
2. 변환 전 그 노드의 `$.xml(node)`를 `oldBlock`으로 보관 (원본 문자열에서 이 정확한 substring을 치환할 키)
3. 노드를 cheerio로 in-place 변환:
   - 조회/검색/초기화 버튼 노드(들) detach (폼 td에서 제거)
   - 외곽 그룹 class: `tblbox` 제거, `schbox` 추가. id `grp_search_NNN` 제거 (외곽 schbox는 id 불필요)
   - 기존 `.w2tb.tbl` 그룹을 새 `<xf:group class="schbox_inner" id="tbl_search">`로 감쌈
   - 외곽 schbox에 `<xf:group class="btn_schbox">` 자식 추가 (schbox_inner 다음), detach한 버튼(들) 삽입
4. 변환 후 `$.xml(node)`를 `newBlock`으로 직렬화
5. **원본 xml 문자열에서 `oldBlock` → `newBlock` 치환** (나머지 문서 포맷 보존)

> 주의: cheerio가 `$.xml()`로 추출한 `oldBlock`이 원본 xml 문자열에 그대로 존재해야 치환 가능. cheerio 직렬화가 원본과 미세하게 다르면(속성 순서/공백) 치환 실패 → 그 경우 **전체 문서를 cheerio로 로드/변환/재직렬화하는 fallback** 사용 (포맷은 골든 재생성으로 흡수). 구현 시 어느 쪽이 동작하는지 확인 후 선택.

### 5-3. no-op 조건
- grp_search id 없음 OR 검색버튼(조회/검색/초기화) 없음 → 해당 그룹 건드리지 않음
- 검색그룹이 아예 없으면 → 원본 그대로 반환

## 6. 변환 전후 (simple-form)

**Stage 2 출력 (정규화 전)**:
```xml
<xf:group class="tblbox" id="grp_search_001" meta_snippetName="5_02 테이블(2단)">
  <xf:group class="w2tb tbl" tagname="table">
    <xf:group tagname="tr">
      <xf:group class="w2tb_th" tagname="th"><w2:textbox label="부서"/></xf:group>
      <xf:group class="w2tb_td" tagname="td">
        <xf:select1 id="sbx_deptCd" .../>
        <xf:trigger ctype="Button" id="btn_006" ...><xf:label><![CDATA[조회]]></xf:label></xf:trigger>
      </xf:group>
    </xf:group>
  </xf:group>
</xf:group>
```

**Stage 2.5 출력 (정규화 후)**:
```xml
<xf:group class="schbox">
  <xf:group class="schbox_inner" id="tbl_search">
    <xf:group class="w2tb tbl" tagname="table">
      <xf:group tagname="tr">
        <xf:group class="w2tb_th" tagname="th"><w2:textbox label="부서"/></xf:group>
        <xf:group class="w2tb_td" tagname="td">
          <xf:select1 id="sbx_deptCd" .../>
        </xf:group>
      </xf:group>
    </xf:group>
  </xf:group>
  <xf:group class="btn_schbox">
    <xf:trigger ctype="Button" id="btn_006" ...><xf:label><![CDATA[조회]]></xf:label></xf:trigger>
  </xf:group>
</xf:group>
```

## 7. 후속 단계 영향
- **Stage 3 region-parser**: schbox 정상 추출 → 실제 LLM이 필드 힌트 수신 (mock 경로 무영향)
- **Stage 3.5 ref-binder**: input은 schbox_inner 안에 있고 boundComponentId 우선이라 정상. label fallback도 schbox 안 fields로 동작
- **Phase 1 button-modifier**: 버튼이 btn_schbox로 이동했어도 라벨로 찾아 `btn_cm sch` 부여 (위치 무관)
- **2C-1 scwin**: `setEnterKeyEvent(tbl_search, ...)` 표준 타겟 가능, 버튼 `.btn_schbox` 분리 → WRM 준수

## 8. 테스팅
### 8-1. 단위 (XML 직접 입력)
- 검색그룹 탐지 (grp_search + 조회버튼 동시 충족)
- 버튼 detach + 폼 td에서 제거
- schbox_inner#tbl_search 래핑 + class tblbox→schbox
- btn_schbox 생성 + 버튼 삽입
- no-op: grp_search 아닌 tblbox / 검색버튼 없는 grp_search / 검색그룹 없는 문서
- 다중 버튼(조회+초기화) 모두 btn_schbox로 이동

### 8-2. E2E (Mock LLM + noLlm 둘 다)
- simple-form/search-grid: 출력에 `class="schbox"`, `class="schbox_inner" id="tbl_search"`, `class="btn_schbox"`, 조회버튼이 폼 td 밖(btn_schbox 안)
- master-detail: 검색폼 있으면 동일 정규화
- noLlm: schbox 구조 정규화는 적용됨 (게이트 밖), 단 ref/submission/scwin 없음

### 8-3. 골든 재생성 + 회귀
3개 골든 모두 schbox 구조로 재생성 (Stage 2.5가 항상 실행되므로 모든 골든에 영향). 검토 후 채택.

## 9. 성공 기준
1. 모든 unit + e2e PASS
2. 3개 fixture 출력: 검색영역이 `.schbox > .schbox_inner#tbl_search > .w2tb.tbl` + `.schbox > .btn_schbox > .btn_cm.sch` (Phase 1 후 btn_cm sch). 조회버튼이 폼 td 밖
3. ref 바인딩(2B)은 schbox_inner 안 input에 여전히 정상 (회귀 없음)
4. xml-region-parser가 schbox region 추출 (단위 테스트로 확인)
5. 골든 재생성 + 회귀 0 fail
6. `--no-llm`도 schbox 구조 (구조 ≠ 바인딩)

## 10. 리스크/미해결
| 리스크 | 완화 |
|---|---|
| cheerio 재직렬화로 검색블록 포맷 변동 | substring만 변환, 나머지 문서 보존. 골든 재생성 흡수 |
| grp_search 마커가 항상 검색영역인가 | grp_search id + 조회/검색/초기화 버튼 동반 이중 조건 |
| balanced `<xf:group>...</xf:group>` substring 추출 (중첩 그룹) | 검색그룹은 중첩 xf:group 다수 포함 → 단순 non-greedy 정규식으로는 균형 매칭 불가. **cheerio로 grp_search 노드를 찾아 outerHTML/$.xml() 추출** 후, 그 문자열을 원본에서 치환 (substring 경계는 cheerio가 보장) |
| noLlm 골든도 바뀜 | 의도된 것 — 구조는 바인딩과 독립, 표준 schbox가 옳음 |
| 다중 검색그룹 | grp_search 매칭 모두 반복 정규화 |

**미해결**:
1. **외곽 schbox id 처리** — SP001M01 외곽 schbox는 id 없음. grp_search_NNN id는 제거. 단 다른 곳에서 이 id를 참조하면 깨짐 → 현재 grp_search id를 참조하는 코드 없음(확인). 안전히 제거.
2. **schbox_inner의 w2tb summary 등 부가 속성** — 기존 w2tb.tbl의 속성(summary 등)은 그대로 유지, 래핑만 추가.

## 11. Task 분해 (~7)
1. 검색그룹/버튼 탐지 헬퍼 (grp_search + 조회/검색/초기화 라벨)
2. 버튼 detach + 폼 td 제거
3. schbox_inner#tbl_search 래핑 + class tblbox→schbox
4. btn_schbox 생성 + 버튼 삽입
5. normalizeSchbox 통합 + no-op + substring 치환
6. pipeline Stage 2.5 wiring (게이트 밖)
7. 골든 재생성 + E2E + xml-region-parser schbox 추출 확인 + 회귀

---

*문서 끝.*
