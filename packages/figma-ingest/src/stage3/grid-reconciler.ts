/**
 * Stage 3.5 — gridView를 DataList에 바인딩.
 *  1. <w2:gridView>에 dataList="data:{dlt_id}" 추가
 *  2. gBody 원본 컬럼 id로 최종 컬럼 id 시퀀스 결정 후 header/gBody에 동일 적용.
 *     - sourceBodyId 매칭(있으면): 원본 id → 해당 DataList 컬럼 id. 매칭 없는 컬럼(chk 등)은 원본 보존.
 *     - 어떤 원본 id도 sourceBodyId와 불일치하면: 위치순 fallback(레거시 동작).
 *
 * 단일 DataList 가정 (2B). 다중 DataList는 향후.
 */
import type { DataCollectionIR, DataListIR } from '../types';

/** gBody 원본 컬럼 id 목록으로 최종 id 시퀀스를 결정. */
function resolveColumnIds(origIds: string[], dl: DataListIR): string[] {
  const bySource = new Map<string, string>();
  for (const c of dl.columns) if (c.sourceBodyId) bySource.set(c.sourceBodyId, c.id);
  const anyMatch = origIds.some(id => bySource.has(id));
  if (!anyMatch) {
    // sourceBodyId 부재/불일치 → 위치순 fallback
    return origIds.map((_, i) => dl.columns[i]?.id ?? origIds[i]);
  }
  return origIds.map(orig => bySource.get(orig) ?? orig); // 매칭 없으면(chk) 원본 보존
}

/** 블록 내 <w2:column> id를 ids 시퀀스로 위치순 교체. */
function applyColumnIds(block: string, ids: string[]): string {
  let i = 0;
  return block.replace(
    /(<w2:column\b[^>]*?\bid=")[^"]*("[^>]*?\/?>)/g,
    (full, head, tail) => {
      const id = ids[i]; i++;
      return id != null ? `${head}${id}${tail}` : full;
    },
  );
}

export function reconcileGrids(xml: string, ir: DataCollectionIR): string {
  if (ir.dataLists.length === 0) return xml;
  const dl = ir.dataLists[0];

  return xml.replace(
    /(<w2:gridView\b)([^>]*)(>)([\s\S]*?)(<\/w2:gridView>)/g,
    (full, open, attrs, openClose, inner, closeTag) => {
      let newAttrs = attrs;
      if (!/\bdataList\s*=/.test(attrs)) newAttrs = `${attrs} dataList="data:${dl.id}"`;

      const gBodyM = inner.match(/<w2:gBody\b[^>]*>([\s\S]*?)<\/w2:gBody>/);
      const origIds = gBodyM
        ? [...gBodyM[1].matchAll(/<w2:column\b[^>]*?\bid="([^"]*)"/g)].map(m => m[1])
        : [];
      const ids = resolveColumnIds(origIds, dl);

      let newInner = inner.replace(
        /(<w2:header\b[^>]*>)([\s\S]*?)(<\/w2:header>)/,
        (m: string, h: string, body: string, c: string) => `${h}${applyColumnIds(body, ids)}${c}`,
      );
      newInner = newInner.replace(
        /(<w2:gBody\b[^>]*>)([\s\S]*?)(<\/w2:gBody>)/,
        (m: string, h: string, body: string, c: string) => `${h}${applyColumnIds(body, ids)}${c}`,
      );
      return `${open}${newAttrs}${openClose}${newInner}${closeTag}`;
    },
  );
}
