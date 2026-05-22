/**
 * Phase 3A — 최종 XML의 deepsquare 안티패턴 정적 검출 (순수·non-throw·XML 불변).
 * 각 위반은 remediation(올바른 대안)을 동반한다. 탐지는 cheerio(구조) + 정규식(script).
 */
import * as cheerio from 'cheerio';

export interface Violation {
  rule: string;
  severity: 'critical' | 'warning';
  message: string;
  remediation: string;
  location?: string;
}

/** cheerio가 보존하는 태그 원형(`w2:gridView`)을 소문자로 정규화해 비교. */
function tagNameOf(el: unknown): string {
  const node = el as { tagName?: string; name?: string };
  return (node.tagName ?? node.name ?? '').toLowerCase();
}

function byTag($: cheerio.CheerioAPI, root: cheerio.Cheerio<any> | null, tag: string) {
  const scope = root ?? $.root();
  return scope.find('*').filter((_, el) => tagNameOf(el) === tag);
}

/** #8: 컴포넌트 id 중복 (w2:column/w2:key 데이터 네임스페이스 제외). */
export function checkDuplicateIds(xml: string): Violation[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const counts = new Map<string, number>();
  $('[id]').each((_, el) => {
    const tag = tagNameOf(el);
    if (tag === 'w2:column' || tag === 'w2:key') return;
    const id = $(el).attr('id');
    if (!id) return;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  });
  const out: Violation[] = [];
  for (const [id, n] of counts) {
    if (n >= 2) out.push({
      rule: 'ANTI-08', severity: 'critical',
      message: `컴포넌트 id "${id}"가 ${n}회 선언됨 (화면 전체에서 유일해야 함)`,
      remediation: '조회/상세 등 같은 필드는 접미사로 구분 (예: ibx_empNm vs ibx_empNmDetail)',
      location: id,
    });
  }
  return out;
}

/** #9: gridView header/gBody 컬럼 1:1 (개수·id). */
export function checkGridColumns(xml: string): Violation[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out: Violation[] = [];
  byTag($, null, 'w2:gridview').each((_, grid) => {
    const $grid = $(grid);
    const gridId = $grid.attr('id') || '(no id)';
    const colIds = (containerTag: string): string[] => {
      const container = byTag($, $grid, containerTag).first();
      if (container.length === 0) return [];
      return byTag($, container, 'w2:column').toArray().map(c => $(c).attr('id') || '');
    };
    const header = colIds('w2:header');
    const body = colIds('w2:gbody');
    if (header.length !== body.length) {
      out.push({ rule: 'ANTI-09', severity: 'critical',
        message: `GridView ${gridId}: header 컬럼 ${header.length}개 vs gBody ${body.length}개 불일치`,
        remediation: 'header와 gBody 컬럼은 1:1로 일치 (개수·id 동일)', location: gridId });
    } else if (header.join(',') !== body.join(',')) {
      out.push({ rule: 'ANTI-09', severity: 'critical',
        message: `GridView ${gridId}: header/gBody 컬럼 id 불일치 (${header.join(',')} vs ${body.join(',')})`,
        remediation: 'header/gBody column id는 동일 데이터 컬럼 id', location: gridId });
    }
  });
  return out;
}

/** #10: submission ref/target이 dataCollection에 선언됨. */
export function checkSubmissionRefs(xml: string): Violation[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const declared = new Set<string>();
  $('[id]').each((_, el) => {
    const tag = tagNameOf(el);
    if (tag === 'w2:datamap' || tag === 'w2:datalist') {
      const id = $(el).attr('id');
      if (id) declared.add(id);
    }
  });
  const out: Violation[] = [];
  byTag($, null, 'xf:submission').each((_, sub) => {
    const $sub = $(sub);
    const subId = $sub.attr('id') || '(no id)';
    for (const attr of ['ref', 'target']) {
      const v = $sub.attr(attr);
      if (!v) continue;
      const m = v.match(/^data:(?:json,)?([^.,\s"]+)/);
      if (!m) continue;
      if (!declared.has(m[1])) {
        out.push({ rule: 'ANTI-10', severity: 'critical',
          message: `submission ${subId}의 ${attr} "${m[1]}"가 dataCollection에 미선언`,
          remediation: 'ref/target이 참조하는 DataMap/DataList를 동일 파일 w2:dataCollection에 선언',
          location: `${subId}→${m[1]}` });
      }
    }
  });
  return out;
}

/** <script> CDATA 본문들을 합쳐 반환 (script 룰 입력). */
function scriptBodies(xml: string): string {
  return (xml.match(/<script\b[^>]*>[\s\S]*?<\/script>/g) || []).join('\n');
}

/** #2: scwin 핸들러가 await 사용하나 async 없음 (SyntaxError). 핸들러는 `\n};`로 끝나는 형식 가정. */
export function checkAsyncAwait(xml: string): Violation[] {
  const s = scriptBodies(xml);
  const out: Violation[] = [];
  const re = /scwin\.(\w+)\s*=\s*(async\s+)?function\b[^{]*\{([\s\S]*?)\n\};/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (!m[2] && /\bawait\b/.test(m[3])) {
      out.push({ rule: 'ANTI-02', severity: 'critical',
        message: `scwin.${m[1]}: await 사용하나 async 선언 없음 (SyntaxError)`,
        remediation: 'await가 있으면 함수에 async: scwin.fn = async function() {...}', location: m[1] });
    }
  }
  return out;
}

/** #1: 금지 프레임워크/브라우저 API. */
export function checkForbiddenApi(xml: string): Violation[] {
  const s = scriptBodies(xml);
  const out: Violation[] = [];
  const pats: Array<[RegExp, string]> = [
    [/\$p\.getComponentById\s*\(/, '$p.getComponentById'],
    [/document\.(?:getElementById|querySelector)\s*\(/, 'document.*'],
    [/\baddEventListener\s*\(/, 'addEventListener'],
  ];
  for (const [re, label] of pats) {
    if (re.test(s)) out.push({ rule: 'ANTI-01', severity: 'warning',
      message: `금지된 프레임워크/브라우저 API: ${label}`,
      remediation: '$c.util.getComponent(...) / ev: 속성 이벤트 사용 (브라우저 전역 API 금지)', location: label });
  }
  return out;
}

/** #3: $c.win. 접두 없는 bare confirm(/alert(. */
export function checkDirectDialog(xml: string): Violation[] {
  const s = scriptBodies(xml);
  const out: Violation[] = [];
  const re = /(?:^|[^.\w])(confirm|alert)\s*\(/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    out.push({ rule: 'ANTI-03', severity: 'warning',
      message: `브라우저 내장 ${m[1]}() 직접 호출`,
      remediation: 'await $c.win.confirm/alert($c.data.getMessage("MSG_CM_*")) 사용', location: m[1] });
  }
  return out;
}

const ALLOWED_EV = new Set(['onclick', 'onpageload', 'submitdone', 'oncellclick', 'oncelldblclick', 'onrowindexchange', 'ontabindexchange', 'onviewchange']);
/** #4: 허용목록 외 ev: 이벤트. */
export function checkEventNames(xml: string): Violation[] {
  const out: Violation[] = [];
  const re = /\bev:([a-zA-Z]+)\s*=/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const name = m[1].toLowerCase();
    if (ALLOWED_EV.has(name) || seen.has(name)) continue;
    seen.add(name);
    out.push({ rule: 'ANTI-04', severity: 'warning',
      message: `허용되지 않은 ev: 이벤트 "ev:${m[1]}"`,
      remediation: '정확한 이벤트명만 (oncellclick/onrowindexchange/ontabindexchange 등). onrowclick/onclose 환각 금지', location: m[1] });
  }
  return out;
}

/** #11: gridView header column inputType은 text/checkbox만. */
export function checkHeaderInputType(xml: string): Violation[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out: Violation[] = [];
  byTag($, null, 'w2:header').each((_, header) => {
    byTag($, $(header), 'w2:column').each((_2, col) => {
      const it = $(col).attr('inputType');
      if (it && it !== 'text' && it !== 'checkbox') {
        out.push({ rule: 'ANTI-11', severity: 'warning',
          message: `GridView header column inputType="${it}" (text/checkbox만 허용)`,
          remediation: 'header column inputType은 text 또는 checkbox만', location: it });
      }
    });
  });
  return out;
}

/** #15: script에 .reform( (취소엔 undoGridView). */
export function checkCancelReform(xml: string): Violation[] {
  if (/\.reform\s*\(/.test(scriptBodies(xml))) {
    return [{ rule: 'ANTI-15', severity: 'warning',
      message: 'script에서 .reform() 사용 (취소/원복엔 부적합)',
      remediation: '취소·변경 원복에는 $c.data.undoGridView(grdObj). reform()은 서버 재조회 전 dirty 제거용만', location: 'reform' }];
  }
  return [];
}

/** 9개 룰 합산. */
export function validateAntiPatterns(xml: string): Violation[] {
  return [
    ...checkDuplicateIds(xml),
    ...checkGridColumns(xml),
    ...checkSubmissionRefs(xml),
    ...checkAsyncAwait(xml),
    ...checkForbiddenApi(xml),
    ...checkDirectDialog(xml),
    ...checkEventNames(xml),
    ...checkHeaderInputType(xml),
    ...checkCancelReform(xml),
  ];
}
