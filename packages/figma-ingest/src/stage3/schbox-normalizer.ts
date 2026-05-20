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

/**
 * 검색그룹 블록을 표준 schbox 구조로 변환.
 *  - 외곽 class tblbox→schbox, grp_search id 제거
 *  - w2tb.tbl을 schbox_inner#tbl_search로 래핑
 *  - 검색버튼을 폼에서 떼어 btn_schbox로 이동
 * 검색버튼 없으면 원본 반환 (no-op).
 */
export function transformSearchBlock(block: string): string {
  const { buttons, rest } = extractSearchButtons(block);
  if (buttons.length === 0) return block;

  // 1. 외곽 여는 태그: tblbox→schbox, grp_search id 제거
  let out = rest.replace(/^(<xf:group\b)([^>]*?)(>)/, (_full, open, attrs, close) => {
    let a = attrs as string;
    if (/class="/.test(a)) {
      a = a.replace(/class="([^"]*)"/, (_cm: string, cls: string) => {
        const classes = cls.split(/\s+/).map((c) => (c === 'tblbox' ? 'schbox' : c)).filter(Boolean);
        if (!classes.includes('schbox')) classes.push('schbox');
        return `class="${classes.join(' ')}"`;
      });
    } else {
      a = `${a} class="schbox"`;
    }
    a = a.replace(/\s*\bid="grp_search[^"]*"/, '');
    return `${open}${a}${close}`;
  });

  // 2. w2tb.tbl 그룹을 schbox_inner#tbl_search로 래핑
  const tblOpen = out.search(/<xf:group\b[^>]*\bclass="[^"]*\bw2tb\b[^"]*"[^>]*>/);
  if (tblOpen !== -1) {
    const tblEnd = findGroupEnd(out, tblOpen);
    if (tblEnd !== -1) {
      const tblBlock = out.slice(tblOpen, tblEnd);
      const wrapped = `<xf:group class="schbox_inner" id="tbl_search">${tblBlock}</xf:group>`;
      out = out.slice(0, tblOpen) + wrapped + out.slice(tblEnd);
    }
  }

  // 3. 블록 마지막 </xf:group>(외곽 schbox 닫기) 앞에 btn_schbox 삽입
  const btnSchbox = `<xf:group class="btn_schbox">${buttons.join('')}</xf:group>`;
  out = out.replace(/<\/xf:group>\s*$/, `${btnSchbox}</xf:group>`);

  return out;
}

/**
 * 모든 검색그룹(grp_search + 검색버튼)을 표준 schbox로 정규화.
 * 변환 후 grp_search id가 사라지므로 자연히 다음 그룹으로 진행.
 */
export function normalizeSchbox(xml: string): string {
  let result = xml;
  let searchFrom = 0;
  for (;;) {
    const sg = findSearchGroupBlock(result, searchFrom);
    if (!sg) break;
    const transformed = transformSearchBlock(sg.block);
    if (transformed === sg.block) {
      searchFrom = sg.end; // 변경 없음 — 무한루프 방지
      continue;
    }
    result = result.slice(0, sg.start) + transformed + result.slice(sg.end);
    searchFrom = sg.start + transformed.length;
  }
  return result;
}
