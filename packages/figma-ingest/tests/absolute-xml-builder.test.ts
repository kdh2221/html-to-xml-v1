import { describe, expect, it } from 'vitest';
import { buildAbsoluteXml } from '../src/absolute-xml-builder';
import type { ComponentSpec, ScreenMeta } from '../src/types';

const meta: ScreenMeta = {
  screenId: 'TEST001',
  screenName: '테스트',
  width: 1056,
  height: 600,
};

describe('buildAbsoluteXml', () => {
  it('기본 XML 골격 생성', () => {
    const xml = buildAbsoluteXml(meta, []);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns:w2="http://www.inswave.com/websquare"');
    expect(xml).toContain('xmlns:xf="http://www.w3.org/2002/xforms"');
    expect(xml).toContain('meta_screenId="TEST001"');
    expect(xml).toContain('meta_screenName="테스트"');
    expect(xml).toContain('<w2:dataCollection>');
    expect(xml).toContain('<body ev:onpageload="scwin.onpageload">');
  });

  it('Edit 컴포넌트 → xf:input', () => {
    const comps: ComponentSpec[] = [{
      id: 'edt_001', ctype: 'Edit', label: '사번',
      left: 100, top: 50, width: 150, height: 24,
    }];
    const xml = buildAbsoluteXml(meta, comps);
    expect(xml).toMatch(/<xf:input[^>]*ctype="Edit"[^>]*id="edt_001"/);
    expect(xml).toContain('left:100px');
    expect(xml).toContain('top:50px');
  });

  it('Button → xf:trigger with xf:label child', () => {
    const comps: ComponentSpec[] = [{
      id: 'btn_001', ctype: 'Button', label: '조회',
      left: 300, top: 50, width: 60, height: 30,
    }];
    const xml = buildAbsoluteXml(meta, comps);
    expect(xml).toMatch(/<xf:trigger[^>]*id="btn_001"/);
    expect(xml).toContain('<![CDATA[조회]]>');
    expect(xml).toContain('</xf:trigger>');
  });

  it('GridView → w2:gridView with header + gBody', () => {
    const comps: ComponentSpec[] = [{
      id: 'grd_001', ctype: 'GridView', label: '',
      left: 0, top: 100, width: 800, height: 200,
      columns: [
        { id: 'col1', label: '사번', width: 100 },
        { id: 'col2', label: '성명', width: 100 },
      ],
    }];
    const xml = buildAbsoluteXml(meta, comps);
    expect(xml).toContain('<w2:gridView');
    expect(xml).toContain('<w2:header id="header1">');
    expect(xml).toContain('<w2:gBody id="gBody1">');
    expect(xml).toMatch(/value="사번"/);
  });

  it('Edit+SelectBox+Button+GridView → 사전 컴포넌트가 synthetic GroupBox에 감싸짐', () => {
    const comps: ComponentSpec[] = [
      { id: 'edt_001', ctype: 'Edit', label: '사번', left: 100, top: 50, width: 150, height: 24 },
      { id: 'sbx_001', ctype: 'SelectBox', label: '부서', left: 280, top: 50, width: 150, height: 24 },
      { id: 'btn_001', ctype: 'Button', label: '조회', left: 460, top: 50, width: 60, height: 30 },
      { id: 'grd_001', ctype: 'GridView', label: '', left: 0, top: 120, width: 800, height: 200,
        columns: [{ id: 'c1', label: 'col1', width: 100 }] },
    ];
    const xml = buildAbsoluteXml(meta, comps);
    // GroupBox wrapper가 GridView 앞에 등장
    expect(xml).toMatch(/<xf:group[^>]*ctype="GroupBox"[^>]*id="grp_search_/);
    // 폼 3개가 GroupBox 안에
    const groupMatch = xml.match(/<xf:group[^>]*ctype="GroupBox"[\s\S]*?<\/xf:group>/);
    expect(groupMatch).toBeTruthy();
    expect(groupMatch![0]).toContain('id="edt_001"');
    expect(groupMatch![0]).toContain('id="sbx_001"');
    expect(groupMatch![0]).toContain('id="btn_001"');
  });

  it('GridView 단독 (앞에 폼 없음) → synthetic GroupBox 미생성', () => {
    const comps: ComponentSpec[] = [
      { id: 'grd_001', ctype: 'GridView', label: '', left: 0, top: 0, width: 800, height: 200,
        columns: [{ id: 'c1', label: 'col1', width: 100 }] },
    ];
    const xml = buildAbsoluteXml(meta, comps);
    expect(xml).not.toContain('id="grp_search_');
    expect(xml).not.toMatch(/<xf:group[^>]*ctype="GroupBox"[^>]*id="grp_search_/);
  });
});
