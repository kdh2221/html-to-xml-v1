import { describe, expect, it } from 'vitest';
import { inferDataCollection } from '../../src/stage3/data-collection-inferrer';
import { MockLLMClient } from '../../src/stage3/llm-mock';
import type { DataCollectionIR } from '../../src/types';

const XML_WITH_REGIONS = `<?xml version="1.0"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:w2="http://www.inswave.com/websquare" xmlns:xf="http://www.w3.org/2002/xforms">
  <head><xf:model><w2:dataCollection></w2:dataCollection></xf:model></head>
  <body>
    <xf:group class="schbox"><w2:textbox label="사번"/></xf:group>
    <xf:group class="gvwbox">
      <w2:gridView><w2:header><w2:row><w2:column value="사번"/></w2:row></w2:header>
        <w2:gBody><w2:row><w2:column id="EMP_CD"/></w2:row></w2:gBody>
      </w2:gridView>
    </xf:group>
  </body>
</html>`;

const sampleIR: DataCollectionIR = {
  dataMaps: [{ id: 'dma_search', name: '검색', keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }] }],
  dataLists: [{ id: 'dlt_list', name: '목록', columns: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }] }],
  confidence: 0.85,
};

describe('inferDataCollection (orchestrator)', () => {
  it('Mock LLM 호출 후 IR 반환', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('any', sampleIR);
    const result = await inferDataCollection(XML_WITH_REGIONS, mock);
    expect(result.dataMaps[0].id).toBe('dma_search');
    expect(mock.getCallLog().length).toBe(1);
  });

  it('region 없는 XML → LLM 호출 안 함 + 빈 IR 반환', async () => {
    const xmlNoRegions = `<root><body><xf:input/></body></root>`;
    const mock = new MockLLMClient();
    const result = await inferDataCollection(xmlNoRegions, mock);
    expect(result.dataMaps).toEqual([]);
    expect(result.dataLists).toEqual([]);
    expect(result.confidence).toBe(1.0);
    expect(mock.getCallLog().length).toBe(0);
  });

  it('LLM이 throw → fallback IR (빈 + confidence 0)', async () => {
    class FailingClient {
      async inferDataCollection(): Promise<DataCollectionIR> {
        throw new Error('mock LLM failure');
      }
    }
    const result = await inferDataCollection(XML_WITH_REGIONS, new FailingClient() as any);
    expect(result.dataMaps).toEqual([]);
    expect(result.dataLists).toEqual([]);
    expect(result.confidence).toBe(0);
    expect(result.notes).toContain('failure');
  });
});
