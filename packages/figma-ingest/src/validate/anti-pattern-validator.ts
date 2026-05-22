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
