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

import { checkAsyncAwait, checkForbiddenApi, checkDirectDialog, checkEventNames, checkHeaderInputType, checkCancelReform, validateAntiPatterns } from '../../src/validate/anti-pattern-validator';

const script = (body: string) => `<script type="text/javascript" lazy="false"><![CDATA[\n${body}\n]]></script>`;

describe('checkAsyncAwait (#2)', () => {
  it('async 없이 await → critical', () => {
    const xml = script(`scwin.btn_x_onclick = function() {\n\tawait $c.win.confirm("x");\n};`);
    const v = checkAsyncAwait(xml);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe('ANTI-02');
    expect(v[0].location).toBe('btn_x_onclick');
  });
  it('async function with await → 위반 없음', () => {
    expect(checkAsyncAwait(script(`scwin.btn_x_onclick = async function() {\n\tawait $c.win.confirm("x");\n};`))).toEqual([]);
  });
  it('await 없는 function → 위반 없음', () => {
    expect(checkAsyncAwait(script(`scwin.onpageload = function() {\n\t$c.util.x();\n};`))).toEqual([]);
  });
});

describe('checkForbiddenApi (#1)', () => {
  it('document.getElementById → warning', () => {
    expect(checkForbiddenApi(script(`var a = document.getElementById("x");`))[0].rule).toBe('ANTI-01');
  });
  it('정상 script → 없음', () => {
    expect(checkForbiddenApi(script(`$c.util.getComponent("x");`))).toEqual([]);
  });
});

describe('checkDirectDialog (#3)', () => {
  it('bare confirm( → warning', () => {
    expect(checkDirectDialog(script(`if (confirm("x")) {}`))[0].rule).toBe('ANTI-03');
  });
  it('$c.win.confirm은 정상', () => {
    expect(checkDirectDialog(script(`await $c.win.confirm("x");`))).toEqual([]);
  });
});

describe('checkEventNames (#4)', () => {
  it('허용 외 ev:onrowclick → warning', () => {
    expect(checkEventNames(`<xf:trigger ev:onrowclick="x"/>`)[0].rule).toBe('ANTI-04');
  });
  it('허용 이벤트(onclick/onpageload/submitdone) → 없음', () => {
    expect(checkEventNames(`<a ev:onclick="x"/><b ev:onpageload="y"/><c ev:submitdone="z"/>`)).toEqual([]);
  });
});

describe('checkHeaderInputType (#11)', () => {
  it('header inputType=calendar → warning', () => {
    const xml = `<w2:gridView><w2:header><w2:row><w2:column inputType="calendar" id="A"/></w2:row></w2:header></w2:gridView>`;
    expect(checkHeaderInputType(xml)[0].rule).toBe('ANTI-11');
  });
  it('text/checkbox → 없음', () => {
    const xml = `<w2:gridView><w2:header><w2:row><w2:column inputType="text" id="A"/><w2:column inputType="checkbox" id="chk"/></w2:row></w2:header></w2:gridView>`;
    expect(checkHeaderInputType(xml)).toEqual([]);
  });
});

describe('checkCancelReform (#15)', () => {
  it('.reform( → warning', () => {
    expect(checkCancelReform(script(`dlt_x.reform();`))[0].rule).toBe('ANTI-15');
  });
  it('undoGridView → 없음', () => {
    expect(checkCancelReform(script(`$c.data.undoGridView(grd_x);`))).toEqual([]);
  });
});

describe('validateAntiPatterns (합산)', () => {
  it('깨끗한 XML → 빈 배열', () => {
    expect(validateAntiPatterns(`<root><xf:input id="ibx_a"/></root>`)).toEqual([]);
  });
  it('여러 위반 합산', () => {
    const xml = `<root><xf:input id="dup"/><xf:input id="dup"/>${script(`dlt_x.reform();`)}</root>`;
    const rules = validateAntiPatterns(xml).map(v => v.rule).sort();
    expect(rules).toContain('ANTI-08');
    expect(rules).toContain('ANTI-15');
  });
});
