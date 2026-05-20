import { describe, expect, it } from 'vitest';
import {
  detectSearchButton,
  detectBoundGrid,
  detectSubmission,
  detectSearchContainer,
} from '../../src/stage3/scwin-scaffolder';

const SIMPLE = `<root>
  <xf:submission id="sbm_search" ev:submitdone="scwin.sbm_search_submitdone"/>
  <xf:group class="schbox_inner" id="tbl_search"><xf:input id="ibx_a"/></xf:group>
  <xf:group class="btn_schbox"><xf:trigger ctype="Button" id="btn_006" type="button" hierarchy="btn_006" orgid="btn_006" class="btn_cm sch"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
  <w2:gridView id="grd_007" orgid="grd_007" dataList="data:dlt_list"></w2:gridView>
</root>`;

describe('detectSearchButton', () => {
  it('class에 sch 토큰 있는 trigger id 반환', () => {
    expect(detectSearchButton(SIMPLE)).toEqual({ id: 'btn_006' });
  });
  it('sch 없으면 null', () => {
    const xml = `<root><xf:trigger id="btn_x" class="btn_cm"><xf:label><![CDATA[저장]]></xf:label></xf:trigger></root>`;
    expect(detectSearchButton(xml)).toBeNull();
  });
  it('class 토큰이 정확히 sch (부분일치 schX 배제)', () => {
    const xml = `<root><xf:trigger id="btn_y" class="btn_cm schedule"><xf:label><![CDATA[일정]]></xf:label></xf:trigger></root>`;
    expect(detectSearchButton(xml)).toBeNull();
  });
});

describe('detectBoundGrid', () => {
  it('dataList 있는 gridView의 {gridId, dltId}', () => {
    expect(detectBoundGrid(SIMPLE)).toEqual({ gridId: 'grd_007', dltId: 'dlt_list' });
  });
  it('dataList 없으면 null', () => {
    const xml = `<root><w2:gridView id="grd_1"></w2:gridView></root>`;
    expect(detectBoundGrid(xml)).toBeNull();
  });
});

describe('detectSubmission', () => {
  it('sbm_search 있으면 true', () => {
    expect(detectSubmission(SIMPLE)).toBe(true);
  });
  it('없으면 false', () => {
    expect(detectSubmission(`<root></root>`)).toBe(false);
  });
});

describe('detectSearchContainer', () => {
  it('tbl_search 있으면 "tbl_search"', () => {
    expect(detectSearchContainer(SIMPLE)).toBe('tbl_search');
  });
  it('없으면 null', () => {
    expect(detectSearchContainer(`<root><xf:group id="other"/></root>`)).toBeNull();
  });
});
