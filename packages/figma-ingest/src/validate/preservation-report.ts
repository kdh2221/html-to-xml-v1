/**
 * Phase 4 — 변환 보존 리포트 (순수·non-throw·렌더링 없음).
 * 입력 추출(Stage 0)의 의미 요소(field/button/gridColumn) 라벨이 최종 XML에
 * 보존됐는지 multiset diff로 측정. 출력 픽셀 렌더는 WebSquare 엔진 필요로 범위 외.
 */
import * as cheerio from 'cheerio';
import type { ExtractionResult, LegacyCtype } from '../types';

export type LostFamily = 'field' | 'button' | 'gridColumn';
export interface LostItem { family: LostFamily; label: string; }
export interface PreservationReport {
  total: number;
  preserved: number;
  rate: number;
  lost: LostItem[];
}

const FIELD_CTYPES: LegacyCtype[] = ['Edit', 'SelectBox', 'Calendar', 'CheckBox', 'Radio', 'TextArea'];
const FIELD_TAGS = ['xf:input', 'xf:select1', 'xf:select', 'xf:inputcalendar', 'xf:textarea'];

function tagNameOf(el: unknown): string {
  const node = el as { tagName?: string; name?: string };
  return (node.tagName ?? node.name ?? '').toLowerCase();
}

/** 라벨 배열 → trim + 빈 제거 후 multiset. */
function toMultiset(labels: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const raw of labels) {
    const l = raw.trim();
    if (!l) continue;
    m.set(l, (m.get(l) ?? 0) + 1);
  }
  return m;
}

/** 입력 multiset − 출력 multiset = 유실 라벨. */
export function multisetLost(input: string[], output: string[]): string[] {
  const inM = toMultiset(input);
  const outM = toMultiset(output);
  const lost: string[] = [];
  for (const [label, n] of inM) {
    const remaining = n - (outM.get(label) ?? 0);
    for (let i = 0; i < remaining; i++) lost.push(label);
  }
  return lost;
}

export function extractOutputFieldLabels(xml: string): string[] {
  const out: string[] = [];
  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    $('[label]').each((_, el) => {
      if (FIELD_TAGS.includes(tagNameOf(el))) {
        const l = $(el).attr('label');
        if (l) out.push(l);
      }
    });
  } catch { /* non-throw */ }
  return out;
}

export function extractOutputButtonLabels(xml: string): string[] {
  const out: string[] = [];
  const re = /<xf:trigger\b[\s\S]*?<\/xf:trigger>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const lbl = m[0].match(/<xf:label>\s*<!\[CDATA\[([^\]]*)\]\]>\s*<\/xf:label>/);
    if (lbl) out.push(lbl[1]);
  }
  return out;
}

export function extractOutputGridColumnLabels(xml: string): string[] {
  const out: string[] = [];
  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    $('*').filter((_, el) => tagNameOf(el) === 'w2:header').each((_, header) => {
      $(header).find('*').filter((_2, c) => tagNameOf(c) === 'w2:column').each((_2, col) => {
        const v = $(col).attr('value');
        if (v) out.push(v);
      });
    });
  } catch { /* non-throw */ }
  return out;
}

function inputFieldLabels(e: ExtractionResult): string[] {
  return e.components.filter(c => FIELD_CTYPES.includes(c.ctype)).map(c => c.label);
}
function inputButtonLabels(e: ExtractionResult): string[] {
  // Button·Trigger 둘 다 출력에선 xf:trigger로 렌더 → 입력 측도 동일 패밀리로 묶어 대칭 유지.
  return e.components.filter(c => c.ctype === 'Button' || c.ctype === 'Trigger').map(c => c.label);
}
function inputGridColumnLabels(e: ExtractionResult): string[] {
  return e.components.filter(c => c.ctype === 'GridView').flatMap(c => (c.columns ?? []).map(col => col.label));
}

export function computePreservation(extraction: ExtractionResult, finalXml: string): PreservationReport {
  const families: Array<{ family: LostFamily; input: string[]; output: string[] }> = [
    { family: 'field', input: inputFieldLabels(extraction), output: extractOutputFieldLabels(finalXml) },
    { family: 'button', input: inputButtonLabels(extraction), output: extractOutputButtonLabels(finalXml) },
    { family: 'gridColumn', input: inputGridColumnLabels(extraction), output: extractOutputGridColumnLabels(finalXml) },
  ];
  const lost: LostItem[] = [];
  let total = 0;
  for (const f of families) {
    total += f.input.map(s => s.trim()).filter(Boolean).length;
    for (const label of multisetLost(f.input, f.output)) lost.push({ family: f.family, label });
  }
  const preserved = total - lost.length;
  return { total, preserved, rate: total > 0 ? preserved / total : 1, lost };
}
