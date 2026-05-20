import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../../src/pipeline';
import { closeBrowser } from '../../src/dom-extractor';
import { MockLLMClient } from '../../src/stage3/llm-mock';
import type { DataCollectionIR } from '../../src/types';

const FIX_DIR = path.join(__dirname, '..', 'fixtures');
const simpleFormHtml = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');

const IR: DataCollectionIR = {
  dataMaps: [{ id: 'dma_search', name: '검색조건', keys: [
    { id: 'EMP_CD', name: '사번', dataType: 'text', boundComponentId: 'edt_empCd' },
    { id: 'DEPT_CD', name: '부서 코드', dataType: 'text', boundComponentId: 'sel_deptCd' },
  ] }],
  dataLists: [{ id: 'dlt_list', name: '사원목록', columns: [
    { id: 'EMP_CD', name: '사번', dataType: 'text', sourceBodyId: 'col_1' },
    { id: 'EMP_NM', name: '성명', dataType: 'text', sourceBodyId: 'col_2' },
    { id: 'DEPT_NM', name: '부서명', dataType: 'text', sourceBodyId: 'col_3' },
  ] }],
  confidence: 0.9,
};

describe('pipeline Stage 3.5 binding (Mock LLM)', () => {
  afterAll(async () => { await closeBrowser(); });

  it('최종 출력에 ref + dataList + submission (Phase 1 rename 후)', async () => {
    const mock = new MockLLMClient();
    mock.recordResponse('simple-form', IR);
    const xml = await convertHtmlToWebSquare(simpleFormHtml, { llmClient: mock });

    expect(xml).toMatch(/<xf:input\b[^>]*\bid="ibx_empCd"[^>]*ref="data:dma_search\.EMP_CD"/);
    expect(xml).toMatch(/<xf:select1\b[^>]*\bid="sbx_deptCd"[^>]*ref="data:dma_search\.DEPT_CD"/);
    expect(xml).toMatch(/<w2:gridView[^>]*dataList="data:dlt_list"/);
    expect(xml).not.toContain('id="col_1"');
    expect(xml).toContain('<xf:submission id="sbm_search"');
  }, 60000);

  it('noLlm: true → Stage 3.5 skip (ref/submission 없음)', async () => {
    const xml = await convertHtmlToWebSquare(simpleFormHtml, { noLlm: true });
    expect(xml).not.toContain('ref="data:dma_search');
    expect(xml).not.toContain('<xf:submission');
  }, 60000);
});
