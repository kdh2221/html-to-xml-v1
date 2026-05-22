import { describe, expect, it } from 'vitest';
import { detectDetailInputs } from '../../src/stage3/detail-binder';
import { matchColumn, bindDetailTables } from '../../src/stage3/detail-binder';
import { markMandatory, assignDetailGroupId } from '../../src/stage3/detail-binder';
import type { DataCollectionIR } from '../../src/types';

const COLUMNS = [
  { id: 'EMP_CD', name: '사번', dataType: 'text' as const },
  { id: 'EMP_NM', name: '성명', dataType: 'text' as const },
  { id: 'DEPT_NM', name: '부서명', dataType: 'text' as const },
];

const IR: DataCollectionIR = {
  dataMaps: [],
  dataLists: [{ id: 'dlt_memberBasic', name: '사원목록', columns: COLUMNS }],
  confidence: 0.9,
};

describe('matchColumn', () => {
  it('name 일치 컬럼 id 반환', () => {
    expect(matchColumn('사번', COLUMNS)).toBe('EMP_CD');
    expect(matchColumn('부서명', COLUMNS)).toBe('DEPT_NM');
  });
  it('불일치면 null', () => {
    expect(matchColumn('주소', COLUMNS)).toBeNull();
  });
});

describe('bindDetailTables', () => {
  const MD = `<body>
    <xf:group class="schbox">
      <xf:group class="schbox_inner" id="tbl_search"><xf:input id="edt_empNm" label="성명"/></xf:group>
      <xf:group class="btn_schbox"><xf:trigger id="btn_004"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
    </xf:group>
    <xf:group class="tblbox"><xf:group class="w2tb tbl">
      <xf:input id="edt_empCdDetail" label="사번"/>
      <xf:input id="edt_empNmDetail" label="성명"/>
      <xf:select1 id="sel_deptNmDetail" label="부서명"/>
    </xf:group></xf:group>
  </body>`;

  it('상세 입력에 DataList ref 주입 (input + select1)', () => {
    const out = bindDetailTables(MD, IR);
    expect(out).toContain('id="edt_empCdDetail" ref="data:dlt_memberBasic.EMP_CD"');
    expect(out).toContain('id="edt_empNmDetail" ref="data:dlt_memberBasic.EMP_NM"');
    expect(out).toContain('id="sel_deptNmDetail" ref="data:dlt_memberBasic.DEPT_NM"');
  });

  it('검색폼 입력(edt_empNm)은 바인딩 안 함', () => {
    const out = bindDetailTables(MD, IR);
    expect(out).not.toMatch(/id="edt_empNm"[^>]*ref=/);
  });

  it('라벨 불일치 입력은 생략 (깨진 ref 방지)', () => {
    const xml = `<body><xf:group class="tblbox"><xf:input id="edt_addr" label="주소"/></xf:group></body>`;
    const out = bindDetailTables(xml, IR);
    expect(out).not.toContain('ref=');
  });

  it('멱등: 이미 ref 있으면 보존', () => {
    const xml = `<body><xf:group class="tblbox"><xf:input id="edt_empCdDetail" ref="data:other.X" label="사번"/></xf:group></body>`;
    const out = bindDetailTables(xml, IR);
    expect(out).toContain('ref="data:other.X"');
    expect(out).not.toContain('dlt_memberBasic.EMP_CD');
  });

  it('no-op: DataList 없으면 원본 그대로', () => {
    const emptyIr: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 0.5 };
    const xml = `<body><xf:group class="tblbox"><xf:input id="edt_empCdDetail" label="사번"/></xf:group></body>`;
    expect(bindDetailTables(xml, emptyIr)).toBe(xml);
  });
});

// master-detail형: 검색 schbox(조회버튼) + 상세 tblbox(버튼 없음). Stage 3.5 시점 = pre-rename id, 버튼에 btn_cm sch 없음.
const MD = `<body>
  <xf:group class="schbox">
    <xf:group class="schbox_inner" id="tbl_search"><xf:group class="w2tb tbl">
      <xf:input id="edt_empNm" label="성명"/>
    </xf:group></xf:group>
    <xf:group class="btn_schbox"><xf:trigger id="btn_004" type="button"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
  </xf:group>
  <xf:group class="tblbox">
    <xf:group class="w2tb tbl">
      <xf:input id="edt_empCdDetail" label="사번"/>
      <xf:input id="edt_empNmDetail" label="성명"/>
      <xf:select1 id="sel_deptNmDetail" label="부서명"/>
    </xf:group>
  </xf:group>
</body>`;

describe('detectDetailInputs', () => {
  it('상세 tblbox 입력만 수집 (검색 schbox 입력 제외)', () => {
    const inputs = detectDetailInputs(MD);
    expect(inputs).toEqual([
      { id: 'edt_empCdDetail', label: '사번' },
      { id: 'edt_empNmDetail', label: '성명' },
      { id: 'sel_deptNmDetail', label: '부서명' },
    ]);
    expect(inputs.find(i => i.id === 'edt_empNm')).toBeUndefined();
  });

  it('중첩 케이스(search-grid형): schbox>tblbox>schbox_inner는 상세로 오인 안 함', () => {
    const SG = `<body>
      <xf:group class="grpbox_wrap schbox">
        <xf:group class="tblbox">
          <xf:group class="schbox_inner" id="tbl_search"><xf:group class="w2tb tbl">
            <xf:input id="edt_orderNo" label="주문번호"/>
          </xf:group></xf:group>
        </xf:group>
        <xf:group class="btn_schbox"><xf:trigger id="btn_006"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
      </xf:group>
    </body>`;
    expect(detectDetailInputs(SG)).toEqual([]);
  });

  it('조회버튼 없는 schbox는 상세로 포함 (의미 기반 판정)', () => {
    const xml = `<body>
      <xf:group class="schbox">
        <xf:group class="w2tb tbl"><xf:input id="edt_x" label="항목"/></xf:group>
      </xf:group>
    </body>`;
    expect(detectDetailInputs(xml)).toEqual([{ id: 'edt_x', label: '항목' }]);
  });

  it('폼 영역 없으면 빈 배열', () => {
    expect(detectDetailInputs(`<body><xf:group class="gvwbox"></xf:group></body>`)).toEqual([]);
  });
});

describe('markMandatory', () => {
  it('입력 태그에 mandatory="true" 추가 (id 뒤)', () => {
    const xml = `<xf:input id="edt_empCdDetail" label="사번"/>`;
    expect(markMandatory(xml, 'edt_empCdDetail')).toContain('id="edt_empCdDetail" mandatory="true"');
  });
  it('이미 mandatory 있으면 보존', () => {
    const xml = `<xf:input id="edt_empCdDetail" mandatory="true" label="사번"/>`;
    expect(markMandatory(xml, 'edt_empCdDetail')).toBe(xml);
  });
});

describe('assignDetailGroupId', () => {
  it('키 입력을 감싸는 tblbox region에 id="grp_detail" 부여 (기존 빈 id 교체)', () => {
    const xml = `<xf:group class="tblbox" id=""><xf:group class="w2tb tbl"><xf:input id="edt_empCdDetail" label="사번"/></xf:group></xf:group>`;
    const out = assignDetailGroupId(xml, 'edt_empCdDetail');
    expect(out).toContain('<xf:group class="tblbox" id="grp_detail">');
  });
  it('이미 grp_detail이면 그대로', () => {
    const xml = `<xf:group class="tblbox" id="grp_detail"><xf:input id="edt_x" label="x"/></xf:group>`;
    expect(assignDetailGroupId(xml, 'edt_x')).toBe(xml);
  });
});

describe('bindDetailTables — grp_detail + 키 mandatory (2C-3)', () => {
  const IR2: DataCollectionIR = {
    dataMaps: [],
    dataLists: [{ id: 'dlt_memberBasic', name: '사원목록', columns: [
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'EMP_NM', name: '성명', dataType: 'text' },
    ] }],
    confidence: 0.9,
  };
  const MD2 = `<body><xf:group class="tblbox" id=""><xf:group class="w2tb tbl">
    <xf:input id="edt_empCdDetail" label="사번"/>
    <xf:input id="edt_empNmDetail" label="성명"/>
  </xf:group></xf:group></body>`;

  it('상세 region에 grp_detail + 키(첫 컬럼 사번) 입력만 mandatory', () => {
    const out = bindDetailTables(MD2, IR2);
    expect(out).toContain('<xf:group class="tblbox" id="grp_detail">');
    expect(out).toMatch(/id="edt_empCdDetail"[^>]*mandatory="true"/);
    expect(out).not.toMatch(/id="edt_empNmDetail"[^>]*mandatory=/);
    expect(out).toContain('id="edt_empCdDetail" ref="data:dlt_memberBasic.EMP_CD"');
  });
});
