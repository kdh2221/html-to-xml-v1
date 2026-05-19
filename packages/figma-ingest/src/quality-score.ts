import * as cheerio from 'cheerio';
import type { QualityScore } from './types';

const SEMANTIC_TAGS = new Set([
  'input', 'select', 'button', 'textarea', 'table', 'form',
  'fieldset', 'label', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'nav',
  'header', 'footer', 'main', 'section', 'article', 'aside',
]);

const INTERACTIVE_TAGS = new Set([
  'input', 'select', 'button', 'textarea', 'a',
]);

export function computeQualityScore(html: string): QualityScore {
  const $ = cheerio.load(html);
  const allElements = $('body *').toArray();
  const totalCount = allElements.length;

  if (totalCount === 0) {
    return { overall: 0, semanticRatio: 0, labelIdRatio: 0, ariaRatio: 0 };
  }

  let semanticCount = 0;
  let interactiveCount = 0;
  let ariaUsedCount = 0;

  for (const el of allElements) {
    const tag = (el as any).tagName?.toLowerCase();
    if (!tag) continue;
    if (SEMANTIC_TAGS.has(tag)) semanticCount++;
    if (INTERACTIVE_TAGS.has(tag)) interactiveCount++;
    const attrs = (el as any).attribs || {};
    const hasAria = Object.keys(attrs).some(a => a.startsWith('aria-') || a === 'role');
    if (hasAria) ariaUsedCount++;
  }

  const semanticRatio = semanticCount / totalCount;

  // label-id 페어링: input/select/textarea 마다 연관 label 존재 여부
  let inputCount = 0, labeledCount = 0;
  $('input, select, textarea').each((_, el) => {
    inputCount++;
    const id = $(el).attr('id');
    if (id && $(`label[for="${id}"]`).length > 0) {
      labeledCount++;
    } else if ($(el).attr('aria-label') || $(el).attr('aria-labelledby')) {
      labeledCount++;
    }
  });
  const labelIdRatio = inputCount === 0 ? 0 : labeledCount / inputCount;

  // ARIA 사용률: 인터랙티브 요소 대비 ARIA 속성/role 사용
  const ariaRatio = interactiveCount === 0 ? 0 : ariaUsedCount / Math.max(interactiveCount, 1);

  const overall = (semanticRatio + labelIdRatio + Math.min(ariaRatio, 1)) / 3;

  return {
    overall: Math.min(1, overall),
    semanticRatio,
    labelIdRatio,
    ariaRatio: Math.min(1, ariaRatio),
  };
}
