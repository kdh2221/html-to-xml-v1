/**
 * Stage 2 출력 XML에서 schbox/gvwbox region을 추출한다.
 * LLM에게 전달할 입력 데이터를 좁힌다 (페이지 전체 대신 region만).
 *
 * cheerio 네임스페이스 셀렉터(`w2\\:textbox`)는 현재 css-select 버전에서
 * `:textbox` 를 pseudo-class 로 오해해 throw 한다. 따라서 태그 이름은
 * 셀렉터로 거르지 않고, attribute 셀렉터(`[label]`)로 후보를 모은 뒤
 * `el.tagName` 문자열 비교(`w2:column` 등 콜론 포함 원형 유지)로 필터링한다.
 */
import * as cheerio from 'cheerio';

export interface SchboxRegion {
  kind: 'schbox';
  labels: string[];
  fields: Array<{ label: string; componentId: string }>;
  innerXml: string;
  screenName?: string;
}

export interface GvwboxRegion {
  kind: 'gvwbox';
  columns: Array<{ label: string; bodyId: string }>;
  innerXml: string;
  screenName?: string;
}

export type Region = SchboxRegion | GvwboxRegion;

/** cheerio 가 보존하는 태그 원형(`w2:textbox` 등)과 비교. 대소문자 무시. */
function tagNameOf(el: unknown): string {
  const node = el as { tagName?: string; name?: string };
  return (node.tagName ?? node.name ?? '').toLowerCase();
}

function hasClass(classAttr: string | undefined, name: string): boolean {
  return (classAttr ?? '').split(/\s+/).includes(name);
}

export function extractRegions(xml: string): Region[] {
  const $ = cheerio.load(xml, { xmlMode: true });

  const head = $('head').first();
  const screenName = head.attr('meta_screenName') || undefined;

  const regions: Region[] = [];

  // class="schbox" 정확히 매칭 (schbox_inner 같은 변형 제외)
  $('[class*="schbox"]').each((_, el) => {
    const $el = $(el);
    if (!hasClass($el.attr('class'), 'schbox')) return;

    const labels: string[] = [];
    const fields: Array<{ label: string; componentId: string }> = [];
    const INPUT_TAGS = ['xf:input', 'xf:select1', 'xf:select', 'xf:textarea', 'w2:inputcalendar', 'w2:autocomplete'];

    // 문서 순서로 descendant 순회: w2:textbox → labels 누적, input → 직전 label 과 페어링
    $el.find('*').each((_2, node) => {
      const tag = tagNameOf(node);
      if (tag === 'w2:textbox') {
        const lbl = $(node).attr('label');
        if (lbl) labels.push(lbl);
        return;
      }
      if (INPUT_TAGS.includes(tag)) {
        const id = $(node).attr('id');
        if (!id) return;
        const ownLabel = $(node).attr('label');
        const label = ownLabel || labels[labels.length - 1] || '';
        fields.push({ label, componentId: id });
      }
    });

    regions.push({
      kind: 'schbox',
      labels,
      fields,
      innerXml: $.xml($el),
      screenName,
    });
  });

  // class="gvwbox" 정확히 매칭
  $('[class*="gvwbox"]').each((_, el) => {
    const $el = $(el);
    if (!hasClass($el.attr('class'), 'gvwbox')) return;

    // header / gBody 컨테이너를 id 셀렉터로 잡고 그 하위 w2:column 만 수집
    const headerCols = $el
      .find('[id]')
      .filter((_, c) => tagNameOf(c) === 'w2:header')
      .first()
      .find('[id]')
      .filter((_, c) => tagNameOf(c) === 'w2:column')
      .toArray();
    const bodyCols = $el
      .find('[id]')
      .filter((_, c) => tagNameOf(c) === 'w2:gbody')
      .first()
      .find('[id]')
      .filter((_, c) => tagNameOf(c) === 'w2:column')
      .toArray();

    const columns: Array<{ label: string; bodyId: string }> = [];
    const len = Math.min(headerCols.length, bodyCols.length);
    for (let i = 0; i < len; i++) {
      const label = $(headerCols[i]).attr('value') || '';
      const bodyId = $(bodyCols[i]).attr('id') || '';
      columns.push({ label, bodyId });
    }

    regions.push({
      kind: 'gvwbox',
      columns,
      innerXml: $.xml($el),
      screenName,
    });
  });

  return regions;
}
