import { describe, expect, it } from 'vitest';
import { extractSearchButtons, findGroupEnd, findSearchGroupBlock, hasSearchButton, transformSearchBlock } from '../../src/stage3/schbox-normalizer';

const SEARCH_XML = `<body>
  <xf:group class="tblbox" id="grp_search_001" meta_snippetName="x">
    <xf:group class="w2tb tbl" tagname="table">
      <xf:group tagname="tr">
        <xf:group class="w2tb_th" tagname="th"><w2:textbox label="부서"/></xf:group>
        <xf:group class="w2tb_td" tagname="td">
          <xf:select1 id="sbx_deptCd" label="부서"/>
          <xf:trigger ctype="Button" id="btn_006" type="button"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>
        </xf:group>
      </xf:group>
    </xf:group>
  </xf:group>
  <xf:group class="gvwbox"><w2:gridView id="grd_007"></w2:gridView></xf:group>
</body>`;

describe('findGroupEnd', () => {
  it('중첩 xf:group의 매칭 닫는 태그 인덱스 반환', () => {
    const openStart = SEARCH_XML.indexOf('<xf:group class="tblbox"');
    const end = findGroupEnd(SEARCH_XML, openStart);
    const block = SEARCH_XML.slice(openStart, end);
    expect(block.startsWith('<xf:group class="tblbox"')).toBe(true);
    expect(block.endsWith('</xf:group>')).toBe(true);
    expect(block).toContain('sbx_deptCd');
    expect(block).toContain('btn_006');
    expect(block).not.toContain('gvwbox');
  });

  it('self-closing xf:group은 depth에 영향 없음', () => {
    const xml = `<xf:group id="a"><xf:group id="b" tagname="col"/><xf:group id="c"></xf:group></xf:group>TAIL`;
    const end = findGroupEnd(xml, 0);
    expect(xml.slice(0, end)).toBe(`<xf:group id="a"><xf:group id="b" tagname="col"/><xf:group id="c"></xf:group></xf:group>`);
    expect(xml.slice(end)).toBe('TAIL');
  });

  it('불균형이면 -1', () => {
    const end = findGroupEnd('<xf:group id="a"><xf:group id="b">', 0);
    expect(end).toBe(-1);
  });
});

describe('hasSearchButton', () => {
  it('조회/검색/초기화 라벨 trigger 있으면 true', () => {
    expect(hasSearchButton('<xf:trigger><xf:label><![CDATA[조회]]></xf:label></xf:trigger>')).toBe(true);
    expect(hasSearchButton('<xf:trigger><xf:label><![CDATA[초기화]]></xf:label></xf:trigger>')).toBe(true);
  });
  it('검색 라벨 없으면 false', () => {
    expect(hasSearchButton('<xf:trigger><xf:label><![CDATA[저장]]></xf:label></xf:trigger>')).toBe(false);
  });
});

describe('findSearchGroupBlock', () => {
  it('grp_search + 검색버튼 동시 충족 그룹 반환', () => {
    const sg = findSearchGroupBlock(SEARCH_XML);
    expect(sg).not.toBeNull();
    expect(sg!.block).toContain('grp_search_001');
    expect(sg!.block).toContain('btn_006');
    expect(SEARCH_XML.slice(sg!.start, sg!.end)).toBe(sg!.block);
  });

  it('grp_search 없으면 null', () => {
    const xml = `<body><xf:group class="tblbox" id="grp_other"><xf:trigger><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group></body>`;
    expect(findSearchGroupBlock(xml)).toBeNull();
  });

  it('grp_search지만 검색버튼 없으면 null', () => {
    const xml = `<body><xf:group class="tblbox" id="grp_search_001"><xf:trigger><xf:label><![CDATA[저장]]></xf:label></xf:trigger></xf:group></body>`;
    expect(findSearchGroupBlock(xml)).toBeNull();
  });
});

describe('extractSearchButtons', () => {
  it('조회 버튼을 추출하고 폼에서 제거', () => {
    const block = `<xf:group class="w2tb_td" tagname="td"><xf:select1 id="sbx_deptCd"/><xf:trigger id="btn_006"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>`;
    const { buttons, rest } = extractSearchButtons(block);
    expect(buttons.length).toBe(1);
    expect(buttons[0]).toContain('btn_006');
    expect(buttons[0]).toContain('조회');
    expect(rest).not.toContain('btn_006');
    expect(rest).toContain('sbx_deptCd');  // 폼 요소는 남음
  });

  it('검색 아닌 trigger는 보존', () => {
    const block = `<xf:trigger id="btn_save"><xf:label><![CDATA[저장]]></xf:label></xf:trigger>`;
    const { buttons, rest } = extractSearchButtons(block);
    expect(buttons.length).toBe(0);
    expect(rest).toContain('btn_save');
  });

  it('조회+초기화 둘 다 추출', () => {
    const block = `<xf:trigger id="b1"><xf:label><![CDATA[조회]]></xf:label></xf:trigger><xf:trigger id="b2"><xf:label><![CDATA[초기화]]></xf:label></xf:trigger>`;
    const { buttons, rest } = extractSearchButtons(block);
    expect(buttons.length).toBe(2);
    expect(rest.replace(/\s/g, '')).toBe('');
  });
});

const GRP_SEARCH_BLOCK = `<xf:group class="tblbox" id="grp_search_001" meta_snippetName="x">
  <xf:group class="w2tb tbl" tagname="table">
    <xf:group tagname="tr">
      <xf:group class="w2tb_th" tagname="th"><w2:textbox label="부서"/></xf:group>
      <xf:group class="w2tb_td" tagname="td">
        <xf:select1 id="sbx_deptCd" label="부서"/>
        <xf:trigger ctype="Button" id="btn_006" type="button"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>
      </xf:group>
    </xf:group>
  </xf:group>
</xf:group>`;

describe('transformSearchBlock', () => {
  it('schbox + schbox_inner#tbl_search + btn_schbox 구조 생성', () => {
    const out = transformSearchBlock(GRP_SEARCH_BLOCK);
    expect(out).toMatch(/^<xf:group\b[^>]*class="[^"]*\bschbox\b/);
    expect(out).not.toContain('tblbox');
    expect(out).not.toContain('grp_search_001');
    expect(out).toContain('<xf:group class="schbox_inner" id="tbl_search">');
    expect(out).toMatch(/<xf:group class="schbox_inner" id="tbl_search">\s*<xf:group class="w2tb tbl"/);
    expect(out).toContain('<xf:group class="btn_schbox">');
    expect(out).toContain('btn_006');
    expect(out).toContain('<![CDATA[조회]]>');
    // 버튼은 btn_schbox 안에 있고, btn_schbox는 schbox_inner(폼) 뒤에 온다
    expect(out.indexOf('btn_schbox')).toBeGreaterThan(out.indexOf('schbox_inner'));
    expect(out.indexOf('btn_006')).toBeGreaterThan(out.indexOf('btn_schbox'));
    // 폼(td) 영역엔 검색버튼이 남아있지 않다
    const tdStart = out.indexOf('w2tb_td');
    const tdEnd = out.indexOf('</xf:group>', out.indexOf('sbx_deptCd'));
    expect(out.slice(tdStart, tdEnd)).not.toContain('btn_006');
    expect(out).toMatch(/w2tb_td[\s\S]*sbx_deptCd/);
  });

  it('CDATA 라벨 정확히 보존', () => {
    const out = transformSearchBlock(GRP_SEARCH_BLOCK);
    expect(out).toContain('<xf:label><![CDATA[조회]]></xf:label>');
  });

  it('검색버튼 없는 블록은 그대로(no-op)', () => {
    const block = `<xf:group class="tblbox" id="grp_search_001"><xf:group class="w2tb tbl"><xf:input id="x"/></xf:group></xf:group>`;
    expect(transformSearchBlock(block)).toBe(block);
  });
});
