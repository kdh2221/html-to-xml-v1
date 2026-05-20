/**
 * Stage 3.5 — gridView를 DataList에 바인딩.
 *  1. <w2:gridView>에 dataList="data:{dlt_id}" 추가
 *  2. header / gBody 컬럼 id를 DataList 컬럼 id로 위치순 정렬
 *     (DataList 컬럼은 LLM이 grid header 순서대로 생성하므로 위치 정렬이 정합)
 *
 * 단일 DataList 가정 (2B). 다중 DataList는 향후.
 */
import type { DataCollectionIR, DataListIR } from '../types';

/** 한 블록(header row 또는 gBody row) 내 <w2:column>의 id를 위치순으로 교체. */
function rewriteColumnIds(block: string, dl: DataListIR): string {
  let i = 0;
  return block.replace(
    /(<w2:column\b[^>]*?\bid=")[^"]*("[^>]*?\/?>)/g,
    (full, head, tail) => {
      const col = dl.columns[i];
      i++;
      if (!col) return full;
      return `${head}${col.id}${tail}`;
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
      if (!/\bdataList\s*=/.test(attrs)) {
        newAttrs = `${attrs} dataList="data:${dl.id}"`;
      }
      let newInner = inner.replace(
        /(<w2:header\b[^>]*>)([\s\S]*?)(<\/w2:header>)/,
        (m: string, h: string, body: string, c: string) => `${h}${rewriteColumnIds(body, dl)}${c}`,
      );
      newInner = newInner.replace(
        /(<w2:gBody\b[^>]*>)([\s\S]*?)(<\/w2:gBody>)/,
        (m: string, h: string, body: string, c: string) => `${h}${rewriteColumnIds(body, dl)}${c}`,
      );
      return `${open}${newAttrs}${openClose}${newInner}${closeTag}`;
    },
  );
}
