import { describe, expect, it } from 'vitest';
import { MockLLMClient } from '../../src/stage3/llm-mock';
import type { DataCollectionIR } from '../../src/types';

const sampleIR: DataCollectionIR = {
  dataMaps: [{ id: 'dma_search', name: '검색',
    keys: [{ id: 'EMP_CD', name: '사번', dataType: 'text' }] }],
  dataLists: [],
  confidence: 0.85,
};

describe('MockLLMClient', () => {
  it('recordResponse() 후 inferDataCollection() 매칭', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('TEST_KEY', sampleIR);
    const result = await mock.inferDataCollection('xml', { matchKey: 'TEST_KEY' });
    expect(result).toEqual(sampleIR);
  });

  it('매칭되는 응답 없으면 throw', async () => {
    const mock = new MockLLMClient();
    await expect(mock.inferDataCollection('xml', { matchKey: 'NONE' }))
      .rejects.toThrow(/no recorded response/i);
  });

  it('matchKey 미지정 시 마지막 record로 fallback', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('A', { ...sampleIR, confidence: 0.1 });
    mock.recordResponse('B', { ...sampleIR, confidence: 0.99 });
    const result = await mock.inferDataCollection('xml');
    expect(result.confidence).toBe(0.99);
  });

  it('getCallLog() 호출 기록', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('K', sampleIR);
    await mock.inferDataCollection('xml1', { matchKey: 'K' });
    await mock.inferDataCollection('xml2', { matchKey: 'K' });
    const log = mock.getCallLog();
    expect(log.length).toBe(2);
    expect(log[0].xml).toBe('xml1');
    expect(log[1].xml).toBe('xml2');
  });
});
