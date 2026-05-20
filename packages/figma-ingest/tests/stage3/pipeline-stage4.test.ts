import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../../src/pipeline';
import { closeBrowser } from '../../src/dom-extractor';
import { MockLLMClient } from '../../src/stage3/llm-mock';
import type { DataCollectionIR } from '../../src/types';

const FIX_DIR = path.join(__dirname, '..', 'fixtures');
const RESP_DIR = path.join(FIX_DIR, 'llm-responses');

function loadMockResponse(name: string): DataCollectionIR {
  return JSON.parse(fs.readFileSync(path.join(RESP_DIR, `${name}.json`), 'utf-8'));
}

function makeMock(name: string): MockLLMClient {
  const mock = new MockLLMClient();
  mock.recordResponse(name, loadMockResponse(name));
  return mock;
}

describe('pipeline Stage 4 scwin scaffolding', () => {
  afterAll(async () => { await closeBrowser(); });

  it('simple-form: 조회 흐름 핸들러 생성', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { llmClient: makeMock('simple-form') });
    expect(xml).toContain('$c.win.setEnterKeyEvent(tbl_search, scwin.');
    expect(xml).toContain('$c.sbm.execute(sbm_search);');
    expect(xml).toContain('$c.util.setGridViewDelCheckBox([');
    expect(xml).toContain('scwin.sbm_search_submitdone = function(e) {');
    expect(xml).toMatch(/ev:onclick="scwin\.\w+_onclick"/);
    expect(xml).not.toMatch(/scwin\.onpageload = function\(\) \{\s*\};/);
  }, 60000);

  it('noLlm: 빈 onpageload 유지 (no-op)', async () => {
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');
    const xml = await convertHtmlToWebSquare(html, { noLlm: true });
    expect(xml).toMatch(/scwin\.onpageload = function\(\) \{\s*\};/);
    expect(xml).not.toContain('$c.sbm.execute');
  }, 60000);
});
