import { describe, expect, it } from 'vitest';
import { reconcileGrids } from '../../src/stage3/grid-reconciler';
import type { DataCollectionIR } from '../../src/types';

const GRID_XML = `<root>
  <w2:gridView ctype="IBSheet" id="grd_007" style="width:100%;">
    <w2:header id="header1"><w2:row>
      <w2:column id="column1" inputType="text" value="사번" width="100"></w2:column>
      <w2:column id="column2" inputType="text" value="성명" width="100"></w2:column>
      <w2:column id="column3" inputType="text" value="부서명" width="100"></w2:column>
    </w2:row></w2:header>
    <w2:gBody id="gBody1"><w2:row>
      <w2:column id="col_1" inputType="text" width="100"></w2:column>
      <w2:column id="col_2" inputType="text" width="100"></w2:column>
      <w2:column id="col_3" inputType="text" width="100"></w2:column>
    </w2:row></w2:gBody>
  </w2:gridView>
</root>`;

function ir(columns: any[]): DataCollectionIR {
  return { dataMaps: [], dataLists: [{ id: 'dlt_list', name: '목록', columns }], confidence: 0.9 };
}

const COLS = [
  { id: 'EMP_CD', name: '사번', dataType: 'text' },
  { id: 'EMP_NM', name: '성명', dataType: 'text' },
  { id: 'DEPT_NM', name: '부서명', dataType: 'text' },
];

describe('reconcileGrids', () => {
  it('gridView에 dataList= 추가', () => {
    const out = reconcileGrids(GRID_XML, ir(COLS));
    expect(out).toMatch(/<w2:gridView[^>]*dataList="data:dlt_list"/);
  });

  it('body 컬럼 id를 DataList 컬럼 id로 정렬 (위치순)', () => {
    const out = reconcileGrids(GRID_XML, ir(COLS));
    expect(out).not.toContain('id="col_1"');
    expect(out).toMatch(/<w2:gBody[\s\S]*id="EMP_CD"[\s\S]*id="EMP_NM"[\s\S]*id="DEPT_NM"[\s\S]*<\/w2:gBody>/);
  });

  it('header 컬럼 id도 동일하게 정렬', () => {
    const out = reconcileGrids(GRID_XML, ir(COLS));
    expect(out).not.toContain('id="column1"');
    expect(out).toMatch(/<w2:header[\s\S]*id="EMP_CD"[\s\S]*id="EMP_NM"[\s\S]*id="DEPT_NM"[\s\S]*<\/w2:header>/);
  });

  it('header value(표시 라벨)는 보존', () => {
    const out = reconcileGrids(GRID_XML, ir(COLS));
    expect(out).toContain('value="사번"');
    expect(out).toContain('value="성명"');
  });

  it('DataList 없으면 원본 그대로', () => {
    const noList: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 1 };
    expect(reconcileGrids(GRID_XML, noList)).toBe(GRID_XML);
  });

  it('이미 dataList= 있으면 중복 추가 안 함', () => {
    const xml = GRID_XML.replace('<w2:gridView ', '<w2:gridView dataList="data:dlt_existing" ');
    const out = reconcileGrids(xml, ir(COLS));
    expect((out.match(/dataList=/g) || []).length).toBe(1);
    expect(out).toContain('dataList="data:dlt_existing"');
  });
});

describe('reconcileGrids — sourceBodyId/chk-aware (#9, Phase 3A)', () => {
  it('chk 선행 컬럼: chk 보존 + 데이터 컬럼 id 기반 매칭(밀림 없음)', () => {
    const ir = {
      dataMaps: [],
      dataLists: [{ id: 'dlt_a', name: 'A', columns: [
        { id: 'EMP_CD', name: '사번', dataType: 'text' as const, sourceBodyId: 'col_1' },
        { id: 'EMP_NM', name: '성명', dataType: 'text' as const, sourceBodyId: 'col_2' },
      ] }],
      confidence: 0.9,
    };
    const xml = `<w2:gridView id="grd_a">
      <w2:header><w2:row><w2:column id="chk"/><w2:column id="col_1"/><w2:column id="col_2"/></w2:row></w2:header>
      <w2:gBody><w2:row><w2:column id="chk"/><w2:column id="col_1"/><w2:column id="col_2"/></w2:row></w2:gBody>
    </w2:gridView>`;
    const out = reconcileGrids(xml, ir);
    expect(out).toContain('<w2:column id="chk"/>');
    expect(out).toContain('<w2:column id="EMP_CD"/>');
    expect(out).toContain('<w2:column id="EMP_NM"/>');
    const cols = [...out.matchAll(/<w2:column id="([^"]+)"/g)].map(m => m[1]);
    expect(cols).toEqual(['chk', 'EMP_CD', 'EMP_NM', 'chk', 'EMP_CD', 'EMP_NM']);
  });

  it('sourceBodyId 없는 IR → 위치순 fallback (기존 동작)', () => {
    const ir = {
      dataMaps: [],
      dataLists: [{ id: 'dlt_a', name: 'A', columns: [
        { id: 'EMP_CD', name: '사번', dataType: 'text' as const },
        { id: 'EMP_NM', name: '성명', dataType: 'text' as const },
      ] }],
      confidence: 0.9,
    };
    const xml = `<w2:gridView id="grd_a">
      <w2:header><w2:row><w2:column id="x"/><w2:column id="y"/></w2:row></w2:header>
      <w2:gBody><w2:row><w2:column id="x"/><w2:column id="y"/></w2:row></w2:gBody>
    </w2:gridView>`;
    const out = reconcileGrids(xml, ir);
    const cols = [...out.matchAll(/<w2:column id="([^"]+)"/g)].map(m => m[1]);
    expect(cols).toEqual(['EMP_CD', 'EMP_NM', 'EMP_CD', 'EMP_NM']);
  });
});
