import { describe, expect, it } from 'vitest';
import { extractRegions } from '../../src/stage3/xml-region-parser';
import { normalizeSchbox } from '../../src/stage3/schbox-normalizer';

const SCHBOX_XML = `
<xf:group class="schbox">
  <xf:group class="schbox_inner" id="tbl_search">
    <xf:group class="w2tb tbl" tagname="table">
      <xf:group tagname="tr">
        <xf:group class="w2tb_th" tagname="th"><w2:textbox label="사번"/></xf:group>
        <xf:group class="w2tb_td" tagname="td"><xf:input id="ibx_empCd"/></xf:group>
        <xf:group class="w2tb_th" tagname="th"><w2:textbox label="부서"/></xf:group>
        <xf:group class="w2tb_td" tagname="td"><xf:select1 id="sbx_deptCd"/></xf:group>
      </xf:group>
    </xf:group>
  </xf:group>
</xf:group>
`;

const GVWBOX_XML = `
<xf:group class="gvwbox">
  <w2:gridView id="grd_list">
    <w2:header id="header1"><w2:row>
      <w2:column id="column1" inputType="text" value="사번"/>
      <w2:column id="column2" inputType="text" value="성명"/>
      <w2:column id="column3" inputType="text" value="부서명"/>
    </w2:row></w2:header>
    <w2:gBody id="gBody1"><w2:row>
      <w2:column id="EMP_CD" inputType="text"/>
      <w2:column id="EMP_NM" inputType="text"/>
      <w2:column id="DEPT_NM" inputType="text"/>
    </w2:row></w2:gBody>
  </w2:gridView>
</xf:group>
`;

describe('extractRegions', () => {
  it('schbox 영역에서 라벨 추출', () => {
    const xml = `<root>${SCHBOX_XML}</root>`;
    const regions = extractRegions(xml);
    const sch = regions.find(r => r.kind === 'schbox');
    expect(sch).toBeDefined();
    expect(sch!.labels).toEqual(['사번', '부서']);
  });

  it('schbox fields: label과 componentId 페어링', () => {
    const xml = `<root>${SCHBOX_XML}</root>`;
    const regions = extractRegions(xml);
    const sch = regions.find(r => r.kind === 'schbox');
    expect(sch).toBeDefined();
    if (sch?.kind !== 'schbox') throw new Error('not schbox');
    expect(sch.fields).toEqual([
      { label: '사번', componentId: 'ibx_empCd' },
      { label: '부서', componentId: 'sbx_deptCd' },
    ]);
  });

  it('schbox labels는 하위호환 유지', () => {
    const xml = `<root>${SCHBOX_XML}</root>`;
    const regions = extractRegions(xml);
    const sch = regions.find(r => r.kind === 'schbox');
    if (sch?.kind !== 'schbox') throw new Error('not schbox');
    expect(sch.labels).toEqual(['사번', '부서']);
  });

  it('gvwbox 영역에서 컬럼 정보 추출', () => {
    const xml = `<root>${GVWBOX_XML}</root>`;
    const regions = extractRegions(xml);
    const gvw = regions.find(r => r.kind === 'gvwbox');
    expect(gvw).toBeDefined();
    expect(gvw!.columns).toEqual([
      { label: '사번', bodyId: 'EMP_CD' },
      { label: '성명', bodyId: 'EMP_NM' },
      { label: '부서명', bodyId: 'DEPT_NM' },
    ]);
  });

  it('schbox + gvwbox 모두 있는 XML → 2개 region', () => {
    const xml = `<root>${SCHBOX_XML}${GVWBOX_XML}</root>`;
    const regions = extractRegions(xml);
    expect(regions.length).toBe(2);
    expect(regions.map(r => r.kind).sort()).toEqual(['gvwbox', 'schbox']);
  });

  it('region 없는 XML → 빈 배열', () => {
    const xml = `<root><xf:group class="tblbox"><xf:input id="x"/></xf:group></root>`;
    expect(extractRegions(xml)).toEqual([]);
  });

  it('screenName meta 추출', () => {
    const xml = `<root><head meta_screenName="사원 조회"/>${SCHBOX_XML}</root>`;
    const regions = extractRegions(xml);
    expect(regions[0].screenName).toBe('사원 조회');
  });

  it('정규화된 schbox에서 region 추출 (Phase 2C-0 연계)', () => {
    const raw = `<root><xf:group class="tblbox" id="grp_search_001"><xf:group class="w2tb tbl"><xf:group class="w2tb_th"><w2:textbox label="사번"/></xf:group><xf:group class="w2tb_td"><xf:input id="ibx_empCd" label="사번"/><xf:trigger id="b"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group></xf:group></xf:group></root>`;
    const normalized = normalizeSchbox(raw);
    const regions = extractRegions(normalized);
    const sch = regions.find(r => r.kind === 'schbox');
    expect(sch).toBeDefined();
    if (sch?.kind !== 'schbox') throw new Error('not schbox');
    expect(sch.fields).toContainEqual({ label: '사번', componentId: 'ibx_empCd' });
  });
});
