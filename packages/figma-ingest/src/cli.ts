#!/usr/bin/env node
/**
 * CLI 엔트리: figma-to-ws <input.html> <output.xml> [--adaptive]
 */
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from './pipeline';
import { validateAntiPatterns } from './validate/anti-pattern-validator';
import type { PreservationReport } from './validate/preservation-report';
import { closeBrowser, captureInputScreenshot } from './dom-extractor';
import { LLMClient } from './stage3/llm-client';
import { CostTracker } from './stage3/cost-tracker';

async function main() {
  const args = process.argv.slice(2);
  const adaptive = args.includes('--adaptive');
  const noLlm = args.includes('--no-llm');
  const shotIdx = args.indexOf('--screenshot');
  const screenshotPath = shotIdx >= 0 ? args[shotIdx + 1] : null;
  const positional = args.filter((a, i) => !a.startsWith('--') && !(shotIdx >= 0 && i === shotIdx + 1));

  if (positional.length < 2) {
    console.error('Usage: figma-to-ws <input.html> <output.xml> [--adaptive] [--no-llm] [--screenshot <path>]');
    process.exit(1);
  }

  const [inputPath, outputPath] = positional;
  const absInput = path.resolve(inputPath);
  const absOutput = path.resolve(outputPath);

  if (!fs.existsSync(absInput)) {
    console.error(`Input not found: ${absInput}`);
    process.exit(1);
  }

  const html = fs.readFileSync(absInput, 'utf-8');
  console.log(`Converting ${absInput} -> ${absOutput} (adaptive=${adaptive}, noLlm=${noLlm})`);

  let tracker: CostTracker | null = null;
  let llmClient: LLMClient | undefined = undefined;
  if (!noLlm) {
    tracker = new CostTracker();
    try {
      llmClient = new LLMClient({ tracker });
    } catch (e) {
      console.error(`LLM client 초기화 실패 — --no-llm 모드로 진행: ${(e as Error).message}`);
      llmClient = undefined;
    }
  }

  try {
    let preservation: PreservationReport | null = null;
    const xml = await convertHtmlToWebSquare(html, {
      adaptive, noLlm, llmClient,
      onStage: (n, p) => { if (n === 'preservation') preservation = p as PreservationReport; },
    });
    fs.writeFileSync(absOutput, xml, 'utf-8');
    console.log(`OK Wrote ${xml.length} chars`);
    if (preservation) {
      const r = preservation as PreservationReport;
      console.log(`📐 보존율 ${(r.rate * 100).toFixed(1)}% (${r.preserved}/${r.total})`);
      if (r.lost.length) {
        console.warn(`⚠️  유실 ${r.lost.length}건:`);
        for (const l of r.lost) console.warn(`  [${l.family}] ${l.label}`);
      }
    }
    const violations = validateAntiPatterns(xml);
    if (violations.length) {
      const crit = violations.filter(v => v.severity === 'critical').length;
      console.warn(`\n⚠️  안티패턴 ${violations.length}건 (critical ${crit})`);
      for (const v of violations) {
        console.warn(`  [${v.severity.toUpperCase()}] ${v.rule}${v.location ? ' ' + v.location : ''} — ${v.message}`);
        console.warn(`        ↳ 대안: ${v.remediation}`);
      }
    } else {
      console.log('✅ 안티패턴 검증 통과 (위반 0)');
    }
    if (screenshotPath) {
      const png = await captureInputScreenshot(html);
      fs.writeFileSync(path.resolve(screenshotPath), png);
      console.log(`🖼️  입력 스크린샷 저장: ${path.resolve(screenshotPath)}`);
    }
    if (tracker) {
      const total = tracker.getTotal();
      console.log(`💰 LLM 비용 (이번 conversion): $${total.toFixed(4)}`);
      if (tracker.checkConversionThreshold() === 'warn') {
        console.warn(`⚠️  비용이 단일 conversion 경고 임계값 초과`);
      }
    }
  } catch (e) {
    console.error('Conversion failed:', e);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

main();
