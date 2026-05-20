/**
 * Mock LLM으로 골든 XML 재생성.
 * 사용: corepack pnpm --filter @kdh/figma-ingest test:golden:regenerate
 */
import * as fs from 'fs';
import * as path from 'path';
// NOTE: dist/ 빌드 산출물에서 import. src/ 를 tsx로 직접 실행하면 esbuild의 keepNames가
// page.evaluate()로 직렬화되는 중첩 함수에 __name 헬퍼를 주입해 브라우저 컨텍스트에서
// "__name is not defined" 런타임 에러가 난다. 빌드된 dist는 이 문제가 없으므로
// regenerate 전에 반드시 build를 먼저 실행한다 (test:golden:regenerate는 build 의존).
import { convertHtmlToWebSquare } from '../dist/pipeline';
import { closeBrowser } from '../dist/dom-extractor';
import { MockLLMClient } from '../dist/stage3/llm-mock';
import type { DataCollectionIR } from '../dist/types';

const FIX_DIR = path.join(__dirname, '..', 'tests', 'fixtures');
const GOLDEN_DIR = path.join(__dirname, '..', 'tests', 'golden');

const cases = [
  { name: 'simple-form', html: 'simple-form.html', expected: 'simple-form.expected.xml' },
  { name: 'search-grid', html: 'search-grid.html', expected: 'search-grid.expected.xml' },
  { name: 'master-detail', html: 'master-detail.html', expected: 'master-detail.expected.xml' },
];

function loadMockResponse(name: string): DataCollectionIR {
  return JSON.parse(fs.readFileSync(
    path.join(FIX_DIR, 'llm-responses', `${name}.json`), 'utf-8'
  ));
}

async function main() {
  for (const { name, html, expected } of cases) {
    const inputPath = path.join(FIX_DIR, html);
    const outputPath = path.join(GOLDEN_DIR, expected);
    console.log(`Regenerating ${name} → ${outputPath}`);
    const inputHtml = fs.readFileSync(inputPath, 'utf-8');
    const mock = new MockLLMClient();
    mock.recordResponse(name, loadMockResponse(name));
    const xml = await convertHtmlToWebSquare(inputHtml, { llmClient: mock });
    fs.writeFileSync(outputPath, xml, 'utf-8');
    console.log(`  ✓ ${xml.length} chars`);
  }
  await closeBrowser();
}

main().catch(e => { console.error(e); process.exit(1); });
