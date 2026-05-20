/**
 * Stage 3.5 — master-detail 상세영역 입력을 grid의 DataList에 바인딩.
 *
 * 상세 테이블 = 조회버튼이 없는 최외곽 폼 영역(다른 schbox/tblbox에 비중첩).
 * 검색영역(조회버튼 보유)은 2B ref-binder가 dma_search에 바인딩하므로 제외.
 * 라벨 → DataList 컬럼명 매칭으로 ref="data:{dltId}.{colId}" 주입.
 *
 * 탐지는 cheerio(읽기), 편집은 ref-binder의 addRefToComponent(문자열 치환) 재사용.
 * Stage 3.5(rename·button-modifier 이전) → pre-rename id, 조회버튼은 라벨로 탐지.
 */
import * as cheerio from 'cheerio';
import { hasSearchButton } from './schbox-normalizer';
import { addRefToComponent } from './ref-binder';
import type { DataCollectionIR, DataListColumnIR } from '../types';

export interface DetailInput { id: string; label: string; }

const INPUT_TAGS = ['xf:input', 'xf:select1', 'xf:select', 'xf:textarea', 'xf:inputcalendar', 'w2:autocomplete'];

/** cheerio 가 보존하는 태그 원형(`xf:input` 등)과 비교. 대소문자 무시. */
function tagNameOf(el: unknown): string {
  const node = el as { tagName?: string; name?: string };
  return (node.tagName ?? node.name ?? '').toLowerCase();
}

/** class 토큰에 schbox 또는 tblbox 가 있으면 폼 영역. */
function isFormRegion(classAttr: string | undefined): boolean {
  const cls = (classAttr ?? '').split(/\s+/);
  return cls.includes('schbox') || cls.includes('tblbox');
}

/**
 * 조회버튼 없는 최외곽 폼 영역의 상세 입력(id+label)을 수집.
 * 검색영역(조회버튼 보유)·중첩 영역은 제외. id+label 둘 다 있는 입력만.
 */
export function detectDetailInputs(xml: string): DetailInput[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const seen = new Set<string>();
  const result: DetailInput[] = [];

  $('[class]').each((_, el) => {
    const $el = $(el);
    if (!isFormRegion($el.attr('class'))) return;
    // 최외곽 폼 영역만 (다른 schbox/tblbox 에 중첩되지 않음)
    const nested = $el.parents().toArray().some(p => isFormRegion($(p).attr('class')));
    if (nested) return;
    // 검색영역(조회버튼 보유) 제외 — 영역 전체(형제 btn_schbox 포함)를 본다
    if (hasSearchButton($.xml($el))) return;
    // 상세 입력 수집
    $el.find('*').each((_2, node) => {
      if (!INPUT_TAGS.includes(tagNameOf(node))) return;
      const id = $(node).attr('id');
      const label = $(node).attr('label');
      if (id && label && !seen.has(id)) {
        seen.add(id);
        result.push({ id, label });
      }
    });
  });
  return result;
}

/** DataList 컬럼 중 name === label인 컬럼 id. 없으면 null. */
export function matchColumn(label: string, columns: DataListColumnIR[]): string | null {
  const col = columns.find(c => c.name === label);
  return col ? col.id : null;
}

/**
 * 상세 입력을 (IR의 첫) DataList 컬럼에 ref 바인딩.
 * DataList 없거나 상세 입력 없으면 no-op. 라벨 불일치 입력은 생략.
 */
export function bindDetailTables(xml: string, ir: DataCollectionIR): string {
  const dlt = ir.dataLists[0];
  if (!dlt) return xml;
  const inputs = detectDetailInputs(xml);
  if (inputs.length === 0) return xml;

  let result = xml;
  for (const inp of inputs) {
    const colId = matchColumn(inp.label, dlt.columns);
    if (colId) {
      result = addRefToComponent(result, inp.id, `data:${dlt.id}.${colId}`);
    }
  }
  return result;
}
