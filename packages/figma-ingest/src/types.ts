/**
 * WebSquare 변환 파이프라인의 핵심 타입 정의.
 */

export type LegacyCtype =
  | 'Text' | 'Desc' | 'Edit' | 'Calendar' | 'SelectBox'
  | 'CheckBox' | 'Radio' | 'TextArea' | 'Button' | 'Trigger'
  | 'GridView' | 'Group' | 'GroupBox' | 'Image' | 'Tab';

export interface ComponentSpec {
  id: string;
  rawHtmlId?: string;  // 원본 HTML id (Phase 2 Semantic Enricher가 의미 추론에 사용)
  ctype: LegacyCtype;
  label: string;
  left: number;
  top: number;
  width: number | null;
  height: number | null;
  maxlength?: string;
  columns?: TableColumn[];
  hintRole?: HintRole;
}

export interface TableColumn {
  id: string;
  label: string;
  width: number;
}

export type HintRole =
  | 'schbox' | 'gvwbox' | 'titbox' | 'btnbox' | 'tblbox'
  | 'tabContainer' | 'accordion' | 'unknown';

export interface ScreenMeta {
  screenId: string;
  screenName: string;
  width: number;
  height: number;
}

export interface ExtractionResult {
  meta: ScreenMeta;
  components: ComponentSpec[];
  qualityScore: QualityScore;
}

export interface QualityScore {
  overall: number;
  semanticRatio: number;
  labelIdRatio: number;
  ariaRatio: number;
}
