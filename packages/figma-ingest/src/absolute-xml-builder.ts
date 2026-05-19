/**
 * Stage 1: 컴포넌트 리스트 → ABSOLUTE-coord WebSquare XML.
 * legacy xml-generator.js의 TS 포팅 (의미 동일).
 */
import type { ComponentSpec, ScreenMeta, LegacyCtype } from './types';

const XMLNS = {
  xhtml: 'http://www.w3.org/1999/xhtml',
  ev: 'http://www.w3.org/2001/xml-events',
  w2: 'http://www.inswave.com/websquare',
  xf: 'http://www.w3.org/2002/xforms',
};

interface TagMapping { ns: 'w2'|'xf'; tag: string; ctype: string; }
const TAG_MAP: Record<LegacyCtype, TagMapping> = {
  Text:      { ns: 'w2', tag: 'textbox',       ctype: 'Text' },
  Desc:      { ns: 'w2', tag: 'textbox',       ctype: 'Text' },
  Edit:      { ns: 'xf', tag: 'input',         ctype: 'Edit' },
  Calendar:  { ns: 'xf', tag: 'inputCalendar', ctype: 'Calendar' },
  SelectBox: { ns: 'xf', tag: 'select1',       ctype: 'SelectBox' },
  CheckBox:  { ns: 'xf', tag: 'checkbox',      ctype: 'CheckBox' },
  TextArea:  { ns: 'xf', tag: 'textarea',      ctype: 'TextArea' },
  Button:    { ns: 'xf', tag: 'trigger',       ctype: 'Button' },
  Trigger:   { ns: 'xf', tag: 'trigger',       ctype: 'Button' },
  GridView:  { ns: 'w2', tag: 'gridView',      ctype: 'IBSheet' },
  Group:     { ns: 'xf', tag: 'group',         ctype: 'GroupBox' },
  GroupBox:  { ns: 'xf', tag: 'group',         ctype: 'GroupBox' },
  Radio:     { ns: 'xf', tag: 'select1',       ctype: 'RadioButton' },
  Image:     { ns: 'xf', tag: 'output',        ctype: 'Image' },
  Tab:       { ns: 'w2', tag: 'tabControl',    ctype: 'Tab' },
};

function escapeXml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCdata(s: string): string {
  return String(s || '').replace(/\]\]>/g, ']]]]><![CDATA[>');
}

function buildStyle(c: ComponentSpec): string {
  const parts = ['position:absolute'];
  if (c.left != null) parts.push(`left:${c.left}px`);
  if (c.top != null) parts.push(`top:${c.top}px`);
  if (c.width) parts.push(`width:${c.width}px`);
  if (c.height) parts.push(`height:${c.height}px`);
  return parts.join('; ') + ';';
}

function genComponent(c: ComponentSpec, indent: number): string {
  const m = TAG_MAP[c.ctype];
  const pad = '\t'.repeat(indent);
  const style = buildStyle(c);
  const id = escapeXml(c.id || '');
  const label = escapeXml(c.label || '');

  if (c.ctype === 'Button' || c.ctype === 'Trigger') {
    return [
      `${pad}<${m.ns}:${m.tag} ctype="${m.ctype}" style="${style}" id="${id}" tabIndex="1" type="button">`,
      `${pad}\t<xf:label><![CDATA[${escapeCdata(c.label || '')}]]></xf:label>`,
      `${pad}</${m.ns}:${m.tag}>`,
    ].join('\n');
  }

  if (c.ctype === 'GridView') {
    const cols = c.columns || [];
    let xml = `${pad}<${m.ns}:${m.tag} ctype="${m.ctype}" style="${style}" id="${id}" tabIndex="1">`;
    if (cols.length > 0) {
      xml += `\n${pad}\t<w2:header id="header1">\n${pad}\t\t<w2:row>`;
      cols.forEach((col, i) => {
        xml += `\n${pad}\t\t\t<w2:column id="column${i + 1}" inputType="text" value="${escapeXml(col.label || col.id || '')}" width="${col.width || 100}"/>`;
      });
      xml += `\n${pad}\t\t</w2:row>\n${pad}\t</w2:header>`;
      xml += `\n${pad}\t<w2:gBody id="gBody1">\n${pad}\t\t<w2:row>`;
      cols.forEach(col => {
        xml += `\n${pad}\t\t\t<w2:column id="${escapeXml(col.id || '')}" inputType="text" width="${col.width || 100}"/>`;
      });
      xml += `\n${pad}\t\t</w2:row>\n${pad}\t</w2:gBody>`;
    }
    xml += `\n${pad}</${m.ns}:${m.tag}>`;
    return xml;
  }

  let attrs = `ctype="${m.ctype}" style="${style}" id="${id}"`;
  if (label) attrs += ` label="${label}"`;
  if (c.maxlength) attrs += ` maxlength="${c.maxlength}"`;
  attrs += ` tabIndex="1"`;
  return `${pad}<${m.ns}:${m.tag} ${attrs}/>`;
}

const FORM_CTYPES = new Set<LegacyCtype>([
  'Edit', 'SelectBox', 'Calendar', 'CheckBox', 'Radio', 'TextArea',
]);
const BLOCK_CTYPES = new Set<LegacyCtype>(['GridView', 'Tab']);
const LABELLIKE_CTYPES = new Set<LegacyCtype>(['Text', 'Desc']);

interface LayoutGroup {
  kind: 'searchForm' | 'flat';
  comps: ComponentSpec[];
}

/**
 * 컴포넌트 리스트를 layout block 단위로 분할한다.
 * 첫 GridView/Tab(이하 'block')이 등장하기 전의 Y-row 클러스터에 form ctype이 포함되어 있으면
 * 그 클러스터를 synthetic `<xf:group ctype="GroupBox" id="grp_search_NNN">`으로 감싼다.
 *
 * 이는 legacy sample-converter가 schbox 분류를 위해 'first GroupBox' 컨테이너를 요구하기 때문에
 * (sample-converter.js:1706-1734) 필요한 최소 보정이다.
 *
 * ⚠️ 알려진 한계 (Phase 2 Semantic Enricher에서 개선 예정):
 *   - Y 클러스터 임계값 30px는 brittle — 라벨이 줄바꿈된 폼은 분리됨
 *   - 같은 Y 클러스터에 H2 타이틀이 있으면 GroupBox에 포함됨 (현 fixture는 영향 없음)
 *   - 자식의 absolute 좌표는 synthetic group 기준으로 재계산되지 않음 — legacy가 fallback으로 처리
 *   - GridView가 없고 Tab만 있는 경우에도 grp_search 가 생성됨
 *
 * 대안 (Phase 2): DOM extraction 단계에서 <form>, <fieldset>, <div class*="search">를
 * 자연스러운 GroupBox 컨테이너로 인식해서 ctype="GroupBox"를 emit. 그러면 이 휴리스틱이 불필요.
 */
function planLayout(components: ComponentSpec[]): LayoutGroup[] {
  // 첫 번째 블록 컴포넌트 위치 찾기
  const firstBlockIdx = components.findIndex(c => BLOCK_CTYPES.has(c.ctype));
  if (firstBlockIdx === -1) {
    return [{ kind: 'flat', comps: components }];
  }

  const pre = components.slice(0, firstBlockIdx);
  const blockAndAfter = components.slice(firstBlockIdx);

  // pre 안에서 같은 Y행 클러스터링 (top 차이 ≤ 30px)
  // 클러스터 안에 FORM_CTYPES이 ≥1개면 검색폼 후보
  if (pre.length === 0) {
    return [{ kind: 'flat', comps: blockAndAfter }];
  }

  // top 기준 정렬 (이미 정렬되어 있을 가능성 높음)
  const sorted = [...pre].sort((a, b) => (a.top - b.top) || (a.left - b.left));
  const clusters: ComponentSpec[][] = [];
  for (const c of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last) {
      clusters.push([c]);
      continue;
    }
    const lastTop = last[last.length - 1].top;
    if (Math.abs(c.top - lastTop) <= 30) {
      last.push(c);
    } else {
      clusters.push([c]);
    }
  }

  // 검색폼 후보 클러스터를 골라낸다
  // - 폼 컴포넌트가 ≥1개 있음
  // - 같은 클러스터의 모든 항목(폼/레이블/버튼)은 GroupBox 안으로 들어감
  // 단일 H2/타이틀(폼/버튼 없음)은 flat 유지
  const groups: LayoutGroup[] = [];
  let searchCount = 0;
  for (const cluster of clusters) {
    const hasForm = cluster.some(c => FORM_CTYPES.has(c.ctype));
    if (hasForm) {
      searchCount++;
      groups.push({ kind: 'searchForm', comps: cluster });
    } else {
      // 폼 없는 클러스터(예: 타이틀 H2만, 또는 btn_area만)는 flat
      groups.push({ kind: 'flat', comps: cluster });
    }
  }
  groups.push({ kind: 'flat', comps: blockAndAfter });
  return groups;
}

export function buildAbsoluteXml(meta: ScreenMeta, components: ComponentSpec[]): string {
  const screenId = escapeXml(meta.screenId);
  const screenName = escapeXml(meta.screenName);
  const w = meta.width;
  const h = meta.height;

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<html xmlns="${XMLNS.xhtml}" xmlns:ev="${XMLNS.ev}" xmlns:w2="${XMLNS.w2}" xmlns:xf="${XMLNS.xf}">`);
  lines.push(`\t<head meta_screenId="${screenId}" meta_screenName="${screenName}">`);
  lines.push(`\t\t<w2:type>COMPONENT</w2:type>`);
  lines.push(`\t\t<w2:buildDate/>`);
  lines.push(`\t\t<xf:model>`);
  lines.push(`\t\t\t<w2:dataCollection>`);
  lines.push(`\t\t\t</w2:dataCollection>`);
  lines.push(`\t\t</xf:model>`);
  lines.push(`\t\t<script type="text/javascript" lazy="false"><![CDATA[`);
  lines.push(`scwin.onpageload = function() {`);
  lines.push(`};`);
  lines.push(`]]></script>`);
  lines.push(`\t</head>`);
  lines.push(`\t<body ev:onpageload="scwin.onpageload">`);
  lines.push(`\t\t<xf:group screentitle="${screenName}" screenno="${screenId}" style="width:${w}px; height:${h}px;" class="content_body">`);

  const plan = planLayout(components);
  let searchIdx = 0;
  for (const group of plan) {
    if (group.kind === 'searchForm') {
      searchIdx++;
      const grpId = `grp_search_${String(searchIdx).padStart(3, '0')}`;
      // schbox 후보로 인식되려면 GroupBox 컨테이너 안에 폼/버튼이 있어야 함
      const tops = group.comps.map(c => c.top);
      const lefts = group.comps.map(c => c.left);
      const rights = group.comps.map(c => c.left + (c.width || 0));
      const bottoms = group.comps.map(c => c.top + (c.height || 0));
      const gLeft = Math.min(...lefts);
      const gTop = Math.min(...tops);
      const gWidth = Math.max(...rights) - gLeft;
      const gHeight = Math.max(...bottoms) - gTop;
      lines.push(`\t\t\t<xf:group ctype="GroupBox" id="${grpId}" style="position:absolute; left:${gLeft}px; top:${gTop}px; width:${gWidth}px; height:${gHeight}px;" tabIndex="1">`);
      group.comps.forEach(c => {
        // 자식 좌표는 부모 기준 상대 — 단, legacy converter는 절대좌표를 누적해서 처리하므로
        // 원본 절대좌표 그대로 두어도 동작한다 (parent offset 누적 분석).
        lines.push(genComponent(c, 4));
      });
      lines.push(`\t\t\t</xf:group>`);
    } else {
      group.comps.forEach(c => {
        lines.push(genComponent(c, 3));
      });
    }
  }

  lines.push(`\t\t</xf:group>`);
  lines.push(`\t</body>`);
  lines.push(`</html>`);
  return lines.join('\n');
}
