import { describe, expect, it } from 'vitest';
import {
  detectSearchButton,
  detectBoundGrid,
  detectSubmission,
  detectSearchContainer,
  buildHandlerScript,
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

describe('buildHandlerScript', () => {
  it('검색+grid+sbm (simple-form형): onpageload 3종 + onclick + submitdone', () => {
    const out = buildHandlerScript({
      searchBtn: { id: 'btn_006' },
      boundGrid: { gridId: 'grd_007', dltId: 'dlt_list' },
      hasSubmission: true,
      container: 'tbl_search',
    });
    expect(out).toContain('scwin.onpageload = function() {');
    expect(out).toContain('\t$c.win.setEnterKeyEvent(tbl_search, scwin.btn_006_onclick);');
    expect(out).toContain('\t$c.util.setGridViewDelCheckBox([grd_007]);');
    expect(out).toContain('\t$c.data.setChangeCheckedDc([dlt_list]);');
    expect(out).toContain('scwin.btn_006_onclick = function() {\n\t$c.sbm.execute(sbm_search);\n};');
    expect(out).toContain('scwin.sbm_search_submitdone = function(e) {\n};');
  });

  it('grid만 (master-detail형, sbm 없음): grid 2종, setEnterKeyEvent/onclick/submitdone 없음', () => {
    const out = buildHandlerScript({
      searchBtn: { id: 'btn_004' },
      boundGrid: { gridId: 'grd_005', dltId: 'dlt_memberBasic' },
      hasSubmission: false,
      container: 'tbl_search',
    });
    expect(out).toContain('\t$c.util.setGridViewDelCheckBox([grd_005]);');
    expect(out).toContain('\t$c.data.setChangeCheckedDc([dlt_memberBasic]);');
    expect(out).not.toContain('setEnterKeyEvent');
    expect(out).not.toContain('_onclick = function');
    expect(out).not.toContain('submitdone');
  });

  it('container 없으면 setEnterKeyEvent 생략(grid·onclick·submitdone은 sbm 따라)', () => {
    const out = buildHandlerScript({
      searchBtn: { id: 'btn_1' },
      boundGrid: { gridId: 'grd_1', dltId: 'dlt_1' },
      hasSubmission: true,
      container: null,
    });
    expect(out).not.toContain('setEnterKeyEvent');
    expect(out).toContain('scwin.btn_1_onclick = function()');
    expect(out).toContain('scwin.sbm_search_submitdone');
  });
});

import { replaceOnpageload, injectButtonOnclick, buildHandlerScript as _bhs } from '../../src/stage3/scwin-scaffolder';

describe('buildHandlerScript empty body', () => {
  it('grid·container·없고 sbm만: onpageload 빈 본문 + submitdone', () => {
    const out = _bhs({ searchBtn: null, boundGrid: null, hasSubmission: true, container: null });
    expect(out).toContain('scwin.onpageload = function() {\n};');
    expect(out).toContain('scwin.sbm_search_submitdone = function(e) {\n};');
    expect(out).not.toContain('setEnterKeyEvent');
    expect(out).not.toContain('setGridViewDelCheckBox');
  });
});

describe('replaceOnpageload', () => {
  it('빈 onpageload를 스크립트로 교체 ($c 보존)', () => {
    const xml = `<script><![CDATA[\nscwin.onpageload = function() {\n};\n]]></script>`;
    const script = `scwin.onpageload = function() {\n\t$c.util.setGridViewDelCheckBox([grd_007]);\n};\nscwin.sbm_search_submitdone = function(e) {\n};`;
    const out = replaceOnpageload(xml, script);
    expect(out).toContain('$c.util.setGridViewDelCheckBox([grd_007]);');
    expect(out).toContain('scwin.sbm_search_submitdone = function(e) {');
    expect(out).toContain('<![CDATA[');
    expect(out).toContain(']]></script>');
  });

  it('빈 onpageload 없으면 원본 그대로', () => {
    const xml = `<script><![CDATA[\nscwin.foo = 1;\n]]></script>`;
    expect(replaceOnpageload(xml, 'X')).toBe(xml);
  });
});

describe('injectButtonOnclick', () => {
  it('ev:onclick 부여(없을 때)', () => {
    const xml = `<xf:trigger id="btn_006" class="btn_cm sch"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>`;
    const out = injectButtonOnclick(xml, 'btn_006');
    expect(out).toContain('ev:onclick="scwin.btn_006_onclick"');
    expect(out).toContain('<![CDATA[조회]]>');
  });

  it('이미 ev:onclick 있으면 보존(중복 부여 안 함)', () => {
    const xml = `<xf:trigger id="btn_006" class="btn_cm sch" ev:onclick="scwin.existing"><xf:label><![CDATA[조회]]></xf:label></xf:trigger>`;
    const out = injectButtonOnclick(xml, 'btn_006');
    expect(out).toBe(xml);
    expect((out.match(/ev:onclick=/g) || []).length).toBe(1);
  });
});

import { scaffoldScwinHandlers } from '../../src/stage3/scwin-scaffolder';

const FULL = `<root>
  <xf:submission id="sbm_search" ev:submitdone="scwin.sbm_search_submitdone"/>
  <script type="text/javascript" lazy="false"><![CDATA[
scwin.onpageload = function() {
};
]]></script>
  <xf:group class="schbox_inner" id="tbl_search"><xf:input id="ibx_a"/></xf:group>
  <xf:group class="btn_schbox"><xf:trigger id="btn_006" type="button" class="btn_cm sch"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
  <w2:gridView id="grd_007" dataList="data:dlt_list"></w2:gridView>
</root>`;

describe('scaffoldScwinHandlers (orchestrator)', () => {
  it('simple-form형: onpageload 3종 + 버튼 onclick + submitdone', () => {
    const out = scaffoldScwinHandlers(FULL);
    expect(out).toContain('$c.win.setEnterKeyEvent(tbl_search, scwin.btn_006_onclick);');
    expect(out).toContain('$c.util.setGridViewDelCheckBox([grd_007]);');
    expect(out).toContain('$c.data.setChangeCheckedDc([dlt_list]);');
    expect(out).toContain('scwin.btn_006_onclick = function() {');
    expect(out).toContain('$c.sbm.execute(sbm_search);');
    expect(out).toContain('scwin.sbm_search_submitdone = function(e) {');
    expect(out).toContain('ev:onclick="scwin.btn_006_onclick"');
    expect(out).not.toMatch(/scwin\.onpageload = function\(\) \{\s*\};/);
  });

  it('master-detail형(sbm 없음): grid 2종만, onclick·setEnterKeyEvent·submitdone 없음, 버튼 onclick 미부여', () => {
    const md = `<root>
  <script type="text/javascript" lazy="false"><![CDATA[
scwin.onpageload = function() {
};
]]></script>
  <xf:group class="schbox_inner" id="tbl_search"><xf:input id="ibx_a"/></xf:group>
  <xf:group class="btn_schbox"><xf:trigger id="btn_004" type="button" class="btn_cm sch"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></xf:group>
  <w2:gridView id="grd_005" dataList="data:dlt_memberBasic"></w2:gridView>
</root>`;
    const out = scaffoldScwinHandlers(md);
    expect(out).toContain('$c.util.setGridViewDelCheckBox([grd_005]);');
    expect(out).toContain('$c.data.setChangeCheckedDc([dlt_memberBasic]);');
    expect(out).not.toContain('setEnterKeyEvent');
    expect(out).not.toContain('$c.sbm.execute');
    expect(out).not.toContain('submitdone');
    expect(out).not.toContain('ev:onclick');
  });

  it('no-op: sbm·grid 둘 다 없으면 원본 그대로', () => {
    const xml = `<root>
  <script><![CDATA[
scwin.onpageload = function() {
};
]]></script>
</root>`;
    expect(scaffoldScwinHandlers(xml)).toBe(xml);
  });
});

import { detectSaveButton, detectCancelButton, detectSaveSubmission, detectDetailGroup, buildSaveHandlers } from '../../src/stage3/scwin-scaffolder';

describe('save-flow detectors', () => {
  const XML = `<root>
    <xf:submission id="sbm_save"/>
    <xf:group class="tblbox" id="grp_detail"></xf:group>
    <xf:trigger id="btn_013" class="btn_cm pt"><xf:label><![CDATA[저장]]></xf:label></xf:trigger>
    <xf:trigger id="btn_014" class="btn_cm"><xf:label><![CDATA[취소]]></xf:label></xf:trigger>
  </root>`;
  it('detectSaveButton: 라벨 저장 trigger id', () => {
    expect(detectSaveButton(XML)).toEqual({ id: 'btn_013' });
  });
  it('detectCancelButton: 라벨 취소 trigger id', () => {
    expect(detectCancelButton(XML)).toEqual({ id: 'btn_014' });
  });
  it('detectSaveSubmission / detectDetailGroup', () => {
    expect(detectSaveSubmission(XML)).toBe(true);
    expect(detectDetailGroup(XML)).toBe('grp_detail');
    expect(detectSaveSubmission('<root></root>')).toBe(false);
    expect(detectDetailGroup('<root></root>')).toBeNull();
  });
  it('저장 라벨 없으면 null', () => {
    expect(detectSaveButton('<root><xf:trigger id="b"><xf:label><![CDATA[조회]]></xf:label></xf:trigger></root>')).toBeNull();
  });
});

describe('buildSaveHandlers', () => {
  const GRID = { gridId: 'grd_005', dltId: 'dlt_memberBasic' };
  it('grp_detail 있을 때: validateGroup 포함 저장 + 취소 + submitdone', () => {
    const out = buildSaveHandlers({
      saveBtn: { id: 'btn_013' }, cancelBtn: { id: 'btn_014' },
      hasSaveSubmission: true, detailGroup: 'grp_detail', boundGrid: GRID,
    });
    expect(out).toContain('scwin.btn_013_onclick = async function() {');
    expect(out).toContain('if ($c.data.isModified(dlt_memberBasic)) {');
    expect(out).toContain('if ($c.data.validateGroup(grp_detail)) {');
    expect(out).toContain('if (await $c.win.confirm($c.data.getMessage("MSG_CM_00031"))) {');
    expect(out).toContain('$c.sbm.execute(sbm_save);');
    expect(out).toContain('await $c.win.alert($c.data.getMessage("MSG_CM_00032"));');
    expect(out).toContain('scwin.btn_014_onclick = function() {\n\t$c.data.undoGridView(grd_005);\n};');
    expect(out).toContain('scwin.sbm_save_submitdone = function(e) {\n};');
  });

  it('grp_detail 없을 때: validateGroup 생략', () => {
    const out = buildSaveHandlers({
      saveBtn: { id: 'btn_009' }, cancelBtn: null,
      hasSaveSubmission: true, detailGroup: null, boundGrid: { gridId: 'grd_010', dltId: 'dlt_orderList' },
    });
    expect(out).toContain('scwin.btn_009_onclick = async function() {');
    expect(out).toContain('if ($c.data.isModified(dlt_orderList)) {');
    expect(out).not.toContain('validateGroup');
    expect(out).toContain('$c.sbm.execute(sbm_save);');
    expect(out).not.toContain('undoGridView');
  });

  it('저장버튼·sbm_save 없으면 저장 핸들러 없음 (취소만)', () => {
    const out = buildSaveHandlers({
      saveBtn: null, cancelBtn: { id: 'btn_x' },
      hasSaveSubmission: false, detailGroup: null, boundGrid: GRID,
    });
    expect(out).not.toContain('_onclick = async');
    expect(out).toContain('scwin.btn_x_onclick = function() {\n\t$c.data.undoGridView(grd_005);\n};');
    expect(out).not.toContain('submitdone');
  });
});

describe('scaffoldScwinHandlers — 저장 흐름 통합 (2C-3)', () => {
  const MD = `<root>
  <xf:submission id="sbm_save"/>
  <script type="text/javascript" lazy="false"><![CDATA[
scwin.onpageload = function() {
};
]]></script>
  <xf:group class="tblbox" id="grp_detail"><xf:input id="ibx_empCdDetail" ref="data:dlt_memberBasic.EMP_CD" mandatory="true" label="사번"/></xf:group>
  <w2:gridView id="grd_005" dataList="data:dlt_memberBasic"></w2:gridView>
  <xf:trigger id="btn_013" class="btn_cm pt"><xf:label><![CDATA[저장]]></xf:label></xf:trigger>
  <xf:trigger id="btn_014" class="btn_cm"><xf:label><![CDATA[취소]]></xf:label></xf:trigger>
</root>`;

  it('master-detail형: 저장(validateGroup) + 취소 + submitdone + ev:onclick', () => {
    const out = scaffoldScwinHandlers(MD);
    expect(out).toContain('scwin.btn_013_onclick = async function() {');
    expect(out).toContain('$c.data.validateGroup(grp_detail)');
    expect(out).toContain('$c.sbm.execute(sbm_save);');
    expect(out).toContain('scwin.btn_014_onclick = function() {\n\t$c.data.undoGridView(grd_005);\n};');
    expect(out).toContain('scwin.sbm_save_submitdone = function(e) {');
    expect(out).toMatch(/id="btn_013"[^>]*ev:onclick="scwin.btn_013_onclick"/);
    expect(out).toMatch(/id="btn_014"[^>]*ev:onclick="scwin.btn_014_onclick"/);
    expect(out).toContain('$c.util.setGridViewDelCheckBox([grd_005]);');
    expect(out).not.toMatch(/scwin\.onpageload = function\(\) \{\s*\};/);
  });
});
