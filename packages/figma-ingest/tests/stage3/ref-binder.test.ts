import { describe, expect, it } from 'vitest';
import { bindRefs } from '../../src/stage3/ref-binder';
import type { DataCollectionIR } from '../../src/types';

const XML = `<root>
  <xf:group class="schbox">
    <xf:group class="w2tb_th"><w2:textbox label="사번"/></xf:group>
    <xf:input id="edt_empCd" label="사번"/>
    <xf:group class="w2tb_th"><w2:textbox label="부서"/></xf:group>
    <xf:select1 id="sel_deptCd" label="부서"/>
  </xf:group>
</root>`;

function ir(keys: any[]): DataCollectionIR {
  return { dataMaps: [{ id: 'dma_search', name: '검색', keys }], dataLists: [], confidence: 0.9 };
}

describe('bindRefs', () => {
  it('boundComponentId 힌트로 ref 부착', () => {
    const out = bindRefs(XML, ir([
      { id: 'EMP_CD', name: '사번', dataType: 'text', boundComponentId: 'edt_empCd' },
    ]));
    expect(out).toMatch(/<xf:input id="edt_empCd"[^>]*ref="data:dma_search\.EMP_CD"/);
  });

  it('boundComponentId 없으면 label==key.name 매칭 fallback', () => {
    const out = bindRefs(XML, ir([
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
    ]));
    expect(out).toMatch(/<xf:input id="edt_empCd"[^>]*ref="data:dma_search\.EMP_CD"/);
  });

  it('라벨 불일치 케이스 — boundComponentId가 구원 (부서 vs 부서 코드)', () => {
    const out = bindRefs(XML, ir([
      { id: 'DEPT_CD', name: '부서 코드', dataType: 'text', boundComponentId: 'sel_deptCd' },
    ]));
    expect(out).toMatch(/<xf:select1 id="sel_deptCd"[^>]*ref="data:dma_search\.DEPT_CD"/);
  });

  it('이미 ref 있으면 보존 (덮어쓰지 않음)', () => {
    const xmlWithRef = `<root><xf:input id="edt_empCd" ref="data:existing.X" label="사번"/></root>`;
    const out = bindRefs(xmlWithRef, ir([
      { id: 'EMP_CD', name: '사번', dataType: 'text', boundComponentId: 'edt_empCd' },
    ]));
    expect(out).toContain('ref="data:existing.X"');
    expect(out).not.toContain('data:dma_search.EMP_CD');
  });

  it('DataMap 없으면 원본 그대로', () => {
    const noMap: DataCollectionIR = { dataMaps: [], dataLists: [], confidence: 1 };
    expect(bindRefs(XML, noMap)).toBe(XML);
  });

  it('매칭 컴포넌트 없으면 해당 key skip (crash 없음)', () => {
    const out = bindRefs(XML, ir([
      { id: 'NOPE', name: '없는필드', dataType: 'text', boundComponentId: 'edt_nonexist' },
    ]));
    expect(out).not.toContain('edt_nonexist');
    expect(out).toContain('id="edt_empCd"');
  });
});
