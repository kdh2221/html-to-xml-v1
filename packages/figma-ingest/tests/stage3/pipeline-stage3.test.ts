import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../../src/pipeline';
import { closeBrowser } from '../../src/dom-extractor';
import { MockLLMClient } from '../../src/stage3/llm-mock';
import type { DataCollectionIR } from '../../src/types';

const FIX_DIR = path.join(__dirname, '..', 'fixtures');
const simpleFormHtml = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');

const simpleFormIR: DataCollectionIR = {
  dataMaps: [{
    id: 'dma_search', name: '검색조건',
    keys: [
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'DEPT_CD', name: '부서 코드', dataType: 'text' },
    ],
  }],
  dataLists: [{
    id: 'dlt_list', name: '사원목록',
    columns: [
      { id: 'EMP_CD', name: '사번', dataType: 'text' },
      { id: 'EMP_NM', name: '성명', dataType: 'text' },
      { id: 'DEPT_NM', name: '부서명', dataType: 'text' },
    ],
  }],
  confidence: 0.9,
};

describe('pipeline with Stage 3 (Mock LLM)', () => {
  afterAll(async () => { await closeBrowser(); });

  it('MockLLMClient 주입 시 DataCollection이 채워짐', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('simple-form', simpleFormIR);

    const xml = await convertHtmlToWebSquare(simpleFormHtml, { llmClient: mock });

    expect(xml).toContain('<w2:dataMap id="dma_search"');
    expect(xml).toContain('<w2:key id="EMP_CD"');
    expect(xml).toContain('<w2:dataList id="dlt_list"');
    expect(xml).toContain('<w2:column id="EMP_CD"');
  }, 60000);

  it('noLlm: true → Stage 3 skip, Phase 0+1 동작과 동일', async () => {
    const xml = await convertHtmlToWebSquare(simpleFormHtml, { noLlm: true });
    expect(xml).not.toContain('<w2:dataMap');
    expect(xml).not.toContain('<w2:dataList');
    expect(xml).toMatch(/<w2:dataCollection[^>]*>\s*<\/w2:dataCollection>/);
  }, 60000);

  it('llmClient도 noLlm도 없으면 → noLlm 기본 동작 (안전)', async () => {
    const xml = await convertHtmlToWebSquare(simpleFormHtml);
    expect(xml).not.toContain('<w2:dataMap');
  }, 60000);
});
