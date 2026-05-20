import { describe, expect, it } from 'vitest';
import { detectDetailInputs } from '../../src/stage3/detail-binder';

// master-detail형: 검색 schbox(조회버튼) + 상세 tblbox(버튼 없음). Stage 3.5 시점 = pre-rename id, 버튼에 btn_cm sch 없음.
const MD = `<body>
  <xf:group class="schbox">
    <xf:group class="schbox_inner" id="tbl_search"><xf:group class="w2tb tbl">
      <xf:input id="edt_empNm" label="성명"/>
    </xf:group></xf:group>
    <xf:group class="btn_schbox"><xf:trigger id="btn_004" type="button"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
  </xf:group>
  <xf:group class="tblbox">
    <xf:group class="w2tb tbl">
      <xf:input id="edt_empCdDetail" label="사번"/>
      <xf:input id="edt_empNmDetail" label="성명"/>
      <xf:select1 id="sel_deptNmDetail" label="부서명"/>
    </xf:group>
  </xf:group>
</body>`;

describe('detectDetailInputs', () => {
  it('상세 tblbox 입력만 수집 (검색 schbox 입력 제외)', () => {
    const inputs = detectDetailInputs(MD);
    expect(inputs).toEqual([
      { id: 'edt_empCdDetail', label: '사번' },
      { id: 'edt_empNmDetail', label: '성명' },
      { id: 'sel_deptNmDetail', label: '부서명' },
    ]);
    expect(inputs.find(i => i.id === 'edt_empNm')).toBeUndefined();
  });

  it('중첩 케이스(search-grid형): schbox>tblbox>schbox_inner는 상세로 오인 안 함', () => {
    const SG = `<body>
      <xf:group class="grpbox_wrap schbox">
        <xf:group class="tblbox">
          <xf:group class="schbox_inner" id="tbl_search"><xf:group class="w2tb tbl">
            <xf:input id="edt_orderNo" label="주문번호"/>
          </xf:group></xf:group>
        </xf:group>
        <xf:group class="btn_schbox"><xf:trigger id="btn_006"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
      </xf:group>
    </body>`;
    expect(detectDetailInputs(SG)).toEqual([]);
  });

  it('조회버튼 없는 schbox는 상세로 포함 (의미 기반 판정)', () => {
    const xml = `<body>
      <xf:group class="schbox">
        <xf:group class="w2tb tbl"><xf:input id="edt_x" label="항목"/></xf:group>
      </xf:group>
    </body>`;
    expect(detectDetailInputs(xml)).toEqual([{ id: 'edt_x', label: '항목' }]);
  });

  it('폼 영역 없으면 빈 배열', () => {
    expect(detectDetailInputs(`<body><xf:group class="gvwbox"></xf:group></body>`)).toEqual([]);
  });
});
