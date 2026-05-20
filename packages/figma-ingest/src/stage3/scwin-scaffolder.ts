/**
 * Stage 4 — 조회 흐름 scwin 핸들러 스캐폴딩.
 *
 * 최종 XML(Phase 1 rename + button-modifier + 2C-0 schbox 정규화 이후)에서
 * 조회버튼/바인딩 grid/submission/검색폼(tbl_search)을 탐지해
 * onpageload·{btn}_onclick·sbm_search_submitdone 핸들러를 생성한다.
 *
 * 탐지는 정규식(읽기), 편집은 문자열 치환 — schbox-normalizer와 동일하게 CDATA·포맷 보존.
 * (spec §3은 cheerio 읽기를 제안했으나, 단순 속성 조회라 정규식이 더 단순·일관·안전.)
 *
 * sbm_search·바인딩 grid 둘 다 없으면 no-op (빈 onpageload 유지 = Phase 0+1 회귀).
 */

export interface SearchButton { id: string; }
export interface BoundGrid { gridId: string; dltId: string; }

/** class 토큰에 정확히 "sch"를 가진 첫 xf:trigger의 id. */
export function detectSearchButton(xml: string): SearchButton | null {
  const re = /<xf:trigger\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0];
    const clsM = tag.match(/\bclass="([^"]*)"/);
    if (!clsM) continue;
    if (!clsM[1].split(/\s+/).includes('sch')) continue;
    const idM = tag.match(/\bid="([^"]+)"/);
    if (idM) return { id: idM[1] };
  }
  return null;
}

/** dataList="data:X" 를 가진 첫 w2:gridView의 {gridId, dltId}. */
export function detectBoundGrid(xml: string): BoundGrid | null {
  const re = /<w2:gridView\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const tag = m[0];
    const dlM = tag.match(/\bdataList="data:([^"]+)"/);
    const idM = tag.match(/\bid="([^"]+)"/);
    if (dlM && idM) return { gridId: idM[1], dltId: dlM[1] };
  }
  return null;
}

/** sbm_search submission 존재 여부. */
export function detectSubmission(xml: string): boolean {
  return /<xf:submission\b[^>]*\bid="sbm_search"/.test(xml);
}

/** 표준 schbox 검색폼(id="tbl_search")이 있으면 "tbl_search", 없으면 null. */
export function detectSearchContainer(xml: string): string | null {
  return /\bid="tbl_search"/.test(xml) ? 'tbl_search' : null;
}

export interface ScwinDetections {
  searchBtn: SearchButton | null;
  boundGrid: BoundGrid | null;
  hasSubmission: boolean;
  container: string | null;
}

/**
 * 탐지 결과로 scwin 핸들러 스크립트 본문 조립.
 *  - onpageload: setEnterKeyEvent(검색버튼+sbm+container 충족 시) + grid EV-01 2종(grid 시)
 *  - {btn}_onclick: 검색버튼+sbm 충족 시 ($c.sbm.execute)
 *  - sbm_search_submitdone: sbm 시 (stub)
 */
export function buildHandlerScript(d: ScwinDetections): string {
  const lines: string[] = [];
  if (d.searchBtn && d.hasSubmission && d.container) {
    lines.push(`\t$c.win.setEnterKeyEvent(${d.container}, scwin.${d.searchBtn.id}_onclick);`);
  }
  if (d.boundGrid) {
    lines.push(`\t$c.util.setGridViewDelCheckBox([${d.boundGrid.gridId}]);`);
    lines.push(`\t$c.data.setChangeCheckedDc([${d.boundGrid.dltId}]);`);
  }

  const body = lines.length ? `\n${lines.join('\n')}\n` : '\n';
  const blocks: string[] = [`scwin.onpageload = function() {${body}};`];

  if (d.searchBtn && d.hasSubmission) {
    blocks.push(`scwin.${d.searchBtn.id}_onclick = function() {\n\t$c.sbm.execute(sbm_search);\n};`);
  }
  if (d.hasSubmission) {
    blocks.push(`scwin.sbm_search_submitdone = function(e) {\n};`);
  }
  return blocks.join('\n');
}

/**
 * 빈 onpageload(`scwin.onpageload = function() {};`)를 핸들러 스크립트로 교체.
 * replacement에 $가 있으므로 replacer 함수로 치환($ 특수해석 회피). 매칭 없으면 원본.
 */
export function replaceOnpageload(xml: string, handlerScript: string): string {
  return xml.replace(/scwin\.onpageload = function\(\) \{\s*\};/, () => handlerScript);
}

/** 버튼 opening 태그에 ev:onclick 부여(이미 있으면 보존). */
export function injectButtonOnclick(xml: string, buttonId: string): string {
  const re = new RegExp(`(<xf:trigger\\b[^>]*\\bid="${buttonId}"[^>]*?)(\\s*>)`);
  return xml.replace(re, (full, head: string, tail: string) => {
    if (/\bev:onclick=/.test(head)) return full;
    return `${head} ev:onclick="scwin.${buttonId}_onclick"${tail}`;
  });
}
