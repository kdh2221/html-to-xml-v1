import { describe, expect, it } from 'vitest';
import { generateSubmissions } from '../../src/stage3/submission-generator';
import type { DataCollectionIR } from '../../src/types';

const MODEL_XML = `<root>
  <xf:model>
    <w2:dataCollection baseNode="map">
      <w2:dataMap id="dma_search"/>
    </w2:dataCollection>
  </xf:model>
</root>`;

describe('generateSubmissions', () => {
  it('DataMap+DataList 있으면 submission 생성 (ref/target/action)', () => {
    const ir: DataCollectionIR = {
      dataMaps: [{ id: 'dma_search', name: '검색', keys: [] }],
      dataLists: [{ id: 'dlt_list', name: '목록', columns: [] }],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    expect(out).toContain('<xf:submission id="sbm_search"');
    expect(out).toContain('ref="data:json,dma_search"');
    expect(out).toContain('target="data:json,dlt_list"');
    expect(out).toContain('action="/TODO_VERIFY"');
    expect(out).toContain('ev:submitdone="scwin.sbm_search_submitdone"');
    expect(out).toContain('TODO: [서버 확인]');
  });

  it('DataList 없으면 target 생략', () => {
    const ir: DataCollectionIR = {
      dataMaps: [{ id: 'dma_search', name: '검색', keys: [] }],
      dataLists: [],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    expect(out).toContain('<xf:submission id="sbm_search"');
    expect(out).not.toContain('target=');
  });

  it('DataMap 없으면 submission 생략 (마스터-디테일)', () => {
    const ir: DataCollectionIR = {
      dataMaps: [],
      dataLists: [{ id: 'dlt_memberBasic', name: '목록', columns: [] }],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    expect(out).toBe(MODEL_XML);
  });

  it('submission은 </w2:dataCollection> 뒤에 주입', () => {
    const ir: DataCollectionIR = {
      dataMaps: [{ id: 'dma_search', name: '검색', keys: [] }],
      dataLists: [{ id: 'dlt_list', name: '목록', columns: [] }],
      confidence: 0.9,
    };
    const out = generateSubmissions(MODEL_XML, ir);
    const dcEnd = out.indexOf('</w2:dataCollection>');
    const sbm = out.indexOf('<xf:submission');
    expect(sbm).toBeGreaterThan(dcEnd);
    expect(out.indexOf('</xf:model>')).toBeGreaterThan(sbm);
  });
});
