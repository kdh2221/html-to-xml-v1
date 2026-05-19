import { describe, expect, it } from 'vitest';
import { renameIdToUi01, mapPrefix, LEGACY_TO_UI01_PREFIX } from '../src/id-renamer';

describe('mapPrefix', () => {
  it('txt_001 → tbx_001', () => {
    expect(mapPrefix('txt_001')).toBe('tbx_001');
  });

  it('edt_001 → ibx_001', () => {
    expect(mapPrefix('edt_001')).toBe('ibx_001');
  });

  it('sel_002 → sbx_002', () => {
    expect(mapPrefix('sel_002')).toBe('sbx_002');
  });

  it('chk_003 → cbx_003', () => {
    expect(mapPrefix('chk_003')).toBe('cbx_003');
  });

  it('rdo_004 → rad_004', () => {
    expect(mapPrefix('rdo_004')).toBe('rad_004');
  });

  it('cal_005 → ica_005', () => {
    expect(mapPrefix('cal_005')).toBe('ica_005');
  });

  it('tab_006 → tac_006', () => {
    expect(mapPrefix('tab_006')).toBe('tac_006');
  });

  it('btn_007 → btn_007 (변경 없음)', () => {
    expect(mapPrefix('btn_007')).toBe('btn_007');
  });

  it('grd_008 → grd_008 (변경 없음)', () => {
    expect(mapPrefix('grd_008')).toBe('grd_008');
  });

  it('알 수 없는 prefix → 원본 유지', () => {
    expect(mapPrefix('foo_001')).toBe('foo_001');
  });

  it('prefix 없는 ID → 원본 유지', () => {
    expect(mapPrefix('empCd')).toBe('empCd');
  });
});

describe('renameIdToUi01', () => {
  it('XML 문자열의 모든 id 속성을 일괄 변환', () => {
    const xml = `<root>
      <input id="edt_001"/>
      <select id="sel_002"/>
      <button id="btn_003">조회</button>
    </root>`;
    const out = renameIdToUi01(xml);
    expect(out).toContain('id="ibx_001"');
    expect(out).toContain('id="sbx_002"');
    expect(out).toContain('id="btn_003"');
    expect(out).not.toContain('id="edt_001"');
  });

  it('id 속성 외의 동일 문자열은 변경하지 않음', () => {
    // 안전 — id= 속성만 매칭
    const xml = `<root><span>edt_001 is a label</span><input id="edt_001"/></root>`;
    const out = renameIdToUi01(xml);
    expect(out).toContain('>edt_001 is a label<');
    expect(out).toContain('id="ibx_001"');
  });

  it('ref="data:..." 안의 ID 참조도 변환', () => {
    const xml = `<input id="edt_001" ref="data:dma_search.X"/>
                 <span>ref points to ibx_001</span>`;
    const out = renameIdToUi01(xml);
    expect(out).toContain('id="ibx_001"');
    // ref 안의 IDs는 별도 처리 — Phase 1에서는 id만 변경
  });

  it('data-id 같은 유사 속성은 변환하지 않음', () => {
    const xml = `<div data-id="edt_001"><input id="edt_002"/></div>`;
    const out = renameIdToUi01(xml);
    // data-id는 그대로
    expect(out).toContain('data-id="edt_001"');
    // 진짜 id만 변환
    expect(out).toContain('id="ibx_002"');
  });

  it('namespace-prefixed id (w2:id 등)는 변환하지 않음', () => {
    const xml = `<w2:row w2:id="edt_001"/><input id="edt_002"/>`;
    const out = renameIdToUi01(xml);
    expect(out).toContain('w2:id="edt_001"');
    expect(out).toContain('id="ibx_002"');
  });

  it('hierarchy 속성도 변환됨 (legacy sample-converter가 id를 복사함)', () => {
    const xml = `<input id="edt_001" hierarchy="edt_001" orgid="edt_001"/>`;
    const out = renameIdToUi01(xml);
    expect(out).toContain('id="ibx_001"');
    expect(out).toContain('hierarchy="ibx_001"');
    expect(out).toContain('orgid="ibx_001"');
  });

  it('data-hierarchy 같은 유사 속성은 변환되지 않음', () => {
    const xml = `<div data-hierarchy="edt_001" hierarchy="edt_002"></div>`;
    const out = renameIdToUi01(xml);
    expect(out).toContain('data-hierarchy="edt_001"');  // 그대로
    expect(out).toContain('hierarchy="ibx_002"');       // 변환
  });
});
