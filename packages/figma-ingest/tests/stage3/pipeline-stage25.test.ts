import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../../src/pipeline';
import { closeBrowser } from '../../src/dom-extractor';

const FIX_DIR = path.join(__dirname, '..', 'fixtures');
const simpleFormHtml = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');

describe('pipeline Stage 2.5 schbox normalization', () => {
  afterAll(async () => { await closeBrowser(); });

  it('noLlm에서도 검색영역이 schbox 구조로 정규화 (구조는 바인딩과 독립)', async () => {
    const xml = await convertHtmlToWebSquare(simpleFormHtml, { noLlm: true });
    expect(xml).toContain('class="schbox"');
    expect(xml).toContain('<xf:group class="schbox_inner" id="tbl_search">');
    expect(xml).toContain('<xf:group class="btn_schbox">');
    expect(xml).not.toContain('grp_search');
    expect(xml).not.toContain('tblbox');
    // 조회버튼은 btn_schbox 안 (폼 td 밖). Phase 1 후 btn_cm sch
    expect(xml).toMatch(/<xf:group class="btn_schbox">[\s\S]*btn_cm sch/);
  }, 60000);

  it('onStage stage2.5-schbox 콜백 발생', async () => {
    const stages: string[] = [];
    await convertHtmlToWebSquare(simpleFormHtml, {
      noLlm: true,
      onStage: (name) => { stages.push(name); },
    });
    expect(stages).toContain('stage2.5-schbox');
  }, 60000);
});
