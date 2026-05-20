/**
 * Stage 2.5 — synthetic 검색그룹(tblbox#grp_search)을 WRM 표준 schbox 구조로 재구성.
 *
 * cheerio 전체 재직렬화는 버튼 라벨 CDATA를 깨뜨릴 위험이 있어, balanced 매칭 +
 * 문자열 수술로 검색그룹 substring만 변환한다 (CDATA·나머지 문서 포맷 보존).
 *
 * Stage 2.5는 Phase 1 rename/button-modifier 이전 → 버튼에 btn_cm sch 없음 →
 * 라벨 텍스트(조회/검색/초기화)로 검색버튼 탐지.
 */

const SEARCH_LABELS = /조회|검색|초기화/;

export interface SearchGroup {
  start: number;
  end: number;   // 매칭 </xf:group> 직후 인덱스
  block: string; // xml.slice(start, end)
}

/**
 * openStart: <xf:group 여는 태그가 시작하는 인덱스.
 * 매칭되는 </xf:group> 직후 인덱스 반환. 불균형이면 -1.
 */
export function findGroupEnd(xml: string, openStart: number): number {
  const tagRe = /<xf:group\b[^>]*?(\/?)>|<\/xf:group>/g;
  tagRe.lastIndex = openStart;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(xml)) !== null) {
    if (m[0] === '</xf:group>') {
      depth--;
      if (depth === 0) return tagRe.lastIndex;
      if (depth < 0) return -1;
    } else if (m[1] !== '/') {
      depth++;
    }
    // self-closing(<xf:group .../>)은 depth 불변
  }
  return -1;
}

export function hasSearchButton(block: string): boolean {
  const triggers = block.match(/<xf:trigger\b[\s\S]*?<\/xf:trigger>/g) || [];
  return triggers.some(t => SEARCH_LABELS.test(t));
}

/**
 * grp_search id를 가지면서 검색버튼(조회/검색/초기화)을 포함하는 첫 그룹을 찾는다.
 * fromIndex부터 스캔.
 */
export function findSearchGroupBlock(xml: string, fromIndex = 0): SearchGroup | null {
  const openRe = /<xf:group\b[^>]*\bid="grp_search[^"]*"[^>]*>/g;
  openRe.lastIndex = fromIndex;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(xml)) !== null) {
    const start = m.index;
    const end = findGroupEnd(xml, start);
    if (end === -1) continue;
    const block = xml.slice(start, end);
    if (hasSearchButton(block)) {
      return { start, end, block };
    }
  }
  return null;
}

/**
 * 블록에서 검색버튼(조회/검색/초기화 trigger)을 추출하고, 폼에서 제거한 나머지를 반환.
 */
export function extractSearchButtons(block: string): { buttons: string[]; rest: string } {
  const buttons: string[] = [];
  const rest = block.replace(/<xf:trigger\b[\s\S]*?<\/xf:trigger>/g, (t) => {
    if (SEARCH_LABELS.test(t)) {
      buttons.push(t.trim());
      return '';
    }
    return t;
  });
  return { buttons, rest };
}
