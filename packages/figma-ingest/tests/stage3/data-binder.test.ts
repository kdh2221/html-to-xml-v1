import { describe, expect, it } from 'vitest';
import { bindDataCollection } from '../../src/stage3/data-binder';
import type { DataCollectionIR } from '../../src/types';

const FULL_XML = `<root>
  <xf:model>
    <w2:dataCollection baseNode="map">
      <w2:dataMap id="dma_search"/>
    </w2:dataCollection>
  </xf:model>
  <xf:group class="schbox">
    <xf:input id="edt_empCd" label="사번"/>
  </xf:group>
  <w2:gridView id="grd_007">
    <w2:header id="h1"><w2:row><w2:column id="column1" value="사번"></w2:column></w2:row></w2:header>
    <w2:gBody id="b1"><w2:row><w2:column id="col_1"></w2:column></w2:row></w2:gBody>
  </w2:gridView>
</root>`;

const IR: DataCollectionIR = {
  dataMaps: [{ id: 'dma_search', name: '검색',
    keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text', boundComponentId: 'edt_empCd' }] }],
  dataLists: [{ id: 'dlt_list', name: '목록',
    columns: [{ id: 'EMP_CD', name: '사번', dataType: 'text', sourceBodyId: 'col_1' }] }],
  confidence: 0.9,
};

describe('bindDataCollection (Stage 3.5 orchestrator)', () => {
  it('ref + grid 정렬 + submission 모두 적용', () => {
    const out = bindDataCollection(FULL_XML, IR);
    expect(out).toMatch(/<xf:input id="edt_empCd"[^>]*ref="data:dma_search\.EMP_CD"/);
    expect(out).toMatch(/<w2:gridView[^>]*dataList="data:dlt_list"/);
    expect(out).toContain('id="EMP_CD"');
    expect(out).not.toContain('id="col_1"');
    expect(out).toContain('<xf:submission id="sbm_search"');
  });

  it('빈 IR이면 원본 거의 그대로 (submission/ref 없음)', () => {
    const empty: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 1 };
    const out = bindDataCollection(FULL_XML, empty);
    expect(out).not.toContain('ref="data:');
    expect(out).not.toContain('<xf:submission');
    expect(out).not.toContain('dataList="data:');
  });
});

const DETAIL_IR: DataCollectionIR = {
  dataMaps: [],
  dataLists: [{
    id: 'dlt_memberBasic',
    name: '사원목록',
    columns: [
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'EMP_NM', name: '성명', dataType: 'text' },
      { id: 'DEPT_NM', name: '부서명', dataType: 'text' },
    ],
  }],
  confidence: 0.9,
};

const MD = `<body>
  <xf:group class="tblbox"><xf:group class="w2tb tbl">
    <xf:input id="edt_empCdDetail" label="사번"/>
    <xf:select1 id="sel_deptNmDetail" label="부서명"/>
  </xf:group></xf:group>
</body>`;

describe('bindDataCollection — 상세 바인딩 통합 (2C-2)', () => {
  it('상세 입력이 DataList ref로 바인딩됨', () => {
    const out = bindDataCollection(MD, DETAIL_IR);
    expect(out).toContain('id="edt_empCdDetail" ref="data:dlt_memberBasic.EMP_CD"');
    expect(out).toContain('id="sel_deptNmDetail" ref="data:dlt_memberBasic.DEPT_NM"');
  });
});
