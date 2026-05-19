/**
 * Golden Regression Test
 *
 * 이 테스트는 3개 픽스처 HTML에서 변환된 XML이 tests/golden/ 의 expected와 정확히 일치하는지 확인한다.
 *
 * 골든 업데이트 워크플로:
 *   1. legacy converter나 pipeline 로직이 의도적으로 변경된 경우만 골든을 업데이트한다.
 *   2. `corepack pnpm --filter @kdh/figma-ingest build && corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate`
 *      위 명령은 dist/cli.js로 3개 픽스처를 다시 변환해 expected XML을 덮어쓴다.
 *      또는 수동으로 CLI 재실행:
 *        node packages/figma-ingest/dist/cli.js \
 *          packages/figma-ingest/tests/fixtures/simple-form.html \
 *          packages/figma-ingest/tests/golden/simple-form.expected.xml
 *      (search-grid, master-detail도 동일)
 *   3. 반드시 git diff로 골든 변경사항을 확인하고 PR description에 변경 의도를 적는다.
 *      골든을 무심코 regenerate하면 진짜 회귀를 놓친다 — 골든 테스트의 목적은 diff 검토.
 *
 * 픽스처: tests/fixtures/{simple-form,search-grid,master-detail}.html
 * 골든:   tests/golden/{...}.expected.xml
 */
import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../src/pipeline';
import { closeBrowser } from '../src/dom-extractor';

const FIX_DIR = path.join(__dirname, 'fixtures');
const GOLDEN_DIR = path.join(__dirname, 'golden');

const cases = [
  { name: 'simple-form', html: 'simple-form.html', expected: 'simple-form.expected.xml' },
  { name: 'search-grid', html: 'search-grid.html', expected: 'search-grid.expected.xml' },
  { name: 'master-detail', html: 'master-detail.html', expected: 'master-detail.expected.xml' },
];

describe('golden regression', () => {
  afterAll(async () => {
    await closeBrowser();
  });

  cases.forEach(({ name, html, expected }) => {
    it(`${name}: 골든 파일과 일치`, async () => {
      const input = fs.readFileSync(path.join(FIX_DIR, html), 'utf-8');
      const expectedXml = fs.readFileSync(path.join(GOLDEN_DIR, expected), 'utf-8');
      const actualXml = await convertHtmlToWebSquare(input);
      expect(actualXml).toBe(expectedXml);
    }, 60000);
  });
});
