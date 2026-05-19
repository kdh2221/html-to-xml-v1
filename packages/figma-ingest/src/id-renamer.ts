/**
 * Legacy 변환 도구는 ID prefix로 txt_/edt_/sel_/chk_/rdo_/cal_/tab_ 등을 사용한다.
 * deepsquare CodeRules UI-01은 tbx_/ibx_/sbx_/cbx_/rad_/ica_/tac_ 등을 요구한다.
 * 이 모듈은 ID prefix만 변환한다 (의미 명명은 Phase 2 Semantic Enricher에서).
 */

export const LEGACY_TO_UI01_PREFIX: Record<string, string> = {
  txt_: 'tbx_',  // 텍스트박스
  edt_: 'ibx_',  // input
  sel_: 'sbx_',  // select1 (minimal)
  chk_: 'cbx_',  // checkbox
  rdo_: 'rad_',  // radio
  cal_: 'ica_',  // inputCalendar
  tab_: 'tac_',  // tabControl
  txa_: 'txa_',  // textarea (동일)
  btn_: 'btn_',  // trigger (동일)
  grd_: 'grd_',  // gridView (동일)
  grp_: 'grp_',  // group (동일)
  img_: 'img_',  // image (동일)
  pfm_: 'pfm_',  // pageFrame (동일)
};

export function mapPrefix(id: string): string {
  for (const [legacy, ui01] of Object.entries(LEGACY_TO_UI01_PREFIX)) {
    if (id.startsWith(legacy)) {
      return ui01 + id.slice(legacy.length);
    }
  }
  return id;
}

/**
 * XML 문자열에서 id="...", hierarchy="...", orgid="..." 속성값을 안전하게 변환한다.
 * legacy converter는 hierarchy/orgid에 원본 ID를 복사하므로 함께 처리해야 일관성 유지.
 * 텍스트 컨텐츠나 다른 속성은 건드리지 않는다.
 */
const ID_ATTRS = ['id', 'hierarchy', 'orgid'];

export function renameIdToUi01(xml: string): string {
  let result = xml;
  for (const attr of ID_ATTRS) {
    const re = new RegExp(`(^|[\\s])${attr}="([^"]+)"`, 'g');
    result = result.replace(re, (_match, prefix, idValue) => {
      return `${prefix}${attr}="${mapPrefix(idValue)}"`;
    });
  }
  return result;
}
