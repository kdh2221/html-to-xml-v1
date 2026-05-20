/**
 * Stage 3.5 — schbox 입력 컴포넌트에 ref="data:dma_search.{KEY}" 바인딩.
 *
 * 매칭 우선순위 (각 DataMap key):
 *   1. key.boundComponentId (LLM 힌트)
 *   2. label == key.name 인 schbox field
 *   3. 위치 fallback (i번째 field)
 *   4. 다 실패 → skip
 *
 * 주의: 이 단계는 Phase 1 rename 이전 — 컴포넌트 id는 pre-rename(edt_/sel_).
 */
import { extractRegions } from './xml-region-parser';
import type { DataCollectionIR } from '../types';

const INPUT_TAGS = '(?:xf:input|xf:select1|xf:select|xf:textarea|xf:inputCalendar|w2:autoComplete)';

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 컴포넌트 여는 태그를 찾아 ref가 없으면 id 속성 뒤에 삽입. */
export function addRefToComponent(xml: string, componentId: string, refValue: string): string {
  const re = new RegExp(
    `(<${INPUT_TAGS}\\b[^>]*?\\bid="${escapeRegex(componentId)}")([^>]*?)(\\/?>)`,
  );
  return xml.replace(re, (full, head, mid, close) => {
    if (/\bref\s*=/.test(head) || /\bref\s*=/.test(mid)) return full;
    return `${head} ref="${refValue}"${mid}${close}`;
  });
}

export function bindRefs(xml: string, ir: DataCollectionIR): string {
  if (ir.dataMaps.length === 0) return xml;

  const regions = extractRegions(xml);
  const fields = regions
    .filter((r): r is Extract<typeof r, { kind: 'schbox' }> => r.kind === 'schbox')
    .flatMap(r => r.fields);

  let result = xml;
  for (const dm of ir.dataMaps) {
    dm.keys.forEach((key, i) => {
      let targetId = key.boundComponentId;
      if (!targetId) {
        const byLabel = fields.find(f => f.label === key.name);
        targetId = byLabel?.componentId ?? fields[i]?.componentId;
      }
      if (targetId) {
        result = addRefToComponent(result, targetId, `data:${dm.id}.${key.id}`);
      }
    });
  }
  return result;
}
