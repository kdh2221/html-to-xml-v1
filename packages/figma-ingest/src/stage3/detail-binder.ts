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

/** cheerio 는 태그 대소문자를 보존(예: `xf:inputCalendar`) → 소문자로 정규화해 INPUT_TAGS(소문자)와 비교. */
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
  // 2C-3: 상세 region에 grp_detail 부여 + 키 컬럼(첫 컬럼) 입력 mandatory
  // (ref 주입 전에 mandatory를 먼저 부여 → ref가 id 바로 뒤에 위치, mandatory는 그 뒤로 밀림)
  result = assignDetailGroupId(result, inputs[0].id);
  const keyName = dlt.columns[0]?.name;
  const keyInput = inputs.find(inp => inp.label === keyName);
  if (keyInput) {
    result = markMandatory(result, keyInput.id);
  }
  for (const inp of inputs) {
    const colId = matchColumn(inp.label, dlt.columns);
    if (colId) {
      result = addRefToComponent(result, inp.id, `data:${dlt.id}.${colId}`);
    }
  }
  return result;
}

const MANDATORY_INPUT_TAGS = '(?:xf:input|xf:select1|xf:select|xf:textarea|xf:inputCalendar|w2:autoComplete)';

/** 입력 태그(id)에 mandatory="true" 부여(없을 때만). */
export function markMandatory(xml: string, id: string): string {
  const re = new RegExp(`(<${MANDATORY_INPUT_TAGS}\\b[^>]*?\\bid="${id}")([^>]*?)(\\/?>)`);
  return xml.replace(re, (full, head: string, mid: string, close: string) => {
    if (/\bmandatory\s*=/.test(head) || /\bmandatory\s*=/.test(mid)) return full;
    return `${head} mandatory="true"${mid}${close}`;
  });
}

/**
 * 키 입력(id)을 감싸는 최근접 폼영역(<xf:group ...schbox|tblbox...>) 여는 태그에
 * id="grp_detail" 부여. 이미 있으면 그대로. (역방향 스캔 — cheerio 재직렬화 회피)
 */
export function assignDetailGroupId(xml: string, keyInputId: string): string {
  const inputIdx = xml.indexOf(`id="${keyInputId}"`);
  if (inputIdx === -1) return xml;
  const regionRe = /<xf:group\b[^>]*\bclass="[^"]*\b(?:schbox|tblbox)\b[^"]*"[^>]*>/g;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = regionRe.exec(xml)) !== null) {
    if (m.index > inputIdx) break;
    lastMatch = m;
  }
  if (!lastMatch) return xml;
  const openTag = lastMatch[0];
  if (/\bid="grp_detail"/.test(openTag)) return xml;
  const newTag = /\bid="[^"]*"/.test(openTag)
    ? openTag.replace(/\bid="[^"]*"/, 'id="grp_detail"')
    : openTag.replace(/(<xf:group\b)/, '$1 id="grp_detail"');
  return xml.slice(0, lastMatch.index) + newTag + xml.slice(lastMatch.index + openTag.length);
}
