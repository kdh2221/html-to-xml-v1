/**
 * Live API smoke test — 실제 Anthropic API 호출.
 * 기본 SKIP. 실행하려면: ANTHROPIC_API_KEY 설정 + LIVE_LLM=true.
 *   (PowerShell)  $env:LIVE_LLM="true"; $env:ANTHROPIC_API_KEY="sk-..."; pnpm --filter @kdh/figma-ingest test live-llm
 */
import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from '../../src/pipeline';
import { closeBrowser } from '../../src/dom-extractor';
import { LLMClient } from '../../src/stage3/llm-client';
import { CostTracker } from '../../src/stage3/cost-tracker';

const LIVE = process.env.LIVE_LLM === 'true' && !!process.env.ANTHROPIC_API_KEY;
const FIX_DIR = path.join(__dirname, '..', 'fixtures');

describe.skipIf(!LIVE)('LIVE LLM smoke (real Anthropic API)', () => {
  afterAll(async () => { await closeBrowser(); });

  it('simple-form: 실제 LLM이 DataCollection 추론', async () => {
    const tracker = new CostTracker();
    const client = new LLMClient({ tracker });
    const html = fs.readFileSync(path.join(FIX_DIR, 'simple-form.html'), 'utf-8');

    const xml = await convertHtmlToWebSquare(html, { llmClient: client });

    // 실제 LLM 출력은 정확한 ID를 보장 못하므로 구조만 검증
    expect(xml).toMatch(/<w2:dataMap id="dma_[a-zA-Z0-9_]+"/);
    expect(xml).toMatch(/<w2:dataList id="dlt_[a-zA-Z0-9_]+"/);
    // 비용 출력
    console.log(`Live LLM 비용: $${tracker.getTotal().toFixed(4)}`);
    expect(tracker.getTotal()).toBeGreaterThan(0);
    expect(tracker.getTotal()).toBeLessThan(0.20);  // §9.6 비용 상한
  }, 60000);
});
