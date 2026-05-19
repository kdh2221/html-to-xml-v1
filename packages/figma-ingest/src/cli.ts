#!/usr/bin/env node
/**
 * CLI 엔트리: figma-to-ws <input.html> <output.xml> [--adaptive]
 */
import * as fs from 'fs';
import * as path from 'path';
import { convertHtmlToWebSquare } from './pipeline';
import { closeBrowser } from './dom-extractor';

async function main() {
  const args = process.argv.slice(2);
  const adaptive = args.includes('--adaptive');
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length < 2) {
    console.error('Usage: figma-to-ws <input.html> <output.xml> [--adaptive]');
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
  console.log(`Converting ${absInput} -> ${absOutput} (adaptive=${adaptive})`);

  try {
    const xml = await convertHtmlToWebSquare(html, { adaptive });
    fs.writeFileSync(absOutput, xml, 'utf-8');
    console.log(`OK Wrote ${xml.length} chars`);
  } catch (e) {
    console.error('Conversion failed:', e);
    process.exit(1);
  } finally {
    await closeBrowser();
  }
}

main();
