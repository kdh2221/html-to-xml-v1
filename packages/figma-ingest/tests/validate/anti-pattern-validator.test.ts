import { describe, expect, it } from 'vitest';
import { checkDuplicateIds, checkGridColumns, checkSubmissionRefs } from '../../src/validate/anti-pattern-validator';

describe('checkDuplicateIds (#8)', () => {
  it('컴포넌트 id 중복 → critical', () => {
    const xml = `<root><xf:input id="ibx_x"/><xf:select1 id="ibx_x"/></root>`;
    const v = checkDuplicateIds(xml);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('ANTI-08');
    expect(v[0].severity).toBe('critical');
    expect(v[0].location).toBe('ibx_x');
    expect(v[0].remediation).toContain('접미사');
  });
  it('데이터 컬럼 id 반복(columnInfo/header/gBody)은 위반 아님', () => {
    const xml = `<root>
      <w2:dataList id="dlt_a"><w2:columnInfo><w2:column id="EMP_CD"/></w2:columnInfo></w2:dataList>
      <w2:gridView id="grd_a"><w2:header><w2:row><w2:column id="EMP_CD"/></w2:row></w2:header>
      <w2:gBody><w2:row><w2:column id="EMP_CD"/></w2:row></w2:gBody></w2:gridView></root>`;
    expect(checkDuplicateIds(xml)).toEqual([]);
  });
  it('빈 id는 무시', () => {
    expect(checkDuplicateIds(`<root><xf:group id=""/><xf:group id=""/></root>`)).toEqual([]);
  });
});

describe('checkGridColumns (#9)', () => {
  const grid = (h: string, b: string) =>
    `<root><w2:gridView id="grd_007"><w2:header><w2:row>${h}</w2:row></w2:header><w2:gBody><w2:row>${b}</w2:row></w2:gBody></w2:gridView></root>`;
  it('header/gBody 개수 불일치 → critical', () => {
    const v = checkGridColumns(grid('<w2:column id="A"/><w2:column id="B"/><w2:column id="C"/>', '<w2:column id="A"/><w2:column id="B"/>'));
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('ANTI-09');
    expect(v[0].location).toBe('grd_007');
  });
  it('1:1 일치 → 위반 없음', () => {
    expect(checkGridColumns(grid('<w2:column id="A"/><w2:column id="B"/>', '<w2:column id="A"/><w2:column id="B"/>'))).toEqual([]);
  });
});

describe('checkSubmissionRefs (#10)', () => {
  it('미선언 ref → critical', () => {
    const xml = `<root><w2:dataList id="dlt_list"/><xf:submission id="sbm_search" ref="data:json,dma_search" target="data:json,dlt_list"/></root>`;
    const v = checkSubmissionRefs(xml);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('ANTI-10');
    expect(v[0].location).toBe('sbm_search→dma_search');
  });
  it('선언된 ref/target → 위반 없음', () => {
    const xml = `<root><w2:dataMap id="dma_search"/><w2:dataList id="dlt_list"/><xf:submission id="sbm_search" ref="data:json,dma_search" target="data:json,dlt_list"/></root>`;
    expect(checkSubmissionRefs(xml)).toEqual([]);
  });
});
