#!/usr/bin/env node
/**
 * CLI 엔트리: figma-to-ws <input.html> <output.xml> [--adaptive]
 */
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from './pipeline';
import { validateAntiPatterns } from './validate/anti-pattern-validator';
import { closeBrowser } from './dom-extractor';
import { LLMClient } from './stage3/llm-client';
import { CostTracker } from './stage3/cost-tracker';

async function main() {
  const args = process.argv.slice(2);
  const adaptive = args.includes('--adaptive');
  const noLlm = args.includes('--no-llm');
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length < 2) {
    console.error('Usage: figma-to-ws <input.html> <output.xml> [--adaptive] [--no-llm]');
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
    const xml = await convertHtmlToWebSquare(html, { adaptive, noLlm, llmClient });
    fs.writeFileSync(absOutput, xml, 'utf-8');
    console.log(`OK Wrote ${xml.length} chars`);
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
