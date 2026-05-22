/**
 * Golden Regression Test
 *
 * 3개 픽스처 HTML에서 변환된 XML이 tests/golden/ 의 expected와 정확히 일치하는지 확인.
 *
 * ⚠️ 골든 업데이트 워크플로:
 *   1. legacy converter, pipeline, Stage 3 LLM mock 응답이 의도적으로 변경된 경우만 업데이트.
 *   2. `corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate` 실행 (build 후).
 *   3. 반드시 git diff로 골든 변경사항을 확인하고 PR description에 변경 의도를 적는다.
 *
 * Phase 2A: 골든은 Mock LLM 응답 (tests/fixtures/llm-responses/*.json)을 사용해서 재생성.
 */
import { describe, expect, it, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../src/pipeline';
import { closeBrowser } from '../src/dom-extractor';
import { MockLLMClient } from '../src/stage3/llm-mock';
import type { DataCollectionIR } from '../src/types';

const FIX_DIR = path.join(__dirname, 'fixtures');
const GOLDEN_DIR = path.join(__dirname, 'golden');

const cases = [
  { name: 'simple-form', html: 'simple-form.html', expected: 'simple-form.expected.xml' },
  { name: 'search-grid', html: 'search-grid.html', expected: 'search-grid.expected.xml' },
  { name: 'master-detail', html: 'master-detail.html', expected: 'master-detail.expected.xml' },
];

/**
 * Stage 0(Puppeteer)가 측정하는 px 치수(width/height)는 Chrome 폰트 렌더링에 따라
 * 환경·실행마다 ±수px 흔들린다(예: width:187px↔179px, 컬럼 width="314"↔"313").
 * 골든 byte 비교가 이 비결정성으로 flaky해지므로, px 치수만 정규화하고
 * 구조·라벨·ref·핸들러 등 의미 내용은 그대로 byte 비교한다.
 * (px 폭 자체의 회귀 커버리지는 의도적으로 포기 — 본질적으로 환경 의존값)
 */
function normalizeForCompare(xml: string): string {
  return xml
    .replace(/width:\s*\d+px/g, 'width:«px»')
    .replace(/height:\s*\d+px/g, 'height:«px»')
    .replace(/\bwidth="\d+"/g, 'width="«n»"')
    .replace(/\bheight="\d+"/g, 'height="«n»"');
}

function loadMockResponse(name: string): DataCollectionIR {
  return JSON.parse(fs.readFileSync(
    path.join(FIX_DIR, 'llm-responses', `${name}.json`), 'utf-8'
  ));
}

describe('golden regression (with Stage 3 Mock LLM)', () => {
  afterAll(async () => { await closeBrowser(); });

  cases.forEach(({ name, html, expected }) => {
    it(`${name}: 골든 파일과 일치`, async () => {
      const input = fs.readFileSync(path.join(FIX_DIR, html), 'utf-8');
      const expectedXml = fs.readFileSync(path.join(GOLDEN_DIR, expected), 'utf-8');
      const mock = new MockLLMClient();
      mock.recordResponse(name, loadMockResponse(name));
      const actualXml = await convertHtmlToWebSquare(input, { llmClient: mock });
      expect(normalizeForCompare(actualXml)).toBe(normalizeForCompare(expectedXml));
    }, 60000);
  });
});
